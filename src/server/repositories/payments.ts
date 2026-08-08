import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import {
  calculateAmountPaidCents,
  calculateOrderTotalCents,
  validatePayment,
} from "@/lib/domain/orders";
import type { RecordPaymentInput } from "@/lib/schemas/order";
import { lockOrderForWrite } from "./lock";
import { type OrderDto, toDateOnly } from "./orders";
import { getOrder } from "./orders";

/**
 * Payment recording.
 *
 * THIS IS THE ONE PLACE IN THE APPLICATION THAT NEEDS A LOCK.
 *
 * The race, concretely: an order has $600 outstanding and two $600 payments
 * arrive a millisecond apart, from a double-clicked button or two people
 * working the same account.
 *
 *   request A: reads balance -> $600 due -> $600 is allowed
 *   request B: reads balance -> $600 due -> $600 is allowed   (A has not committed)
 *   request A: inserts payment, commits
 *   request B: inserts payment, commits
 *   result:    $1,200 collected against a $600 balance
 *
 * Both requests ran the validation and both passed it. Validation alone cannot
 * fix this, because the balance each one read was already stale by the time it
 * decided.
 *
 * The fix is to make read-validate-write one indivisible operation:
 *
 *   1. Open a transaction.
 *   2. `SELECT ... FOR UPDATE` the order row. This takes a row-level exclusive
 *      lock. Request B now BLOCKS here until A commits.
 *   3. Sum the payments INSIDE the lock, so the balance is current by
 *      construction rather than by timing.
 *   4. Validate and insert.
 *   5. Commit, releasing the lock. B proceeds, re-reads, correctly sees $0 due,
 *      and is rejected with the right message.
 *
 * The lock is taken on the ORDER row rather than on the payments, because the
 * invariant belongs to the order: you cannot lock rows that do not exist yet,
 * and the thing being protected is "the sum of this order's payments".
 *
 * ISOLATION LEVEL: Read Committed is sufficient here and is PostgreSQL's
 * default. `FOR UPDATE` provides the mutual exclusion; a higher level would add
 * serialisation failures to handle without adding safety for this invariant.
 *
 */

export interface RecordPaymentResult {
  order: OrderDto;
  payment: {
    id: string;
    amountCents: number;
    paidOn: string;
    note: string | null;
  };
}

export async function recordPayment(
  ownerId: string,
  orderId: string,
  input: RecordPaymentInput,
  asOf: Date = new Date(),
): Promise<RecordPaymentResult> {
  const paymentId = await prisma.$transaction(async (tx) => {
    // Step 1: take the row lock. Shared with the order write paths so there is
    // exactly one implementation of it. See `lock.ts`.
    await lockOrderForWrite(tx, ownerId, orderId);

    /**
     * Step 2: read the balance while holding the lock.
     *
     * A concurrent request is parked at the SELECT above and cannot have
     * inserted anything that this read would miss.
     */
    const [lineItems, payments] = await Promise.all([
      tx.lineItem.findMany({
        where: { orderId },
        select: { quantity: true, unitPriceCents: true },
      }),
      tx.payment.findMany({
        where: { orderId },
        select: { amountCents: true },
      }),
    ]);

    const totalCents = calculateOrderTotalCents(lineItems);
    const alreadyPaidCents = calculateAmountPaidCents(payments);

    // Step 3: the domain layer decides. This module only enforces atomicity.
    const verdict = validatePayment({
      amountCents: input.amountCents,
      totalCents,
      alreadyPaidCents,
    });

    if (!verdict.ok) {
      throw new ApiError({
        status: 422,
        code: verdict.code,
        message: verdict.message,
        fields: { amountCents: verdict.message },
        details: {
          maxAllowedCents: verdict.maxAllowedCents,
          totalCents,
          alreadyPaidCents,
        },
      });
    }

    // Step 4: insert, still inside the lock.
    const created = await tx.payment.create({
      data: {
        orderId,
        amountCents: input.amountCents,
        paidOn: toDateOnly(input.paidOn),
        note: input.note ?? null,
      },
      select: { id: true },
    });

    return created.id;
    // Step 5: commit releases the lock.
  });

  const order = await getOrder(ownerId, orderId, asOf);
  const payment = order.payments.find((entry) => entry.id === paymentId);

  if (!payment) {
    throw new Error("Recorded payment was not found on the reloaded order.");
  }

  return {
    order,
    payment: {
      id: payment.id,
      amountCents: payment.amountCents,
      paidOn: payment.paidOn,
      note: payment.note,
    },
  };
}
