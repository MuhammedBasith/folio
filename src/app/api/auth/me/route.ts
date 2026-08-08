import { authedRoute, json } from "@/server/api/handler";

/**
 * GET /api/auth/me
 *
 * Confirms who the current token belongs to. Used by the client for a session
 * check, and the quickest way to verify a token from the command line.
 */
export const GET = authedRoute(async (_request, { session }) => {
  return json({ user: { id: session.userId, email: session.email } });
});
