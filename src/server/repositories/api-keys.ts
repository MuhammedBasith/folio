import type { ApiKeyScope } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { ApiError, notFound } from "@/server/api/errors";
import {
  type ApiKeyRejection,
  apiKeyUsability,
  expiryFromDays,
  generateApiKey,
  hashApiKey,
  isWellFormedApiKey,
  shouldRecordUse,
} from "@/server/auth/api-key";
import {
  type ApiKeyDto,
  type ApiKeyStatus,
  MAX_ACTIVE_API_KEYS,
} from "@/lib/schemas/api-key";
import { lockUserForKeyWrite } from "./lock";

/**
 * API key persistence.
 *
 * TENANT ISOLATION, as everywhere else in this directory: every function that
 * reads or writes an existing key takes `ownerId` and filters on it. There is
 * no code path that loads a key by id alone, so revoking somebody else's key is
 * not a mistake that can be made here; it reports 404, never 403, so the API
 * does not confirm that another account's key exists.
 *
 * `authenticateApiKey` is the exception that proves the rule: it looks a key up
 * by hash with no owner filter, because establishing WHO the caller is is
 * precisely what it exists to do. It is the only such function, and what it
 * returns is the owner id that every subsequent query is then scoped by.
 */

/** Columns needed to authenticate. Note that `hash` is never selected back. */
const AUTH_SELECT = {
  id: true,
  scope: true,
  revokedAt: true,
  expiresAt: true,
  lastUsedAt: true,
  ownerId: true,
  owner: { select: { email: true } },
} as const;

const DTO_SELECT = {
  id: true,
  name: true,
  last4: true,
  scope: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
} as const;

interface ApiKeyRow {
  id: string;
  name: string;
  last4: string;
  scope: ApiKeyScope;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Maps a row to the API shape.
 *
 * `status` is DERIVED here rather than stored, for the same reason order status
 * is: "expired" is a fact about the clock, and a column saying `active` becomes
 * a lie the moment time passes with no write to correct it.
 */
export function toApiKeyDto(key: ApiKeyRow, asOf: Date): ApiKeyDto {
  const usability = apiKeyUsability(key, asOf);

  const status: ApiKeyStatus = usability.usable ? "active" : usability.reason;

  return {
    id: key.id,
    name: key.name,
    last4: key.last4,
    scope: key.scope,
    status,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

export interface AuthenticatedApiKey {
  id: string;
  ownerId: string;
  email: string;
  scope: ApiKeyScope;
}

export type ApiKeyAuthResult =
  | { ok: true; key: AuthenticatedApiKey }
  | { ok: false; reason: "unknown" | ApiKeyRejection };

/**
 * Resolves a presented key to its owner.
 *
 * THE REJECTION REASON IS DELIBERATELY SPECIFIC, and that is worth defending,
 * because this codebase is otherwise careful to say as little as possible when
 * refusing (see `notFound`). The difference is what it costs to reach the
 * message. A 404 on an order is reachable by guessing an id. Reaching
 * "revoked" or "expired" here requires presenting the exact 256-bit secret,
 * which means the caller already holds, or once held, that key. Telling them a
 * credential they possess has been turned off discloses nothing they could not
 * establish by trying it, and turns a silent, baffling outage into a one line
 * fix. Anything not matching a stored hash gets the same flat `unknown` as
 * random noise.
 *
 * NO OWNER FILTER, on purpose: identifying the caller is the job. Everything
 * downstream is scoped by the `ownerId` this returns.
 */
export async function authenticateApiKey(
  token: string,
  now: Date = new Date(),
): Promise<ApiKeyAuthResult> {
  /**
   * Shape first, database second. A flood of junk Authorization headers is
   * refused by a regex rather than costing one index probe apiece, and this is
   * an unauthenticated code path, so that difference is the difference between
   * a nuisance and a way to load the database for free.
   */
  if (!isWellFormedApiKey(token)) {
    return { ok: false, reason: "unknown" };
  }

  const key = await prisma.apiKey.findUnique({
    where: { hash: hashApiKey(token) },
    select: AUTH_SELECT,
  });

  if (!key) {
    return { ok: false, reason: "unknown" };
  }

  const usability = apiKeyUsability(key, now);

  if (!usability.usable) {
    return { ok: false, reason: usability.reason };
  }

  await recordUse(key.id, key.lastUsedAt, now);

  return {
    ok: true,
    key: {
      id: key.id,
      ownerId: key.ownerId,
      email: key.owner.email,
      scope: key.scope,
    },
  };
}

/**
 * Stamps `lastUsedAt`, at most once a minute per key.
 *
 * AWAITED RATHER THAN FIRE AND FORGOT. An unawaited promise on a serverless
 * platform races the response: the instance may be frozen the moment the
 * handler returns, and the write is simply lost. Losing it defeats the only
 * reason the column exists, which is for an owner to notice that a key they had
 * forgotten about was used an hour ago. Throttled to once a minute, the cost is
 * one indexed UPDATE per key per minute, which is not a number worth optimising
 * against correctness.
 *
 * THE CATCH IS LOAD-BEARING. This is telemetry. If the write fails, the key is
 * still valid and the request must still succeed: letting a failed bookkeeping
 * write reject a good credential would turn a transient database hiccup into an
 * outage for every automation the account runs.
 *
 * Only successful authentications are recorded. Stamping failed attempts would
 * hand anyone holding a revoked key an unauthenticated write primitive, and
 * would make the column mean two different things at once.
 */
async function recordUse(
  keyId: string,
  lastUsedAt: Date | null,
  now: Date,
): Promise<void> {
  if (!shouldRecordUse(lastUsedAt, now)) return;

  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: now },
    });
  } catch (error) {
    console.error("[api-key] could not record last use", error);
  }
}

/* ------------------------------------------------------------------ */
/* Management                                                          */
/* ------------------------------------------------------------------ */

/**
 * Newest first: the key somebody is looking for is usually the one just made.
 *
 * THE TIEBREAK ON `id` IS NOT DECORATION. `createdAt` is a `TIMESTAMP(3)`, so
 * its resolution is one millisecond, and creating two keys in the same
 * millisecond is entirely possible from a script or a double-clicked button.
 * With `createdAt` alone the planner is then free to return those rows in any
 * order it likes, and to return a DIFFERENT order on the next request. On a
 * screen whose whole purpose is "revoke the right one", a list that silently
 * reshuffles between page loads is worse than one in the wrong order.
 *
 * `id` is a cuid and therefore not chronological, so this does not rescue the
 * ordering WITHIN a millisecond; it makes it deterministic, which is the
 * property that actually matters here. Caught by a test that created two keys
 * fast enough to collide.
 */
export async function listApiKeys(
  ownerId: string,
  asOf: Date = new Date(),
): Promise<ApiKeyDto[]> {
  const keys = await prisma.apiKey.findMany({
    where: { ownerId },
    select: DTO_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return keys.map((key) => toApiKeyDto(key, asOf));
}

export interface CreateApiKeyOptions {
  name: string;
  scope: ApiKeyScope;
  /** Null means the key does not expire. */
  expiresInDays: number | null;
}

export interface CreatedApiKey {
  apiKey: ApiKeyDto;
  /** Plaintext. Returned once, stored nowhere, unrecoverable afterwards. */
  key: string;
}

/**
 * Mints a key.
 *
 * The count and the insert run in one transaction holding a lock on the owner
 * row, so the cap cannot be walked past by firing two creates at once. See
 * `lockUserForKeyWrite` for why the lock is on the user rather than on the keys.
 *
 * A unique violation on `hash` is NOT retried. It would mean two different
 * calls to `randomBytes(32)` produced identical output, which does not happen
 * for reasons that are not probabilistic hand-waving; if it ever did, the
 * correct behaviour is a loud 500, because the platform's randomness is broken
 * and quietly minting a second key would be the worst possible response.
 */
export async function createApiKey(
  ownerId: string,
  options: CreateApiKeyOptions,
  now: Date = new Date(),
): Promise<CreatedApiKey> {
  const generated = generateApiKey();

  return prisma.$transaction(async (tx) => {
    await lockUserForKeyWrite(tx, ownerId);

    const active = await tx.apiKey.count({
      where: activeKeyFilter(ownerId, now),
    });

    if (active >= MAX_ACTIVE_API_KEYS) {
      throw new ApiError({
        status: 409,
        code: "API_KEY_LIMIT_REACHED",
        message: `You already have ${MAX_ACTIVE_API_KEYS} active API keys, which is the maximum. Revoke one you no longer use to make room.`,
        details: { maxActiveKeys: MAX_ACTIVE_API_KEYS, activeKeys: active },
      });
    }

    const created = await tx.apiKey.create({
      data: {
        ownerId,
        hash: generated.hash,
        last4: generated.last4,
        name: options.name,
        scope: options.scope,
        expiresAt: expiryFromDays(options.expiresInDays, now),
      },
      select: DTO_SELECT,
    });

    return { apiKey: toApiKeyDto(created, now), key: generated.key };
  });
}

/**
 * Revokes a key.
 *
 * IDEMPOTENT. Revoking an already revoked key succeeds and returns it
 * unchanged, rather than failing. This is the button somebody presses when they
 * think a key has leaked, possibly twice because the first press did not
 * visibly do anything; making the second press an error would be actively
 * hostile at the exact moment the product needs to be calm.
 *
 * The update is a tenant-scoped `updateMany` guarded on `revokedAt: null`,
 * which makes it atomic: two simultaneous revocations cannot have the second
 * overwrite the first's timestamp, and the ownership predicate lives in the
 * same statement as the write rather than in a preceding read that a concurrent
 * change could invalidate.
 */
export async function revokeApiKey(
  ownerId: string,
  keyId: string,
  now: Date = new Date(),
): Promise<ApiKeyDto> {
  await prisma.apiKey.updateMany({
    where: { id: keyId, ownerId, revokedAt: null },
    data: { revokedAt: now },
  });

  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, ownerId },
    select: DTO_SELECT,
  });

  /**
   * Reached when the id does not exist OR belongs to someone else, which the
   * `updateMany` above will have matched zero rows for in either case. Both
   * report 404: a 403 would confirm that another account holds that key.
   */
  if (!key) {
    throw notFound("API key");
  }

  return toApiKeyDto(key, now);
}

/**
 * What counts as "active" for the cap.
 *
 * `gt: now` mirrors the exclusive boundary in `apiKeyUsability`: a key expires
 * AT `expiresAt`, so one whose moment has exactly arrived is already expired
 * and no longer occupies a slot. Written once, here, so the count and the
 * authenticator cannot drift into disagreeing about what "active" means.
 */
function activeKeyFilter(ownerId: string, now: Date) {
  return {
    ownerId,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
