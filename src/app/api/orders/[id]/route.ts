import { authedRoute, json, parseBody } from "@/server/api/handler";
import {
  deleteOrder,
  getOrder,
  updateOrder,
} from "@/server/repositories/orders";
import { updateOrderSchema } from "@/lib/schemas/order";

type Params = { id: string };

/** GET /api/orders/:id */
export const GET = authedRoute<Params>(async (_request, { params, session }) => {
  const { id } = await params;
  const order = await getOrder(session.userId, id);

  return json({ order });
});

/**
 * PATCH /api/orders/:id
 *
 * Replaces the order's details and line items. Rejected with 409 ORDER_LOCKED
 * once any payment exists, so a total can never drop below what has been
 * collected.
 */
export const PATCH = authedRoute<Params>(async (request, { params, session }) => {
  const { id } = await params;
  const input = await parseBody(request, updateOrderSchema);
  const order = await updateOrder(session.userId, id, input);

  return json({ order });
});

/** DELETE /api/orders/:id, refused once payments exist. */
export const DELETE = authedRoute<Params>(
  async (_request, { params, session }) => {
    const { id } = await params;
    await deleteOrder(session.userId, id);

    return json({ ok: true });
  },
);
