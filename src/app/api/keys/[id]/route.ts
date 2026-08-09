import { authedRoute, json } from "@/server/api/handler";
import { revokeApiKey } from "@/server/repositories/api-keys";

/**
 * DELETE /api/keys/:id
 *
 * Revokes a key. Takes effect on the very next request that presents it: the
 * authenticator reads `revokedAt` on every call rather than caching a decision,
 * so there is no window in which a revoked key still works.
 *
 * `sessionOnly`, for the same reason as creation: a key must not be able to
 * revoke the keys its owner would use to lock an attacker out.
 *
 * Idempotent, and no password is asked for. Both are deliberate. This is the
 * button somebody presses the moment they think a key has leaked, and every
 * second of friction at that moment is a second the leaked key still works.
 * Revocation can only ever reduce access, so the safe direction is the fast
 * one; creation, which grants access, is the one that asks for the password.
 */
export const DELETE = authedRoute<{ id: string }>(
  async (_request, { params, session }) => {
    const { id } = await params;

    const apiKey = await revokeApiKey(session.userId, id);

    return json({ apiKey });
  },
  { sessionOnly: true },
);
