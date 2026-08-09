import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { authedRoute, json, parseBody } from "@/server/api/handler";
import { SENSITIVE_LIMIT, hit } from "@/server/api/rate-limit";
import { verifyPassword } from "@/server/auth/password";
import { createApiKey, listApiKeys } from "@/server/repositories/api-keys";
import { createApiKeySchema } from "@/lib/schemas/api-key";

/**
 * API key management.
 *
 * BOTH ROUTES ARE `sessionOnly`, which is the single most important line in
 * this file. An API key that could mint further keys and revoke existing ones
 * would be a credential capable of reissuing itself: stolen once, it could
 * replace itself faster than the owner could revoke it, and could revoke the
 * keys the owner's own tooling depends on. Requiring the password-backed
 * session means the blast radius of a leaked key stops at the ledger and never
 * reaches the credentials that guard it.
 */

/**
 * GET /api/keys
 *
 * Metadata only. There is no endpoint anywhere in this application that returns
 * a key's secret, because the secret is not stored: only its SHA-256 is, and
 * that is never selected out of the database.
 */
export const GET = authedRoute(
  async (_request, { session }) => {
    const apiKeys = await listApiKeys(session.userId);

    return json({ apiKeys });
  },
  { sessionOnly: true },
);

/**
 * POST /api/keys
 *
 * Mints a key and returns it exactly once.
 */
export const POST = authedRoute(
  async (request, { session }) => {
    /**
     * Parsed BEFORE the limiter, so the budget counts password attempts rather
     * than typos.
     *
     * This is a deliberate departure from the signup endpoint, which counts
     * rejected attempts too. There, the attempt itself is the abuse. Here the
     * thing being rationed is guesses at a password, and burning somebody's
     * allowance because they left the name field blank would lock a legitimate
     * owner out of their own settings screen for fifteen minutes. General
     * flooding is already bounded by the per-credential write limit that
     * `authedRoute` applied before this handler ran.
     */
    const input = await parseBody(request, createApiKeySchema);

    const budget = hit(`api-key-mint:${session.userId}`, SENSITIVE_LIMIT);

    if (!budget.ok) {
      throw new ApiError({
        status: 429,
        code: "RATE_LIMITED",
        message:
          "Too many attempts. Wait a few minutes before creating another key.",
        details: { retryAfterSeconds: budget.retryAfter },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });

    /**
     * A valid session naming an account that no longer exists. The JWT stays
     * signed and unexpired for seven days after the row is gone, so this is
     * reachable rather than theoretical.
     */
    if (!user) {
      throw new ApiError({
        status: 401,
        code: "UNAUTHENTICATED",
        message: "That account no longer exists.",
      });
    }

    const confirmed = await verifyPassword(input.password, user.passwordHash);

    if (!confirmed) {
      /**
       * Reported against the password field so the form can attach it to the
       * input that caused it. No enumeration concern here, unlike login: the
       * caller has already proved which account this is.
       */
      throw new ApiError({
        status: 401,
        code: "INVALID_CREDENTIALS",
        message: "That password is not correct.",
        fields: { password: "That password is not correct." },
      });
    }

    const created = await createApiKey(session.userId, {
      name: input.name,
      scope: input.scope,
      expiresInDays: input.expiresInDays,
    });

    /**
     * 201 with the plaintext key in the body. THE ONLY TIME IT IS EVER SENT.
     *
     * Deliberately not logged, not echoed into any error, and not recoverable:
     * an owner who loses it revokes it and mints another.
     */
    return json(created, 201);
  },
  { sessionOnly: true },
);
