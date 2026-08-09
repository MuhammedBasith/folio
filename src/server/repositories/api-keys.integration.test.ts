import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { hashApiKey } from "@/server/auth/api-key";
import { MAX_ACTIVE_API_KEYS } from "@/lib/schemas/api-key";
import {
  authenticateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "./api-keys";

/**
 * API keys against a real database.
 *
 * These are the assertions that cannot be made against a mock, because the
 * things being checked ARE the database: the unique index that makes lookup a
 * single probe, the ownership predicates that keep one account out of
 * another's, and the row lock that stops the key cap being walked past by two
 * simultaneous requests.
 */

let ownerId: string;
let otherOwnerId: string;

beforeEach(async () => {
  const [owner, other] = await Promise.all([
    prisma.user.create({
      data: { email: "owner@example.com", passwordHash: "x" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: "other@example.com", passwordHash: "x" },
      select: { id: true },
    }),
  ]);
  ownerId = owner.id;
  otherOwnerId = other.id;
});

function options(overrides: Partial<Parameters<typeof createApiKey>[1]> = {}) {
  return {
    name: "Test key",
    scope: "READ_ONLY" as const,
    expiresInDays: 90,
    ...overrides,
  };
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw new Error(`Expected an ApiError, received: ${String(error)}`);
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

describe("createApiKey", () => {
  it("returns a key that authenticates as its owner", async () => {
    const created = await createApiKey(
      ownerId,
      options({ scope: "READ_WRITE" }),
    );

    const result = await authenticateApiKey(created.key);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.key.ownerId).toBe(ownerId);
    expect(result.key.email).toBe("owner@example.com");
    expect(result.key.scope).toBe("READ_WRITE");
  });

  it("NEVER stores the plaintext key", async () => {
    /**
     * The single most important assertion in this file. Everything else about
     * this design is a refinement of "the database does not contain the
     * credential"; if this fails, a database backup is a list of working keys.
     */
    const created = await createApiKey(ownerId, options());

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: created.apiKey.id },
    });

    expect(row.hash).toBe(hashApiKey(created.key));
    expect(row.hash).not.toBe(created.key);

    // And no column anywhere on the row contains it.
    expect(JSON.stringify(row)).not.toContain(
      created.key.slice("folio_sk_".length),
    );
  });

  it("does not expose the hash through the API shape", async () => {
    const created = await createApiKey(ownerId, options());

    expect(created.apiKey).not.toHaveProperty("hash");
    expect(Object.keys(created.apiKey).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "last4",
      "lastUsedAt",
      "name",
      "revokedAt",
      "scope",
      "status",
    ]);
  });

  it("records no expiry when asked for none", async () => {
    const created = await createApiKey(
      ownerId,
      options({ expiresInDays: null }),
    );

    expect(created.apiKey.expiresAt).toBeNull();
    expect(created.apiKey.status).toBe("active");
  });

  it("refuses once the account holds the maximum number of active keys", async () => {
    for (let i = 0; i < MAX_ACTIVE_API_KEYS; i += 1) {
      await createApiKey(ownerId, options({ name: `key ${i}` }));
    }

    const error = await expectApiError(createApiKey(ownerId, options()));

    expect(error.code).toBe("API_KEY_LIMIT_REACHED");
    expect(error.status).toBe(409);
  });

  it("does not count revoked keys against the maximum", async () => {
    const first = await createApiKey(ownerId, options());

    for (let i = 1; i < MAX_ACTIVE_API_KEYS; i += 1) {
      await createApiKey(ownerId, options({ name: `key ${i}` }));
    }

    await revokeApiKey(ownerId, first.apiKey.id);

    // The slot the revoked key held is free again.
    await expect(createApiKey(ownerId, options())).resolves.toBeDefined();
  });

  it("does not count expired keys against the maximum", async () => {
    const first = await createApiKey(ownerId, options());

    for (let i = 1; i < MAX_ACTIVE_API_KEYS; i += 1) {
      await createApiKey(ownerId, options({ name: `key ${i}` }));
    }

    await prisma.apiKey.update({
      where: { id: first.apiKey.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(createApiKey(ownerId, options())).resolves.toBeDefined();
  });

  it("holds the cap under concurrent creation", async () => {
    /**
     * The reason `createApiKey` takes a row lock on the owner. Without it both
     * of these read the same count, both decide there is room, and the account
     * ends up with one key more than the cap allows.
     */
    for (let i = 0; i < MAX_ACTIVE_API_KEYS - 1; i += 1) {
      await createApiKey(ownerId, options({ name: `key ${i}` }));
    }

    const results = await Promise.allSettled([
      createApiKey(ownerId, options({ name: "race a" })),
      createApiKey(ownerId, options({ name: "race b" })),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const active = await prisma.apiKey.count({
      where: { ownerId, revokedAt: null },
    });
    expect(active).toBe(MAX_ACTIVE_API_KEYS);
  });

  it("counts each account's keys separately", async () => {
    for (let i = 0; i < MAX_ACTIVE_API_KEYS; i += 1) {
      await createApiKey(ownerId, options({ name: `key ${i}` }));
    }

    // A full account must not stop a different one creating keys.
    await expect(createApiKey(otherOwnerId, options())).resolves.toBeDefined();
  });
});

describe("authenticateApiKey", () => {
  it("refuses a key that does not exist", async () => {
    const stranger = await createApiKey(otherOwnerId, options());
    // A well-formed key that was never issued: same shape, different secret.
    const invented = `folio_sk_${"A".repeat(43)}`;

    expect(await authenticateApiKey(invented)).toEqual({
      ok: false,
      reason: "unknown",
    });

    // Sanity: the real one does work, so the above is not passing by accident.
    expect((await authenticateApiKey(stranger.key)).ok).toBe(true);
  });

  it.each([
    ["a malformed key", "folio_sk_short"],
    ["a JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig"],
    ["an empty string", ""],
  ])("refuses %s without consulting the database", async (_label, token) => {
    expect(await authenticateApiKey(token)).toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  it("refuses a revoked key and says so", async () => {
    const created = await createApiKey(ownerId, options());
    await revokeApiKey(ownerId, created.apiKey.id);

    expect(await authenticateApiKey(created.key)).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  it("refuses a revoked key immediately, with no grace period", async () => {
    const created = await createApiKey(ownerId, options());

    expect((await authenticateApiKey(created.key)).ok).toBe(true);
    await revokeApiKey(ownerId, created.apiKey.id);
    expect((await authenticateApiKey(created.key)).ok).toBe(false);
  });

  it("refuses an expired key and says so", async () => {
    const created = await createApiKey(ownerId, options());

    await prisma.apiKey.update({
      where: { id: created.apiKey.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await authenticateApiKey(created.key)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("records the first use, then throttles further writes", async () => {
    const created = await createApiKey(ownerId, options());

    await authenticateApiKey(created.key);

    const first = await prisma.apiKey.findUniqueOrThrow({
      where: { id: created.apiKey.id },
      select: { lastUsedAt: true },
    });
    expect(first.lastUsedAt).not.toBeNull();

    await authenticateApiKey(created.key);

    const second = await prisma.apiKey.findUniqueOrThrow({
      where: { id: created.apiKey.id },
      select: { lastUsedAt: true },
    });

    // Unchanged: the second call fell inside the resolution window.
    expect(second.lastUsedAt?.getTime()).toBe(first.lastUsedAt?.getTime());
  });

  it("does not stamp last use for a revoked key", async () => {
    const created = await createApiKey(ownerId, options());
    await revokeApiKey(ownerId, created.apiKey.id);

    await authenticateApiKey(created.key);

    const row = await prisma.apiKey.findUniqueOrThrow({
      where: { id: created.apiKey.id },
      select: { lastUsedAt: true },
    });

    expect(row.lastUsedAt).toBeNull();
  });
});

describe("listApiKeys", () => {
  it("returns only the caller's keys", async () => {
    await createApiKey(ownerId, options({ name: "mine" }));
    await createApiKey(otherOwnerId, options({ name: "theirs" }));

    const mine = await listApiKeys(ownerId);

    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("mine");
  });

  it("derives status rather than reading a column", async () => {
    const active = await createApiKey(ownerId, options({ name: "active" }));
    const revoked = await createApiKey(ownerId, options({ name: "revoked" }));
    const expiring = await createApiKey(ownerId, options({ name: "expired" }));

    await revokeApiKey(ownerId, revoked.apiKey.id);
    await prisma.apiKey.update({
      where: { id: expiring.apiKey.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const keys = await listApiKeys(ownerId);
    const byName = Object.fromEntries(keys.map((k) => [k.name, k.status]));

    expect(byName).toEqual({
      active: "active",
      revoked: "revoked",
      expired: "expired",
    });

    // And the same rows read as expired at a later `asOf` without any write.
    const later = await listApiKeys(
      ownerId,
      new Date(Date.now() + 200 * 86_400_000),
    );
    expect(later.find((k) => k.id === active.apiKey.id)?.status).toBe("expired");
  });

  it("lists newest first", async () => {
    const first = await createApiKey(ownerId, options({ name: "first" }));
    await createApiKey(ownerId, options({ name: "second" }));

    /**
     * The timestamps are forced apart. `createdAt` has millisecond resolution
     * and two creates in a row land inside the same millisecond on any
     * reasonable machine, so without this the assertion is testing the
     * tiebreak rather than the ordering it claims to.
     */
    await prisma.apiKey.update({
      where: { id: first.apiKey.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });

    const keys = await listApiKeys(ownerId);

    expect(keys.map((k) => k.name)).toEqual(["second", "first"]);
  });

  it("orders deterministically when two keys share a timestamp", async () => {
    /**
     * The bug this was written for: created inside one millisecond, the rows
     * came back in whatever order the planner chose, and a different order on
     * the next call. A settings screen that reshuffles between page loads is a
     * good way to revoke the wrong key.
     */
    await Promise.all([
      createApiKey(ownerId, options({ name: "a" })),
      createApiKey(ownerId, options({ name: "b" })),
      createApiKey(ownerId, options({ name: "c" })),
    ]);

    const runs = await Promise.all([
      listApiKeys(ownerId),
      listApiKeys(ownerId),
      listApiKeys(ownerId),
    ]);

    const orders = runs.map((run) => run.map((key) => key.id).join(","));

    expect(new Set(orders).size).toBe(1);
  });
});

describe("revokeApiKey", () => {
  it("marks the key revoked", async () => {
    const created = await createApiKey(ownerId, options());

    const revoked = await revokeApiKey(ownerId, created.apiKey.id);

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).not.toBeNull();
  });

  it("is idempotent, and does not move the original timestamp", async () => {
    const created = await createApiKey(ownerId, options());

    const first = await revokeApiKey(ownerId, created.apiKey.id);
    const second = await revokeApiKey(ownerId, created.apiKey.id);

    expect(second.revokedAt).toBe(first.revokedAt);
  });

  it("refuses to revoke another account's key, as a 404", async () => {
    const theirs = await createApiKey(otherOwnerId, options());

    const error = await expectApiError(
      revokeApiKey(ownerId, theirs.apiKey.id),
    );

    /**
     * 404 rather than 403: a 403 would confirm that the id names a real key
     * belonging to somebody else.
     */
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");

    // And it really is untouched.
    const still = await authenticateApiKey(theirs.key);
    expect(still.ok).toBe(true);
  });

  it("reports an unknown id the same way as another account's", async () => {
    const theirs = await createApiKey(otherOwnerId, options());

    const forOther = await expectApiError(
      revokeApiKey(ownerId, theirs.apiKey.id),
    );
    const forMissing = await expectApiError(
      revokeApiKey(ownerId, "cuid-that-does-not-exist"),
    );

    expect(forMissing.status).toBe(forOther.status);
    expect(forMissing.message).toBe(forOther.message);
  });

  it("keeps the row so the audit trail survives", async () => {
    const created = await createApiKey(ownerId, options());
    await authenticateApiKey(created.key);
    await revokeApiKey(ownerId, created.apiKey.id);

    const row = await prisma.apiKey.findUnique({
      where: { id: created.apiKey.id },
    });

    expect(row).not.toBeNull();
    expect(row?.lastUsedAt).not.toBeNull();
  });
});

describe("account deletion", () => {
  it("takes every key with it", async () => {
    const created = await createApiKey(ownerId, options());

    await prisma.user.delete({ where: { id: ownerId } });

    expect(await authenticateApiKey(created.key)).toEqual({
      ok: false,
      reason: "unknown",
    });
  });
});
