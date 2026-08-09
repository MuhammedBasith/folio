import { API_KEY_READ_LIMIT, hit } from "@/server/api/rate-limit";
import { looksLikeApiKey } from "@/server/auth/api-key";
import { readBearerToken } from "@/server/auth/session";
import { authenticateApiKey } from "@/server/repositories/api-keys";
import { createFolioMcpHandler } from "@/server/mcp/server";

/**
 * The Model Context Protocol endpoint.
 *
 * Connect it from a terminal with:
 *
 *   claude mcp add --transport http folio https://your-deployment/mcp \
 *     --header "Authorization: Bearer folio_sk_..."
 *
 * THIS ENDPOINT AUTHENTICATES WITH API KEYS AND NOTHING ELSE, and that is a
 * security decision rather than a simplification.
 *
 * A cookie is an AMBIENT credential: the browser attaches it to qualifying
 * requests on its own, without the page having to know it exists. That is what
 * makes cross-site request forgery possible at all. Accepting cookies here
 * would mean any page a signed-in user visits could try to drive their ledger
 * through this endpoint. The session cookie's `sameSite=lax` already blocks the
 * cross-site POST that would be needed, so this is a second lock on a door that
 * is already bolted, but the cost is one `if` and it removes the entire class
 * rather than relying on one flag staying correct forever.
 *
 * It is also why no CSRF token is needed and why DNS rebinding, which the MCP
 * security guidance warns about for HTTP transports, does not apply: an
 * attacker who tricks a browser into resolving this host still has no
 * credential to send, because the only credential this endpoint accepts is one
 * that must be attached deliberately.
 *
 * The Node runtime is required, not incidental: authentication reaches
 * PostgreSQL through Prisma, and the domain layer runs here unchanged.
 */
export const runtime = "nodejs";

/**
 * Refuses with RFC 6750's `WWW-Authenticate`, deliberately WITHOUT a
 * `resource_metadata` parameter.
 *
 * A client that sees that parameter goes looking for an OAuth authorization
 * server. This deployment does not run one: it issues long-lived keys from the
 * settings screen instead. Advertising a discovery document that does not exist
 * would send Claude Code down a flow that can only dead-end, which is a worse
 * failure than a clear 401 saying exactly what to do. If Folio ever grows a
 * real OAuth server, this is the one place that changes.
 */
function unauthorised(detail: string, hint?: string): Response {
  /**
   * STRIPPED, NOT INTERPOLATED RAW.
   *
   * `error_description` lands inside a quoted-string in the `WWW-Authenticate`
   * header, and RFC 7235 gives that grammar no room for a bare `"` or `\`. A
   * description containing either produces a header a strict client reads as
   * truncated and a lenient one reads as garbage. The first draft of this file
   * did exactly that, by embedding an example command with quoted arguments in
   * the description.
   *
   * Sanitising here rather than trusting every future caller to remember makes
   * the header well formed by construction. Guidance that genuinely needs
   * punctuation goes in `hint`, which is JSON and has no such constraint.
   */
  const headerSafe = detail.replace(/["\\]/g, "");

  return new Response(
    JSON.stringify({
      error: "unauthorized",
      error_description: detail,
      ...(hint ? { hint } : {}),
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer error="invalid_token", error_description="${headerSafe}"`,
        // Nothing about this response is cacheable, and a cached 401 sitting in
        // an intermediary would outlive the key that fixes it.
        "cache-control": "no-store",
      },
    },
  );
}

async function handle(request: Request): Promise<Response> {
  const bearer = readBearerToken(request);

  if (!bearer || !looksLikeApiKey(bearer)) {
    return unauthorised(
      "Send a Folio API key as a bearer token.",
      'Create a key under Settings, then: claude mcp add --transport http folio <url> --header "Authorization: Bearer <key>"',
    );
  }

  const result = await authenticateApiKey(bearer);

  if (!result.ok) {
    /**
     * Same reasoning as the REST API: `revoked` and `expired` are only
     * reachable by presenting the exact secret, so naming them tells the holder
     * nothing they could not learn by trying, and saves somebody a long evening
     * wondering why their agent went quiet.
     */
    return unauthorised(
      result.reason === "revoked"
        ? "That API key has been revoked. Create a new one under Settings."
        : result.reason === "expired"
          ? "That API key has expired. Create a new one under Settings."
          : "That API key is not valid.",
    );
  }

  /**
   * Every MCP request costs one unit of the read budget, keyed on the key
   * itself. Write tools charge the write budget on top of this, inside the
   * tool. The two together mean an agent stuck in a loop is bounded exactly as
   * a curl loop against the REST API would be.
   */
  const budget = hit(`read:${result.key.id}`, API_KEY_READ_LIMIT);

  if (!budget.ok) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        error_description: "Too many requests. Slow down and try again shortly.",
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(budget.retryAfter),
          "cache-control": "no-store",
        },
      },
    );
  }

  /**
   * Built here, after authentication, so the tools close over THIS request's
   * principal. See the note in `server.ts`: this is what makes it impossible
   * for two concurrent requests to see each other's account.
   */
  const handler = createFolioMcpHandler({
    userId: result.key.ownerId,
    email: result.key.email,
    credential: "api_key",
    scope: result.key.scope,
    apiKeyId: result.key.id,
  });

  return handler(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
