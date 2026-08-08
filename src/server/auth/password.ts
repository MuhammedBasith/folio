import bcrypt from "bcryptjs";

/**
 * Password hashing.
 *
 * bcryptjs rather than native bcrypt: it is pure JavaScript, so there is no
 * node-gyp build step and nothing platform-specific to go wrong in a serverless
 * bundle.
 *
 * Cost 12 is roughly 250ms on current hardware. Deliberately slow: that is the
 * entire point of a password hash, and it is only paid on signup and login.
 */
const BCRYPT_COST = 12;

/** Enforced on signup only. An existing password is never re-validated. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Burns roughly the same time as a real verification.
 *
 * Without this, a login against an unknown email returns noticeably faster than
 * one against a known email, which turns the login endpoint into an account
 * enumeration oracle. Comparing against a fixed dummy hash keeps the timing of
 * both paths comparable.
 */
const DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.rXpUEbRxNvvBLKMHrjKuNH5Q3RcMFTS";

export async function burnPasswordTiming(plaintext: string): Promise<void> {
  await bcrypt.compare(plaintext, DUMMY_HASH);
}
