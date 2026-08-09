import { describe, expect, it } from "vitest";
import {
  apiKeyUsability,
  expiryFromDays,
  generateApiKey,
  hashApiKey,
  isWellFormedApiKey,
  looksLikeApiKey,
  shouldRecordUse,
} from "./api-key";

/**
 * The security-critical half of API keys, tested without a database.
 *
 * These assertions are the reason the module is pure. Entropy, format and
 * expiry arithmetic are exactly the things that fail silently: a key generator
 * that quietly produced 8 bytes instead of 32, or an expiry boundary that was
 * inclusive in one place and exclusive in another, would pass every integration
 * test and every manual check while leaving the product wide open.
 */

describe("generateApiKey", () => {
  it("produces the documented format", () => {
    const { key } = generateApiKey();

    expect(key).toMatch(/^folio_sk_[A-Za-z0-9_-]{43}$/);
  });

  it("carries 32 bytes of entropy, which is 43 base64url characters", () => {
    const { key } = generateApiKey();
    const secret = key.slice("folio_sk_".length);

    expect(secret).toHaveLength(43);
    // 43 base64url chars with no padding decodes to exactly 32 bytes.
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
  });

  it("never repeats", () => {
    /**
     * A thousand draws does not prove a CSPRNG is sound, and is not trying to.
     * It catches the failure that actually happens: a generator seeded once
     * per process, or one that returns a constant because a refactor dropped
     * the randomness, both of which this collapses to zero unique values.
     */
    const keys = new Set(
      Array.from({ length: 1000 }, () => generateApiKey().key),
    );

    expect(keys.size).toBe(1000);
  });

  it("returns the hash of the whole key, not of the secret half", () => {
    const { key, hash } = generateApiKey();

    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toBe(hashApiKey(key.slice("folio_sk_".length)));
  });

  it("exposes only the last four characters for display", () => {
    const { key, last4 } = generateApiKey();

    expect(last4).toHaveLength(4);
    expect(key.endsWith(last4)).toBe(true);
  });
});

describe("hashApiKey", () => {
  it("is a 64 character hex SHA-256", () => {
    expect(hashApiKey("folio_sk_anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashApiKey("folio_sk_abc")).toBe(hashApiKey("folio_sk_abc"));
  });

  it("differs for inputs that differ by one character", () => {
    expect(hashApiKey("folio_sk_abc")).not.toBe(hashApiKey("folio_sk_abd"));
  });

  it("cannot be reversed to the key", () => {
    // Not a cryptographic proof, just the property the storage design relies
    // on: the stored value does not contain the key.
    const { key, hash } = generateApiKey();

    expect(hash).not.toContain(key.slice("folio_sk_".length));
  });
});

describe("looksLikeApiKey", () => {
  it("recognises a key by its prefix", () => {
    expect(looksLikeApiKey(generateApiKey().key)).toBe(true);
  });

  it("does not mistake a JWT for one", () => {
    /**
     * The dispatch between the two credential types depends on this being
     * impossible to confuse. A JWT is three base64url segments joined by dots
     * and its first character is always part of a base64url-encoded JSON
     * header, so it cannot begin with the prefix.
     */
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJlLWhlcmU";

    expect(looksLikeApiKey(jwt)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(looksLikeApiKey("")).toBe(false);
  });
});

describe("isWellFormedApiKey", () => {
  it("accepts a generated key", () => {
    expect(isWellFormedApiKey(generateApiKey().key)).toBe(true);
  });

  it.each([
    ["the prefix alone", "folio_sk_"],
    ["a secret that is one character short", `folio_sk_${"a".repeat(42)}`],
    ["a secret that is one character long", `folio_sk_${"a".repeat(44)}`],
    ["a base64 character outside the url alphabet", `folio_sk_${"a".repeat(42)}+`],
    ["no prefix at all", "a".repeat(43)],
    ["the wrong prefix", `folio_pk_${"a".repeat(43)}`],
    ["an empty string", ""],
  ])("rejects %s", (_label, candidate) => {
    expect(isWellFormedApiKey(candidate)).toBe(false);
  });

  it("is anchored, so a valid key with anything appended is refused", () => {
    const { key } = generateApiKey();

    expect(isWellFormedApiKey(`${key}x`)).toBe(false);
    expect(isWellFormedApiKey(`x${key}`)).toBe(false);
    // A trailing newline is what you get from a careless `cat key.txt`.
    expect(isWellFormedApiKey(`${key}\n`)).toBe(false);
  });
});

describe("apiKeyUsability", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");

  it("accepts a key with no revocation and no expiry", () => {
    expect(
      apiKeyUsability({ revokedAt: null, expiresAt: null }, now),
    ).toEqual({ usable: true });
  });

  it("accepts a key whose expiry is still ahead", () => {
    expect(
      apiKeyUsability(
        { revokedAt: null, expiresAt: new Date("2026-08-09T12:00:01.000Z") },
        now,
      ),
    ).toEqual({ usable: true });
  });

  it("refuses a revoked key", () => {
    expect(
      apiKeyUsability({ revokedAt: now, expiresAt: null }, now),
    ).toEqual({ usable: false, reason: "revoked" });
  });

  it("refuses an expired key", () => {
    expect(
      apiKeyUsability(
        { revokedAt: null, expiresAt: new Date("2026-08-09T11:59:59.000Z") },
        now,
      ),
    ).toEqual({ usable: false, reason: "expired" });
  });

  it("treats the expiry instant itself as expired", () => {
    /**
     * The boundary is exclusive, and it has to agree with the `gt: now`
     * predicate the key cap counts with. If one said "at" and the other said
     * "after", a key could occupy a slot it could no longer be used with.
     */
    expect(
      apiKeyUsability({ revokedAt: null, expiresAt: now }, now),
    ).toEqual({ usable: false, reason: "expired" });
  });

  it("reports revocation ahead of expiry when both apply", () => {
    expect(
      apiKeyUsability(
        {
          revokedAt: new Date("2026-01-01T00:00:00.000Z"),
          expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        },
        now,
      ),
    ).toEqual({ usable: false, reason: "revoked" });
  });
});

describe("shouldRecordUse", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");

  it("records the first ever use", () => {
    expect(shouldRecordUse(null, now)).toBe(true);
  });

  it("does not record again within the resolution window", () => {
    expect(
      shouldRecordUse(new Date("2026-08-09T11:59:30.000Z"), now),
    ).toBe(false);
  });

  it("records once the window has passed", () => {
    expect(
      shouldRecordUse(new Date("2026-08-09T11:58:00.000Z"), now),
    ).toBe(true);
  });

  it("records exactly on the boundary", () => {
    expect(
      shouldRecordUse(new Date("2026-08-09T11:59:00.000Z"), now),
    ).toBe(true);
  });

  it("does not record when the stored stamp is somehow in the future", () => {
    // Clock skew between instances. Writing here would flap the column back
    // and forth rather than converging.
    expect(
      shouldRecordUse(new Date("2026-08-09T12:30:00.000Z"), now),
    ).toBe(false);
  });
});

describe("expiryFromDays", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");

  it("returns null for a key that never expires", () => {
    expect(expiryFromDays(null, now)).toBeNull();
  });

  it("adds whole days", () => {
    expect(expiryFromDays(90, now)?.toISOString()).toBe(
      "2026-11-07T12:00:00.000Z",
    );
  });

  it("produces a key that is usable right up to its expiry and not after", () => {
    const expiresAt = expiryFromDays(1, now)!;

    const justBefore = new Date(expiresAt.getTime() - 1);
    const exactly = new Date(expiresAt.getTime());

    expect(apiKeyUsability({ revokedAt: null, expiresAt }, justBefore)).toEqual({
      usable: true,
    });
    expect(apiKeyUsability({ revokedAt: null, expiresAt }, exactly)).toEqual({
      usable: false,
      reason: "expired",
    });
  });
});
