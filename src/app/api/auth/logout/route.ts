import { json, route } from "@/server/api/handler";
import { clearSessionCookie } from "@/server/auth/session";

/**
 * POST /api/auth/logout
 *
 * Clears the cookie. A bearer token stays valid until it expires, because the
 * tokens are stateless by design and revoking one would need a server-side
 * denylist. The README records that as a deliberate trade and as the first
 * thing to add for production.
 *
 * POST rather than GET so a prefetch or an image tag cannot sign a user out.
 */
export const POST = route(async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
