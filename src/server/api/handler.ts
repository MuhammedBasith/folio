import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, unauthenticated, validationFailed } from "./errors";
import {
  type SessionPayload,
  readBearerToken,
  readSessionCookie,
  verifySessionToken,
} from "@/server/auth/session";

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
 * Resolves the caller, or null.
 *
 * Bearer header wins over cookie so an API client can authenticate explicitly
 * regardless of what the browser is carrying, which is what makes the API
 * testable from a terminal.
 */
export async function resolveSession(
  request: Request,
): Promise<SessionPayload | null> {
  const bearer = readBearerToken(request);

  if (bearer) {
    return verifySessionToken(bearer);
  }

  const cookieToken = await readSessionCookie();

  if (cookieToken) {
    return verifySessionToken(cookieToken);
  }

  return null;
}

export async function requireSession(
  request: Request,
): Promise<SessionPayload> {
  const session = await resolveSession(request);

  if (!session) {
    throw unauthenticated();
  }

  return session;
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

/** Wraps a public route so thrown errors become the standard envelope. */
export function route<P = Record<string, never>>(
  handler: (request: Request, context: RouteContext<P>) => Promise<Response>,
) {
  return async (
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * Wraps a route that requires authentication.
 *
 * The session is resolved before the handler runs, so no handler can forget the
 * check. Tenant isolation is then enforced by every repository call taking the
 * resolved `userId`, rather than by remembering to add a where clause.
 */
export function authedRoute<P = Record<string, never>>(
  handler: (
    request: Request,
    context: RouteContext<P> & { session: SessionPayload },
  ) => Promise<Response>,
) {
  return async (
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> => {
    try {
      const session = await requireSession(request);
      return await handler(request, { ...context, session });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
