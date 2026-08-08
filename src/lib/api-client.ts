import type { ApiErrorBody } from "@/server/api/errors";
import type { OrderDto } from "@/server/repositories/orders";
import type {
  CreateOrderInput,
  RecordPaymentInput,
} from "@/lib/schemas/order";

/**
 * Browser-side API client.
 *
 * Every mutation in the UI goes through here, so the REST API is not a parallel
 * implementation maintained on the side: it is the write path the product
 * actually uses. If an endpoint breaks, the UI breaks with it.
 *
 * Errors are surfaced as a typed `ApiClientError` carrying the server's code,
 * message and per-field messages, so a form can attach a message to the input
 * that caused it instead of dumping a banner at the top of the page.
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    body: ApiErrorBody["error"] | undefined,
    fallback: string,
  ) {
    super(body?.message ?? fallback);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body?.code ?? "INTERNAL_ERROR";
    this.fields = body?.fields ?? {};
    this.details = body?.details ?? {};
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers,
      },
      // The session cookie must ride along; the browser is authenticated by
      // cookie even though the API also accepts a bearer token.
      credentials: "same-origin",
    });
  } catch {
    // fetch only rejects on a genuine network failure, never on a 4xx or 5xx.
    throw new ApiClientError(
      0,
      undefined,
      "Could not reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload: unknown = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const body =
      isRecord(payload) && isRecord(payload.error)
        ? (payload.error as ApiErrorBody["error"])
        : undefined;

    throw new ApiClientError(
      response.status,
      body,
      "Something went wrong. Please try again.",
    );
  }

  return payload as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/* ------------------------------------------------------------------ */

export interface AuthResponse {
  user: { id: string; email: string };
  token: string;
}

export const api = {
  signup(input: { email: string; password: string }) {
    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  login(input: { email: string; password: string }) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  logout() {
    return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
  },

  createOrder(input: CreateOrderInput) {
    return request<{ order: OrderDto }>("/api/orders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateOrder(id: string, input: CreateOrderInput) {
    return request<{ order: OrderDto }>(`/api/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteOrder(id: string) {
    return request<{ ok: true }>(`/api/orders/${id}`, { method: "DELETE" });
  },

  recordPayment(orderId: string, input: RecordPaymentInput) {
    return request<{
      order: OrderDto;
      payment: { id: string; amountCents: number; paidOn: string };
    }>(`/api/orders/${orderId}/payments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
