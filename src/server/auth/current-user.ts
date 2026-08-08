import { redirect } from "next/navigation";
import {
  type SessionPayload,
  readSessionCookie,
  verifySessionToken,
} from "./session";

/**
 * Session access for Server Components.
 *
 * Pages read the session and then call repositories directly, rather than
 * fetching their own REST API over HTTP. A server calling itself adds a network
 * round trip, a second serialisation pass and a duplicate auth check to reach
 * data it could already read.
 *
 * The REST API is not bypassed logic, it is a second consumer of the same
 * repository and domain layer. Reads go straight to the repository; every
 * mutation in the UI goes through the REST API, so the endpoints a reviewer
 * exercises with curl are the same ones the product itself uses to write.
 */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const token = await readSessionCookie();

  if (!token) return null;

  return verifySessionToken(token);
}

/** Resolves the signed-in user or redirects to the login screen. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getCurrentUser();

  if (!session) {
    redirect("/login");
  }

  return session;
}
