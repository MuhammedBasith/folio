import { ApiError } from "./errors";

/**
 * Rate limiting.
 *
 * WHAT THIS IS FOR. Two endpoints on this API are worth attacking. `/login`
 * lets an attacker try passwords, and the domain is small enough that an
 * unlimited login endpoint is a password oracle rather than a security control.
 * `/signup` lets anyone fill the database. Everything else is behind a session
 * and scoped to one tenant, so the worst an authenticated caller can do is
 * exhaust their own quota, which is why the authenticated limit is generous.
 *
 * WHAT IT IS NOT. This is an in-memory fixed window, per process. That is a
 * real, deliberate limitation and it is worth being precise about it rather
 * than implying more protection than exists:
 *
 *   - It does not survive a restart, so a deploy resets every counter.
 *   - It is per instance. On a platform that runs several, an attacker gets the
 *     limit multiplied by however many instances they happen to reach.
 *   - A fixed window allows a burst of up to 2x the limit across a boundary.
 *
 * It is still worth having. It turns "unlimited password guesses" into
 * "ten per fifteen minutes per instance", which is the difference between a
 * feasible online attack and an infeasible one, and it costs no infrastructure.
 * The upgrade path is one function: swap `hit` for a Redis `INCR` with `EXPIRE`
 * and every call site stays as it is. That is written down in the README under
 * what I would do before production, rather than left as a surprise.
 *
 * The counter is deliberately NOT cleared on a successful login. Resetting on
 * success is the classic hole: an attacker who owns one valid account can clear
 * their own budget between guesses at another.
 */

interface Window {
  count: number;
  /** Epoch milliseconds at which this window expires. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * Bounds the map so a flood of unique keys cannot grow it without limit.
 *
 * Sweeping on write rather than on a timer keeps this free of a background
 * interval that would hold a serverless instance awake, and the work is
 * proportional to the number of expired entries rather than to traffic.
 */
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitRule {
  /** How many requests are allowed inside one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Outside production the WINDOW shortens; the COUNT never changes.
 *
 * The alternative, disabling the limiter in development, means the one code
 * path guarding the login endpoint is never executed until it reaches
 * production, which is exactly the wrong place to find out it is wrong. Keeping
 * the counts identical means the smoke suite exercises the real behaviour (the
 * eleventh login is refused either way); shortening the window to seconds means
 * running that suite twice in a row does not lock the developer out of their
 * own machine for a quarter of an hour.
 */
const productionWindow = process.env.NODE_ENV === "production";

function windowMs(ms: number): number {
  return productionWindow ? ms : Math.min(ms, 5_000);
}

/** Password guessing. Tight, because the attacker only needs to be lucky once. */
export const LOGIN_LIMIT: RateLimitRule = {
  limit: 10,
  windowMs: windowMs(15 * 60_000),
};

/** Account creation. Low, because a human does this approximately once. */
export const SIGNUP_LIMIT: RateLimitRule = {
  limit: 5,
  windowMs: windowMs(60 * 60_000),
};

/**
 * Authenticated writes. Generous: this exists to stop a runaway script, not to
 * police anyone's usage of their own ledger.
 */
export const WRITE_LIMIT: RateLimitRule = {
  limit: 120,
  windowMs: windowMs(60_000),
};

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets, for `Retry-After`. */
  retryAfter: number;
}

/**
 * Records a hit against a key and reports whether it is allowed.
 *
 * Pure of any request knowledge on purpose, so it can be unit tested against an
 * injected clock instead of against wall time.
 */
export function hit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  if (windows.size > MAX_TRACKED_KEYS) sweep(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, remaining: rule.limit - 1, retryAfter: 0 };
  }

  existing.count += 1;

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  return {
    ok: existing.count <= rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    retryAfter,
  };
}

/** Test-only. Production never needs this; a window expires on its own. */
export function resetRateLimits() {
  windows.clear();
}

/**
 * The caller's identity for rate limiting purposes.
 *
 * `x-forwarded-for` is only trustworthy behind a proxy that sets it, which is
 * the case on Vercel and on any sane reverse proxy, and the LEFTMOST entry is
 * the client. Taking the last entry would key every request to the proxy and
 * limit the whole world together.
 *
 * If no header is present (a direct connection in local development) everything
 * shares one bucket, which is correct: there is only one client.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";

  return `${scope}:${ip}`;
}

/**
 * Applies a rule, throwing the standard envelope when the budget is spent.
 *
 * The message states the wait in plain English rather than making the caller
 * read a header, because the person hitting this most often is someone who has
 * mistyped their own password four times.
 */
export function enforce(
  request: Request,
  scope: string,
  rule: RateLimitRule,
): void {
  const result = hit(clientKey(request, scope), rule);

  if (result.ok) return;

  const minutes = Math.ceil(result.retryAfter / 60);

  throw new ApiError({
    status: 429,
    code: "RATE_LIMITED",
    message:
      minutes <= 1
        ? "Too many attempts. Try again in a minute."
        : `Too many attempts. Try again in about ${minutes} minutes.`,
    details: { retryAfterSeconds: result.retryAfter },
  });
}
