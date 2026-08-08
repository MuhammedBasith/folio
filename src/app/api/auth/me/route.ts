import { authedRoute, json } from "@/server/api/handler";

/**
 * GET /api/auth/me
 *
 * Confirms who the current token belongs to. Serves the client for a session
 * check, and serves a reviewer as the fastest way to prove a token works.
 */
export const GET = authedRoute(async (_request, { session }) => {
  return json({ user: { id: session.userId, email: session.email } });
});
