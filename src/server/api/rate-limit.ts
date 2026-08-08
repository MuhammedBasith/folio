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
 * THE RULES, as they are in production.
 *
 * Exported separately from what actually runs, because what actually runs has
 * its window shortened outside production and a test asserting "the login
 * window is at least five minutes" would then be asserting the development
 * value. These are the numbers that matter; the ones below are those numbers
 * adapted to the environment.
 */
export const RULES = {
  /** Password guessing. Tight: the attacker only needs to be lucky once. */
  login: { limit: 10, windowMs: 15 * 60_000 },
  /**
   * Account creation.
   *
   * Ten, not five. REJECTED ATTEMPTS COUNT, because the limit is applied before
   * the handler runs and a limiter that only counts successes is trivially
   * defeated. That makes a tight number unfair: someone who picks a short
   * password twice and mistypes their email once has already spent three of
   * their budget without creating anything. Ten still stops bulk creation and
   * leaves room to fumble.
   */
  signup: { limit: 10, windowMs: 60 * 60_000 },
  /**
   * Authenticated writes. Generous: this exists to stop a runaway script, not
   * to police anyone's usage of their own ledger.
   */
  write: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

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
const DEV_WINDOW_MS = 5_000;

export function forRuntime(
  rule: RateLimitRule,
  isProduction = process.env.NODE_ENV === "production",
): RateLimitRule {
  return isProduction
    ? rule
    : { limit: rule.limit, windowMs: Math.min(rule.windowMs, DEV_WINDOW_MS) };
}

export const LOGIN_LIMIT: RateLimitRule = forRuntime(RULES.login);
export const SIGNUP_LIMIT: RateLimitRule = forRuntime(RULES.signup);
export const WRITE_LIMIT: RateLimitRule = forRuntime(RULES.write);

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
 * Whether to believe the client address in the request headers.
 *
 * THIS DEFAULTS TO TRUE, AND THAT IS A REAL DECISION WITH A REAL TRADE-OFF.
 *
 * Behind a proxy that sets `x-forwarded-for` (Vercel, Cloudflare, any sane
 * nginx) the header is authoritative: the platform overwrites whatever the
 * client sent, so it cannot be spoofed. Refusing to trust it there would put
 * every user on earth in one bucket, and ten logins per fifteen minutes shared
 * globally is not a security control, it is an outage.
 *
 * Deployed with NO proxy in front, the opposite is true: anyone can send their
 * own `x-forwarded-for` and mint a fresh bucket per request, which defeats the
 * limiter completely. That deployment must set `TRUST_PROXY_HEADERS=false`, and
 * the limiter then falls back to one shared bucket, which is the correct
 * behaviour when there is genuinely no way to tell callers apart.
 *
 * Stating it as a flag rather than assuming makes the assumption visible in the
 * environment rather than buried in a helper.
 */
function trustsProxyHeaders(): boolean {
  return process.env.TRUST_PROXY_HEADERS !== "false";
}

/**
 * The caller's identity for rate limiting purposes.
 *
 * The LEFTMOST entry of `x-forwarded-for` is the original client. Taking the
 * last would key every request to the proxy nearest the server and limit
 * everybody together.
 */
export function clientKey(request: Request, scope: string): string {
  if (!trustsProxyHeaders()) return `${scope}:untrusted`;

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
