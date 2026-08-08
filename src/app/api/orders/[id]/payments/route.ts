import { authedRoute, json, parseBody } from "@/server/api/handler";
import { recordPayment } from "@/server/repositories/payments";
import { recordPaymentSchema } from "@/lib/schemas/order";

type Params = { id: string };

/**
 * POST /api/orders/:id/payments
 *
 * Records a payment against an order and returns the updated order alongside
 * it, so a client never has to make a second request to learn the new status.
 *
 * Over-payment is rejected with 422 and a message naming the maximum that would
 * be accepted, plus `details.maxAllowedCents` for programmatic clients.
 *
 * The check and the write happen inside one transaction holding a row lock on
 * the order, so two simultaneous payments cannot both pass. See
 * `src/server/repositories/payments.ts` for the full reasoning.
 */
export const POST = authedRoute<Params>(async (request, { params, session }) => {
  const { id } = await params;
  const input = await parseBody(request, recordPaymentSchema);

  const result = await recordPayment(session.userId, id, input);

  return json(result, 201);
});
