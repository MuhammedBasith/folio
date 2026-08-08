import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Sessions.
 *
 * Hand-rolled rather than Auth.js, for one concrete reason: this product
 * exposes a public REST API, and Auth.js is cookie plus CSRF based, so getting
 * a usable credential from a script means a login round trip and cookie
 * extraction. Here `POST /api/auth/login` returns a bearer token in the body
 * AND sets an httpOnly cookie, so the browser and an API client are both
 * first-class.
 *
 * It is also worth noting that a credentials provider would leave the bcrypt
 * comparison and the user lookup to be written by hand anyway. The library
 * would supply session plumbing, not the auth logic.
 *
 * Security properties, all deliberate:
 *   - HS256 over a secret that must be at least 32 bytes.
 *   - Cookie is httpOnly (no XSS token theft), secure in production, and
 *     sameSite=lax (blocks CSRF on cross-site POSTs while keeping normal
 *     top-level navigation working).
 *   - Never stored in localStorage.
 *   - Seven day expiry, checked by `jwtVerify` on every request.
 */

const SESSION_COOKIE = "tally_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const ISSUER = "tally";
const AUDIENCE = "tally:api";

export interface SessionPayload {
  userId: string;
  email: string;
}

/**
 * Read the signing key lazily.
 *
 * Reading at module scope would crash the build, because Next evaluates route
 * modules while collecting page data and the secret is not present then.
 */
function getSigningKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Copy .env.example to .env and generate one with: openssl rand -base64 48",
    );
  }

  if (secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSigningKey());
}

/** Returns null for any invalid token: bad signature, expired, malformed. */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }

    return { userId: payload.sub, email: payload.email };
  } catch {
    // Any verification failure is simply "not authenticated". Distinguishing
    // expired from forged would leak information to an attacker and changes
    // nothing for a legitimate client.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Cookie transport                                                    */
/* ------------------------------------------------------------------ */

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();

  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Extracts a token from a request, preferring the Authorization header.
 *
 * Header first so an API client can override whatever cookie the browser
 * happens to be carrying, which makes the two transports independent and the
 * API testable in isolation.
 */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header) return null;

  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

export { SESSION_COOKIE, TOKEN_TTL_SECONDS };
