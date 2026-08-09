import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ApiKeyScope } from "@/generated/prisma/client";
import {
  ApiError,
  insufficientScope,
  sessionRequired,
  unauthenticated,
  validationFailed,
} from "./errors";
import {
  API_KEY_READ_LIMIT,
  WRITE_LIMIT,
  enforce,
  hit,
  type RateLimitResult,
  type RateLimitRule,
} from "./rate-limit";
import {
  type SessionPayload,
  readBearerToken,
  readSessionCookie,
  verifySessionToken,
} from "@/server/auth/session";
import { type ApiKeyRejection, looksLikeApiKey } from "@/server/auth/api-key";
import { authenticateApiKey } from "@/server/repositories/api-keys";

/**
 * Route plumbing.
 *
 * Every handler is wrapped so that error shape, status mapping and logging
 * happen in exactly one place. A route body can then throw an `ApiError` and
 * trust the envelope, rather than each route inventing its own.
 */

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Converts a thrown value into a response.
 *
 * Only `ApiError` and `ZodError` produce a specific message. Everything else is
 * an unhandled bug: logged in full on the server, reported as an opaque 500 to
 * the client so no internal detail escapes.
 */
function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(error.toBody(), { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(zodToApiError(error).toBody(), { status: 422 });
  }

  console.error("[api] unhandled error", error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR" as const,
        message: "Something went wrong on our end. Please try again.",
      },
    },
    { status: 500 },
  );
}

/**
 * Flattens a Zod error into one message per field.
 *
 * Nested paths are joined with dots so a client can address a line item field
 * as `lineItems.0.quantity`. Only the first message per field is surfaced;
 * showing three complaints about one input is noise, not help.
 */
export function zodToApiError(error: ZodError): ApiError {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }

  return validationFailed(fields);
}

/** Parses a body against a schema, throwing a 422 with per-field messages. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new ApiError({
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Request body must be valid JSON.",
    });
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    throw zodToApiError(result.error);
  }

  return result.data;
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

/**
 * How the caller proved who they are.
 *
 * The distinction matters beyond bookkeeping: a session is a person at a
 * browser who typed a password within the last seven days, and an API key is a
 * long-lived secret sitting in a config file on a machine. They are trusted
 * with different things, which is what `sessionOnly` below is for.
 */
export type CredentialKind = "session" | "api_key";

/**
 * The authenticated caller.
 *
 * A superset of `SessionPayload`, so every existing route that reads
 * `session.userId` keeps working untouched while gaining a credential and a
 * scope it can be judged against.
 */
export interface Principal {
  userId: string;
  email: string;
  credential: CredentialKind;
  /**
   * What this credential may do.
   *
   * A cookie or JWT session is always READ_WRITE: it was obtained with the
   * account password, so restricting it would restrict nothing that an attacker
   * holding it could not undo by simply signing in again.
   */
  scope: ApiKeyScope;
  /** The key that authenticated this request, or null for a session. */
  apiKeyId: string | null;
}

export type Authentication =
  | { ok: true; principal: Principal }
  | { ok: false; reason: "absent" | "invalid" | ApiKeyRejection };

/**
 * Resolves the caller.
 *
 * TRANSPORT PRECEDENCE, unchanged: an `Authorization` header beats the cookie,
 * so an API client authenticates explicitly regardless of what the browser
 * happens to be carrying. A header that is present but bad is a failure, not a
 * reason to fall back to the cookie; silently downgrading to whatever session
 * the browser holds is how a script ends up writing to the wrong account.
 *
 * ROUTING BETWEEN THE TWO CREDENTIALS IS BY PREFIX. An API key starts with a
 * fixed marker and a JWT cannot: a JWT is three base64url segments joined by
 * dots, whose first segment always decodes to a JSON header. No string is
 * ambiguously both, so this dispatch cannot mistake one for the other.
 */
export async function authenticate(request: Request): Promise<Authentication> {
  const bearer = readBearerToken(request);

  if (bearer) {
    if (looksLikeApiKey(bearer)) {
      const result = await authenticateApiKey(bearer);

      return result.ok
        ? {
            ok: true,
            principal: {
              userId: result.key.ownerId,
              email: result.key.email,
              credential: "api_key",
              scope: result.key.scope,
              apiKeyId: result.key.id,
            },
          }
        : {
            ok: false,
            // A key matching no stored hash is indistinguishable from a
            // fabricated one, so it collapses into the same generic `invalid`
            // as a malformed JWT. Only `revoked` and `expired`, which require
            // holding the real secret to reach, keep their specific reason.
            reason: result.reason === "unknown" ? "invalid" : result.reason,
          };
    }

    return fromSessionToken(await verifySessionToken(bearer));
  }

  const cookieToken = await readSessionCookie();

  if (cookieToken) {
    return fromSessionToken(await verifySessionToken(cookieToken));
  }

  return { ok: false, reason: "absent" };
}

function fromSessionToken(payload: SessionPayload | null): Authentication {
  if (!payload) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    principal: {
      userId: payload.userId,
      email: payload.email,
      credential: "session",
      scope: "READ_WRITE",
      apiKeyId: null,
    },
  };
}

/**
 * Turns a failed authentication into the response the caller sees.
 *
 * `revoked` and `expired` say so. Reaching either branch requires presenting
 * the exact 256-bit secret, so the person reading the message already holds
 * that key and learns nothing from being told it is switched off, while
 * somebody debugging their own CLI at midnight is saved from guessing.
 * Everything else collapses to one generic refusal.
 */
function toAuthError(reason: Exclude<Authentication, { ok: true }>["reason"]) {
  switch (reason) {
    case "revoked":
      return unauthenticated(
        "That API key has been revoked. Create a new one in Settings.",
      );
    case "expired":
      return unauthenticated(
        "That API key has expired. Create a new one in Settings.",
      );
    default:
      return unauthenticated();
  }
}

export async function requireSession(request: Request): Promise<Principal> {
  const result = await authenticate(request);

  if (!result.ok) {
    throw toAuthError(result.reason);
  }

  return result.principal;
}

/* ------------------------------------------------------------------ */
/* Wrappers                                                            */
/* ------------------------------------------------------------------ */

type RouteContext<P> = { params: Promise<P> };

/**
 * Handlers return `Response`, not `NextResponse`.
 *
 * `NextResponse` is a `Response`, so JSON routes still satisfy this, while the
 * CSV export can return a plain `Response` with its own content-type and
 * content-disposition headers without being forced through a JSON wrapper.
 */

interface RouteOptions {
  /**
   * Rate limit this route by client address.
   *
   * Declared here rather than called at the top of each handler, because a
   * limit a route can forget to apply is a limit that will eventually be
   * forgotten. `scope` keys the bucket, so login and signup are counted
   * separately and one does not exhaust the other.
   */
  rateLimit?: { scope: string; rule: RateLimitRule };
}

/** Wraps a public route so thrown errors become the standard envelope. */
export function route<P = Record<string, never>>(
  handler: (request: Request, context: RouteContext<P>) => Promise<Response>,
  options: RouteOptions = {},
) {
  return async (
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> => {
    try {
      if (options.rateLimit) {
        enforce(request, options.rateLimit.scope, options.rateLimit.rule);
      }

      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

interface AuthedRouteOptions {
  /**
   * Refuse API keys on this route, whatever their scope.
   *
   * Reserved for the endpoints that manage credentials. A read-write key that
   * could mint further keys and revoke existing ones is a credential that can
   * reissue itself and lock its owner out, which means it can never really be
   * taken away. Declared here rather than checked inside the handler, for the
   * same reason the rate limit is: a guard a route can forget to apply is a
   * guard that will eventually be forgotten.
   */
  sessionOnly?: boolean;
}

/**
 * Wraps a route that requires authentication.
 *
 * THIS IS THE ONE PLACE THE THREE AUTHORISATION QUESTIONS ARE ASKED. Who are
 * you, may this kind of credential be here at all, and is it allowed to write?
 * No handler answers them, so no handler can answer them wrongly. Tenant
 * isolation then follows from every repository call taking the resolved
 * `userId`, rather than from remembering to add a where clause.
 */
export function authedRoute<P = Record<string, never>>(
  handler: (
    request: Request,
    context: RouteContext<P> & { session: Principal },
  ) => Promise<Response>,
  options: AuthedRouteOptions = {},
) {
  return async (
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> => {
    try {
      const session = await requireSession(request);
      const isWrite = request.method !== "GET" && request.method !== "HEAD";

      /**
       * Counted BEFORE the credential and scope checks, so a refused request
       * still costs budget. The alternative lets a read-only key spin against a
       * write endpoint forever: every attempt is rejected, but every attempt
       * has already cost a database lookup to authenticate, and nothing is
       * keeping score. Same reasoning as the signup limiter counting rejected
       * attempts.
       *
       * KEYED PER CREDENTIAL, NOT PER ACCOUNT. Per account, one runaway agent
       * would exhaust the budget its owner needs to use their own dashboard.
       * Per credential, a misbehaving key throttles only itself, and the cap on
       * how many keys an account may hold bounds the total.
       *
       * Browser reads stay unlimited: the dashboard is a read, and throttling
       * it would punish somebody for pressing refresh. Machine reads are
       * counted, because an agent in a loop does not get tired.
       */
      const bucket = session.apiKeyId ?? session.userId;

      if (isWrite) {
        enforceBudget(hit(`write:${bucket}`, WRITE_LIMIT));
      } else if (session.credential === "api_key") {
        enforceBudget(hit(`read:${bucket}`, API_KEY_READ_LIMIT));
      }

      if (options.sessionOnly && session.credential === "api_key") {
        throw sessionRequired();
      }

      /**
       * The scope gate, expressed against the HTTP METHOD rather than against a
       * per-route declaration.
       *
       * Deliberate: a route that mutates state and answers to GET would be a
       * bug on its own, and deriving the check from the method means a new
       * endpoint is covered the moment it exists. Nobody has to remember to
       * label it.
       */
      if (isWrite && session.scope === "READ_ONLY") {
        throw insufficientScope();
      }

      return await handler(request, { ...context, session });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

function enforceBudget(result: RateLimitResult): void {
  if (result.ok) return;

  throw new ApiError({
    status: 429,
    code: "RATE_LIMITED",
    message: "That is a lot of requests at once. Give it a moment.",
    details: { retryAfterSeconds: result.retryAfter },
  });
}
