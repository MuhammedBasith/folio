import type { Prisma } from "@/generated/prisma/client";
import { notFound, unauthenticated } from "@/server/api/errors";

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

/**
 * Row locking for API key creation.
 *
 * The cap on live keys per account is enforced by counting them and then
 * inserting. Those are two statements, and under Read Committed two concurrent
 * creates both read the same count, both decide there is room, and both insert:
 * the account ends up over the cap by however many requests were in flight.
 *
 * Serialising on the OWNER row rather than on the key rows is what makes the
 * count trustworthy, because the thing being protected is not any single row,
 * it is the answer to "how many are there", and you cannot lock rows that do
 * not exist yet.
 *
 * Contention is nil in practice: creating a key is a deliberate act performed
 * by one person in one browser tab. The lock is here because "nil in practice"
 * is not the same as "cannot happen", and a cap that can be walked past is not
 * a cap.
 */
export async function lockUserForKeyWrite(
  tx: Prisma.TransactionClient,
  ownerId: string,
): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "users"
    WHERE "id" = ${ownerId}
    FOR UPDATE
  `;

  /**
   * A session can outlive the account it names: the JWT stays valid for seven
   * days and nothing revokes it when the row is deleted. Reported as 401
   * rather than 404, because the failure is that the caller is no longer
   * anybody, not that some key could not be found.
   */
  if (locked.length === 0) {
    throw unauthenticated("That account no longer exists.");
  }
}
