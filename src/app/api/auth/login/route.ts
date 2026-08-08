import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { json, parseBody, route } from "@/server/api/handler";
import { burnPasswordTiming, verifyPassword } from "@/server/auth/password";
import { createSessionToken, setSessionCookie } from "@/server/auth/session";
import { loginSchema } from "@/lib/schemas/auth";

/**
 * POST /api/auth/login
 *
 * One failure message for both an unknown email and a wrong password. Saying
 * "no account with that email" would turn this endpoint into a way to discover
 * which addresses are registered.
 *
 * The timing of the two paths is equalised too: without `burnPasswordTiming`,
 * an unknown email would return in a millisecond while a known one spends
 * ~250ms in bcrypt, and that difference alone leaks the same information the
 * shared message is hiding.
 */
export const POST = route(async (request) => {
  const input = await parseBody(request, loginSchema);

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    await burnPasswordTiming(input.password);
    throw invalidCredentials();
  }

  const valid = await verifyPassword(input.password, user.passwordHash);

  if (!valid) {
    throw invalidCredentials();
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
  });

  await setSessionCookie(token);

  return json({ user: { id: user.id, email: user.email }, token });
});

function invalidCredentials(): ApiError {
  return new ApiError({
    status: 401,
    code: "INVALID_CREDENTIALS",
    message: "That email and password combination does not match an account.",
  });
}
