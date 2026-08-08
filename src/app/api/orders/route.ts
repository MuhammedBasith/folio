import { authedRoute, json, parseBody, zodToApiError } from "@/server/api/handler";
import { createOrder, listOrders } from "@/server/repositories/orders";
import { createOrderSchema, listOrdersQuerySchema } from "@/lib/schemas/order";

/**
 * GET /api/orders?status=pending|partially_paid|paid|overdue|all
 *
 * Returns only the caller's orders, each with totals and derived status.
 */
export const GET = authedRoute(async (request, { session }) => {
  const url = new URL(request.url);

  const parsed = listOrdersQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    throw zodToApiError(parsed.error);
  }

  const orders = await listOrders(session.userId, { status: parsed.data.status });

  return json({ orders });
});

/**
 * POST /api/orders
 *
 * Creates an order with its line items. The total is computed from the lines
 * and is never accepted from the client.
 */
export const POST = authedRoute(async (request, { session }) => {
  const input = await parseBody(request, createOrderSchema);
  const order = await createOrder(session.userId, input);

  return json({ order }, 201);
});
