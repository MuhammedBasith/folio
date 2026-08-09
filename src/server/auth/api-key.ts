import { createHash, randomBytes } from "node:crypto";

/**
 * API key material.
 *
 * Everything in this file is PURE: it generates, hashes and inspects, and it
 * never touches the database. Persistence and lookup live in
 * `src/server/repositories/api-keys.ts`, the same way every other table in this
 * codebase is reached. That split is what makes the security-critical half
 * (format, entropy, hashing, expiry arithmetic) testable without a database, so
 * it is tested exhaustively rather than incidentally.
 *
 * WHY API KEYS EXIST ALONGSIDE SESSIONS. A session is a seven-day JWT obtained
 * by posting a password, which is right for a browser and wrong for a machine:
 * it expires in the middle of an automation, it cannot be revoked on its own,
 * and getting one means putting the account password into a script. An API key
 * is long-lived, individually revocable, individually scoped, and carries no
 * ability to change the account it belongs to.
 */

/**
 * The prefix is a security feature, not branding.
 *
 * Secret scanners (GitHub push protection, GitGuardian, TruffleHog) match on
 * distinctive, high-signal prefixes. A key that reads `folio_sk_...` is
 * recognisable in a committed `.env`, a pasted log or a public gist, and gets
 * reported. A bare base64 blob is indistinguishable from any other base64 blob
 * and gets missed.
 *
 * `sk` for "secret key", matching the convention every developer already reads
 * as "this one is not safe to share".
 */
const KEY_PREFIX = "folio_sk_";

/**
 * 32 bytes, which is 256 bits, which is not guessable.
 *
 * Encoded as base64url, 32 bytes becomes exactly 43 characters with no padding,
 * and base64url is URL- and shell-safe so nothing downstream needs to escape it.
 */
const SECRET_BYTES = 32;
const SECRET_CHARS = 43;

/**
 * Anchored on both ends, with an exact length.
 *
 * This runs before any database work, so a flood of junk `Authorization`
 * headers is rejected in microseconds by a regex rather than costing one index
 * probe each.
 */
const KEY_PATTERN = new RegExp(`^${KEY_PREFIX}[A-Za-z0-9_-]{${SECRET_CHARS}}$`);

/** How many characters of the key the settings table may display. */
const VISIBLE_SUFFIX_CHARS = 4;

export interface GeneratedApiKey {
  /**
   * The plaintext key. THE ONLY MOMENT IT EXISTS.
   *
   * Returned to the caller, shown to the user once, and never written to the
   * database, a log, or an error message. There is no code path that can
   * recover it afterwards, by design: an owner who loses it mints a new one.
   */
  key: string;
  /** SHA-256 of `key`, hex. This is what gets stored. */
  hash: string;
  /** Last four characters, so a row can be recognised in the UI. */
  last4: string;
}

/**
 * Mints a key.
 *
 * `randomBytes` is the CSPRNG, not `Math.random`. That distinction is the whole
 * security of this scheme: `Math.random` is seeded predictably and its output
 * can be reconstructed from a few observed values, which for a credential means
 * anyone who has ever seen one key can derive others.
 */
export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;

  return {
    key,
    hash: hashApiKey(key),
    last4: key.slice(-VISIBLE_SUFFIX_CHARS),
  };
}

/**
 * Hashes a key for storage and for lookup.
 *
 * SHA-256, NOT BCRYPT, AND THAT IS DELIBERATE. bcrypt's cost factor exists to
 * make guessing slow, which matters when the secret is a human-chosen password
 * drawn from a small, skewed distribution. This secret is 256 bits of CSPRNG
 * output: there is no dictionary, no reuse across sites, and no feasible
 * guessing to slow down. An attacker holding this column has nothing to attack.
 *
 * The cost of getting this wrong in the other direction is real: bcrypt on the
 * authentication path would add roughly 250ms to every single API call, which
 * an agent making twenty calls to answer one question would feel as five
 * seconds of latency.
 *
 * The whole key is hashed, prefix included, so a stored hash cannot be
 * recomputed from the secret half alone.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Whether a bearer token is claiming to be an API key at all.
 *
 * The Authorization header carries either a session JWT or an API key, and
 * something has to route between the two. The prefix does it, which is why the
 * prefix is fixed and why a JWT can never collide with it: JWTs are three
 * base64url segments joined by dots and cannot begin with `folio_sk_`.
 */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}

/** Exact shape check. Rejects before the database is consulted. */
export function isWellFormedApiKey(token: string): boolean {
  return KEY_PATTERN.test(token);
}

/**
 * NO CONSTANT-TIME COMPARISON, AND ITS ABSENCE IS THE DESIGN.
 *
 * The usual advice is to compare credentials with `timingSafeEqual`. That
 * advice applies when the server holds a secret and compares it against a
 * submitted one byte by byte, because the comparison short-circuits and the
 * time it takes leaks how many leading bytes were right.
 *
 * Nothing here does that. Verification hashes the presented key and asks
 * PostgreSQL for the row with that hash: a B-tree probe on a unique index. The
 * secret is never compared in application code, so there is no comparison for a
 * timing attack to observe. Adding `timingSafeEqual` somewhere in this file
 * would be decoration that implies a defence that is not the one actually
 * protecting the endpoint.
 *
 * The one timing difference that does exist, a hit costing marginally more than
 * a miss, is not exploitable: reaching it requires already holding a
 * well-formed 256-bit key, and anyone holding one can simply read the HTTP
 * status instead.
 */

/* ------------------------------------------------------------------ */
/* Usability                                                           */
/* ------------------------------------------------------------------ */

export type ApiKeyRejection = "revoked" | "expired";

export interface ApiKeyLifecycle {
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export type ApiKeyUsability =
  | { usable: true }
  | { usable: false; reason: ApiKeyRejection };

/**
 * Whether a key that exists may still be used.
 *
 * Pure and clock-injected like the rest of the domain layer, so "a key expires
 * at the instant written on it, not a day either side" is a test rather than
 * something discovered in production.
 *
 * Revocation is checked before expiry. Both refuse the request, but a key that
 * was revoked and then also passed its expiry should report the deliberate act
 * rather than the passive one, because that is the fact the owner acted on.
 *
 * The boundary is exclusive: a key expires AT `expiresAt`, so the instant on
 * the label is the first instant it does not work.
 */
export function apiKeyUsability(
  key: ApiKeyLifecycle,
  now: Date,
): ApiKeyUsability {
  if (key.revokedAt !== null) {
    return { usable: false, reason: "revoked" };
  }

  if (key.expiresAt !== null && key.expiresAt.getTime() <= now.getTime()) {
    return { usable: false, reason: "expired" };
  }

  return { usable: true };
}

/**
 * How coarsely `lastUsedAt` is tracked.
 *
 * Writing it on every request would put a database write on the read path of an
 * endpoint an agent may call in a tight loop, to record a timestamp nobody
 * reads at a resolution nobody needs. One minute is precise enough for its only
 * purpose, which is an owner scanning a list for "this key I forgot about was
 * used an hour ago".
 */
export const LAST_USED_RESOLUTION_MS = 60_000;

export function shouldRecordUse(
  lastUsedAt: Date | null,
  now: Date,
  resolutionMs: number = LAST_USED_RESOLUTION_MS,
): boolean {
  if (lastUsedAt === null) return true;

  return now.getTime() - lastUsedAt.getTime() >= resolutionMs;
}

/* ------------------------------------------------------------------ */
/* Expiry                                                              */
/* ------------------------------------------------------------------ */

/**
 * Turns "90 days from now" into the instant a key stops working.
 *
 * The choices the UI offers live in `src/lib/schemas/api-key.ts`, because that
 * module is client-safe and this one is not. This function is the arithmetic
 * only, injected clock and all, so the boundary it produces can be asserted
 * against `apiKeyUsability` in a unit test rather than trusted.
 */
export function expiryFromDays(days: number | null, now: Date): Date | null {
  if (days === null) return null;

  return new Date(now.getTime() + days * 86_400_000);
}
