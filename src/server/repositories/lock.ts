import type { Prisma } from "@/generated/prisma/client";
import { notFound } from "@/server/api/errors";

/**
 * Row locking for order writes.
 *
 * EVERY write path that depends on an order's payment state must call this
 * first, inside its transaction. It was originally inlined in the payment
 * repository, and that was the bug: `updateOrder` and `deleteOrder` read
 * `_count.payments` with a plain SELECT, decided the order was still editable,
 * and only touched the order row afterwards.
 *
 * Under Read Committed that unlocked read cannot see an in-flight payment, so
 * the sequence
 *
 *   PATCH   reads payments = 0, decides "editable"
 *   POST    locks the row, reads the OLD total, records a full payment, commits
 *   PATCH   replaces the lines with a cheaper set, commits
 *
 * leaves an order whose total is below the money already collected, frozen
 * (because a payment now exists) so it cannot be corrected through the product,
 * and reported as `paid` because `dueCents` clamps at zero. Both requests
 * succeeded. Neither did anything the API considered wrong.
 *
 * Extracting it into one function is the point: a new write path cannot forget
 * the lock without visibly not calling this.
 */
export async function lockOrderForWrite(
  tx: Prisma.TransactionClient,
  ownerId: string,
  orderId: string,
): Promise<void> {
  /**
   * Raw SQL because Prisma's query API has no `FOR UPDATE`. The selected column
   * is irrelevant; acquiring the lock is the entire purpose. Ownership is part
   * of the predicate so a lock is never taken on another tenant's row, and a
   * missing row is reported as 404 rather than as a failed lock.
   *
   * Values are parameterised by Prisma's tagged template. This is not string
   * concatenation and is not injectable.
   */
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "orders"
    WHERE "id" = ${orderId} AND "ownerId" = ${ownerId}
    FOR UPDATE
  `;

  if (locked.length === 0) {
    throw notFound("order");
  }
}
