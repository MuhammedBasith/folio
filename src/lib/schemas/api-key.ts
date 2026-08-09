import { z } from "zod";

/**
 * API key payloads.
 *
 * Shared by the settings UI and the routes that serve it, so the rules a form
 * enforces and the rules the server enforces are the same rules rather than two
 * implementations that agree until one of them is edited.
 *
 * NOTHING HERE IMPORTS PRISMA. This module is pulled into the browser bundle by
 * the settings screen, and the generated client has no business there. The scope
 * values below are string-identical to the `ApiKeyScope` enum in the schema, so
 * they cross the boundary without a mapping layer.
 */

export const API_KEY_SCOPES = ["READ_ONLY", "READ_WRITE"] as const;

export type ApiKeyScopeValue = (typeof API_KEY_SCOPES)[number];

/** How each scope is described to the person choosing one. */
export const API_KEY_SCOPE_LABELS: Record<ApiKeyScopeValue, string> = {
  READ_ONLY: "Read only",
  READ_WRITE: "Read and write",
};

export const API_KEY_SCOPE_DESCRIPTIONS: Record<ApiKeyScopeValue, string> = {
  READ_ONLY:
    "Can list orders, read balances and draft chase messages. Cannot change anything.",
  READ_WRITE:
    "Everything a read-only key can do, plus creating orders and recording payments.",
};

/**
 * Longest a key may live, in days. Ten years.
 *
 * A bound rather than a free integer because `expiresAt` is arithmetic on a
 * timestamp, and an unbounded multiplier is how you get a date past the range
 * PostgreSQL will accept and a 500 on what should have been a 422.
 */
export const MAX_EXPIRY_DAYS = 3650;

/**
 * How many live keys one account may hold.
 *
 * Not a licensing limit. It bounds the damage a stolen session can do in one
 * sitting, keeps the settings screen a list a person can actually audit, and
 * stops an automation bug from minting keys forever. Twenty is far more than
 * the handful anyone legitimately needs.
 */
export const MAX_ACTIVE_API_KEYS = 20;

/**
 * The expiries the UI offers. `null` is "no expiry".
 *
 * Offered rather than mandated. A key that stops working unannounced in the
 * middle of an automation is its own kind of incident, so forcing an expiry on
 * somebody who has weighed that is not obviously safer. Ninety days is the
 * default the dialog selects, which is the conventional rotation period, and it
 * makes "Never" a deliberate choice rather than the path of least resistance.
 */
export const EXPIRY_CHOICES = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Never", days: null },
] as const satisfies ReadonlyArray<{ label: string; days: number | null }>;

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);

export const createApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give this key a name so you can recognise it later.")
    .max(60, "Keep the name under 60 characters."),
  scope: apiKeyScopeSchema,
  /**
   * Null means it never expires. The UI offers presets; the API accepts any
   * bounded whole number of days, because a caller wanting seven should not
   * have to pick ninety.
   */
  expiresInDays: z
    .number()
    .int("Expiry must be a whole number of days.")
    .min(1, "Expiry must be at least one day.")
    .max(MAX_EXPIRY_DAYS, `Expiry cannot exceed ${MAX_EXPIRY_DAYS} days.`)
    .nullable(),
  /**
   * The account password, re-entered.
   *
   * NOT THEATRE. A session cookie is seven days long and lives in a browser.
   * Minting a key from one, with no further proof, means anybody who reaches an
   * unlocked laptop, or any script that gets to run in the page, walks away
   * with a credential that outlives the session, survives a password change,
   * and is invisible unless someone reads the settings screen.
   *
   * Re-entering the password raises that from "reach the session" to "know the
   * secret", which is the same bar GitHub sets before it will hand over a
   * personal access token.
   */
  password: z.string().min(1, "Enter your password to confirm."),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

/**
 * A key's lifecycle state, derived rather than stored.
 *
 * The same reasoning as order status: `expired` is a fact about the clock, and
 * a stored column saying "active" goes wrong the moment time passes with
 * nothing to trigger a write.
 */
export type ApiKeyStatus = "active" | "expired" | "revoked";

/**
 * What the API returns about a key. Note what is absent: the key itself, and
 * its hash. Neither ever leaves the server.
 */
export interface ApiKeyDto {
  id: string;
  name: string;
  last4: string;
  scope: ApiKeyScopeValue;
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

/** The one response that carries plaintext, returned once and never again. */
export interface CreatedApiKeyResponse {
  apiKey: ApiKeyDto;
  /** Shown once. There is no endpoint that can return this value again. */
  key: string;
}
