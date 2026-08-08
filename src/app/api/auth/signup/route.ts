import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { json, parseBody, route } from "@/server/api/handler";
import { SIGNUP_LIMIT } from "@/server/api/rate-limit";
import { hashPassword } from "@/server/auth/password";
import { createSessionToken, setSessionCookie } from "@/server/auth/session";
import { signupSchema } from "@/lib/schemas/auth";

/**
 * POST /api/auth/signup
 *
 * Creates an account and signs the caller straight in. Returns the token in the
 * body as well as setting the cookie, so a terminal client is a first-class
 * consumer of this API.
 */
export const POST = route(async (request) => {
  const input = await parseBody(request, signupSchema);

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash },
      select: { id: true, email: true },
    });

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
    });

    await setSessionCookie(token);

    return json({ user, token }, 201);
  } catch (error) {
    /**
     * Relies on the unique index rather than a prior existence check, which
     * would be a race: two simultaneous signups can both find the email free.
     * The database is the only thing that can decide this correctly.
     */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApiError({
        status: 409,
        code: "EMAIL_TAKEN",
        message: "An account with that email already exists. Try signing in.",
        fields: { email: "That email is already registered." },
      });
    }

    throw error;
  }
}, { rateLimit: { scope: "signup", rule: SIGNUP_LIMIT } });
