import { beforeEach, describe, expect, it } from "vitest";
import {
  RULES,
  clientKey,
  forRuntime,
  hit,
  resetRateLimits,
  type RateLimitRule,
} from "./rate-limit";

const RULE: RateLimitRule = { limit: 3, windowMs: 60_000 };
const T0 = 1_000_000;

beforeEach(() => {
  resetRateLimits();
});

describe("hit", () => {
  it("allows exactly the limit and refuses the next one", () => {
    expect(hit("k", RULE, T0).ok).toBe(true);
    expect(hit("k", RULE, T0).ok).toBe(true);
    expect(hit("k", RULE, T0).ok).toBe(true);
    expect(hit("k", RULE, T0).ok).toBe(false);
  });

  it("counts down what is left", () => {
    expect(hit("k", RULE, T0).remaining).toBe(2);
    expect(hit("k", RULE, T0).remaining).toBe(1);
    expect(hit("k", RULE, T0).remaining).toBe(0);
    // Never negative: the number is shown to a caller, and "-4 remaining"
    // is not a thing.
    expect(hit("k", RULE, T0).remaining).toBe(0);
  });

  it("keeps separate keys entirely separate", () => {
    for (let i = 0; i < 3; i++) hit("a", RULE, T0);

    expect(hit("a", RULE, T0).ok).toBe(false);
    expect(hit("b", RULE, T0).ok).toBe(true);
  });

  it("opens a fresh window once the old one expires", () => {
    for (let i = 0; i < 4; i++) hit("k", RULE, T0);
    expect(hit("k", RULE, T0).ok).toBe(false);

    expect(hit("k", RULE, T0 + RULE.windowMs).ok).toBe(true);
    expect(hit("k", RULE, T0 + RULE.windowMs).remaining).toBe(1);
  });

  it("does not expire a window one millisecond early", () => {
    for (let i = 0; i < 3; i++) hit("k", RULE, T0);
    expect(hit("k", RULE, T0 + RULE.windowMs - 1).ok).toBe(false);
  });

  it("reports a retry that shrinks as the window drains", () => {
    for (let i = 0; i < 4; i++) hit("k", RULE, T0);

    const early = hit("k", RULE, T0 + 10_000).retryAfter;
    const late = hit("k", RULE, T0 + 50_000).retryAfter;

    expect(early).toBe(50);
    expect(late).toBe(10);
  });

  /**
   * The counter is NOT cleared on success anywhere in the codebase, and this
   * pins that down. Resetting on a successful login is the classic hole: an
   * attacker holding one valid account clears their own budget between guesses
   * at somebody else's.
   */
  it("has no way to clear a budget short of waiting", () => {
    for (let i = 0; i < 3; i++) hit("login:1.2.3.4", RULE, T0);

    // A success on another key changes nothing about this one.
    hit("login:9.9.9.9", RULE, T0);

    expect(hit("login:1.2.3.4", RULE, T0).ok).toBe(false);
  });

});

describe("the rules that ship", () => {
  it("keeps login tight enough to matter", () => {
    // Ten guesses per quarter hour. The exact numbers can move; an unbounded
    // or hourly-scale login limit cannot.
    expect(RULES.login.limit).toBeLessThanOrEqual(10);
    expect(RULES.login.windowMs).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it("keeps signup lower than login", () => {
    // Creating accounts is rarer than mistyping a password, so it should never
    // be the more permissive of the two.
    expect(RULES.signup.limit).toBeLessThan(RULES.login.limit);
  });

  it("leaves authenticated writes generous", () => {
    // High enough that no human working normally reaches it.
    expect(RULES.write.limit).toBeGreaterThanOrEqual(60);
  });

  /**
   * THE INVARIANT. Development shortens the window so a suite can run twice in
   * a row; it must never relax the count, or every local run would be testing
   * behaviour that does not ship.
   */
  it("shortens the window outside production and never the count", () => {
    for (const rule of Object.values(RULES)) {
      const dev = forRuntime(rule, false);
      const prod = forRuntime(rule, true);

      expect(dev.limit).toBe(rule.limit);
      expect(prod).toEqual(rule);
      expect(dev.windowMs).toBeLessThanOrEqual(rule.windowMs);
    }
  });

  it("leaves an already-short window alone", () => {
    const short: RateLimitRule = { limit: 3, windowMs: 1_000 };
    expect(forRuntime(short, false)).toEqual(short);
  });
});

describe("clientKey", () => {
  function request(headers: Record<string, string>): Request {
    return new Request("https://example.test/api/auth/login", { headers });
  }

  /**
   * THE LEFTMOST ENTRY, NOT THE LAST. `x-forwarded-for` accumulates
   * left-to-right from the original client, so the last entry is the proxy
   * nearest the server. Keying on that would put every request on earth in one
   * bucket and rate limit the whole internet together.
   */
  it("takes the original client from a forwarded chain", () => {
    const key = clientKey(
      request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }),
      "login",
    );

    expect(key).toBe("login:203.0.113.7");
  });

  it("trims whitespace around the address", () => {
    expect(clientKey(request({ "x-forwarded-for": "  203.0.113.7 " }), "login")).toBe(
      "login:203.0.113.7",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(request({ "x-real-ip": "198.51.100.4" }), "login")).toBe(
      "login:198.51.100.4",
    );
  });

  it("degrades to a single bucket with no proxy headers", () => {
    expect(clientKey(request({}), "login")).toBe("login:local");
  });

  it("keeps scopes apart so one endpoint cannot exhaust another", () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };

    expect(clientKey(request(headers), "login")).not.toBe(
      clientKey(request(headers), "signup"),
    );
  });
});
