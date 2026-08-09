/**
 * API error vocabulary.
 *
 * Every failure the API can produce is one of these codes. Two rules:
 *
 *   1. The code is stable and machine-readable, so a client can branch on it.
 *   2. The message is written for a human and says what to do next.
 *      "Invalid payment" tells someone nothing they can act on; "the most you
 *      can record is $600.00" tells them exactly what to type.
 */

export const API_ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "NOT_FOUND",
  "ORDER_LOCKED",
  "PAYMENT_BELOW_MINIMUM",
  "PAYMENT_EXCEEDS_BALANCE",
  "ORDER_ALREADY_SETTLED",
  "METHOD_NOT_ALLOWED",
  "RATE_LIMITED",
  "INSUFFICIENT_SCOPE",
  "SESSION_REQUIRED",
  "API_KEY_LIMIT_REACHED",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Per-field messages, keyed by the field the client submitted. */
    fields?: Record<string, string>;
    /** Structured extras a client can act on, e.g. `maxAllowedCents`. */
    details?: Record<string, unknown>;
  };
}

/**
 * An expected, client-facing failure.
 *
 * Anything thrown that is NOT an ApiError is treated as a bug: it is logged in
 * full server-side and reported to the client as a generic 500, so an internal
 * message or stack can never leak into a response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
    details?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.details = init.details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

/* Constructors for the cases used more than once. ------------------- */

export function validationFailed(
  fields: Record<string, string>,
  message = "Some of the details you entered need fixing.",
): ApiError {
  return new ApiError({ status: 422, code: "VALIDATION_FAILED", message, fields });
}

export function unauthenticated(
  message = "Sign in to continue.",
): ApiError {
  return new ApiError({ status: 401, code: "UNAUTHENTICATED", message });
}

export function notFound(entity = "resource"): ApiError {
  return new ApiError({
    status: 404,
    code: "NOT_FOUND",
    // Deliberately identical whether the row is missing or simply belongs to
    // someone else. Distinguishing them would confirm the existence of another
    // tenant's records.
    message: `That ${entity} does not exist, or you do not have access to it.`,
  });
}

/**
 * The caller is who they say they are, but this credential may not do this.
 *
 * 403, NOT 404, AND THAT DOES NOT CONTRADICT `notFound` ABOVE. The 404 rule
 * exists so the API never confirms that another tenant's row exists. This is a
 * different question: the caller owns the resource, and the refusal is about
 * the credential they chose to present. It is evaluated BEFORE anything is
 * looked up, so it is identical for a real id and an invented one and therefore
 * discloses nothing about what exists.
 *
 * Saying which scope was needed is deliberate. The person reading this is
 * almost always the owner of the key, holding a terminal, wondering why their
 * script stopped working.
 */
export function insufficientScope(): ApiError {
  return new ApiError({
    status: 403,
    code: "INSUFFICIENT_SCOPE",
    message:
      "This API key is read only. Recording payments or changing orders needs a key with read and write access.",
    details: { requiredScope: "READ_WRITE" },
  });
}

/**
 * This endpoint refuses API keys outright, whatever their scope.
 *
 * Guards the key management endpoints themselves. Without it, a stolen
 * read-write key could mint further keys and revoke the ones the owner would
 * use to lock the attacker out: a credential that can reissue itself is a
 * credential that cannot be taken away. Managing keys therefore requires the
 * password-backed session, which is the thing an attacker holding only a key
 * does not have.
 */
export function sessionRequired(): ApiError {
  return new ApiError({
    status: 403,
    code: "SESSION_REQUIRED",
    message:
      "API keys cannot manage API keys. Sign in from a browser to create or revoke them.",
  });
}

export function orderLocked(): ApiError {
  return new ApiError({
    status: 409,
    code: "ORDER_LOCKED",
    message:
      "This order has payments recorded against it and can no longer be edited. Its total must never fall below what has already been collected.",
  });
}
