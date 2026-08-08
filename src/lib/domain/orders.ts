import { MAX_QUANTITY, formatMoney, sumCents } from "@/lib/money";

/**
 * Order domain rules.
 *
 * Every function here is pure: no database, no clock of its own, no framework.
 * The current time is always passed in as `asOf`, which is what makes "this
 * order goes overdue tomorrow" a test you can actually write rather than one
 * that depends on when CI happens to run.
 *
 * This module is the single source of truth for money and status. The API
 * routes and the UI both read from it; neither reimplements a rule.
 */

export const ORDER_STATUSES = [
  "pending",
  "partially_paid",
  "paid",
  "overdue",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

export interface LineItemAmounts {
  quantity: number;
  unitPriceCents: number;
}

export interface PaymentAmount {
  amountCents: number;
}

export interface OrderTotals {
  /** Sum of every line: quantity x unit price. */
  totalCents: number;
  /** Sum of every payment recorded against the order. */
  paidCents: number;
  /** What is still owed. Never negative: over-payment is rejected upstream. */
  dueCents: number;
}

/* ------------------------------------------------------------------ */
/* Totals                                                              */
/* ------------------------------------------------------------------ */

/**
 * Line total in cents.
 *
 * `quantity` is a whole number and `unitPriceCents` is an integer, so the
 * product is exact. There is no rounding step here because there is nothing to
 * round: this assignment has no tax and no discount, and both operands are
 * already integers.
 */
export function calculateLineTotalCents(line: LineItemAmounts): number {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
    throw new RangeError(`Line quantity must be a whole number of 1 or more.`);
  }

  if (line.quantity > MAX_QUANTITY) {
    throw new RangeError(`Line quantity cannot exceed ${MAX_QUANTITY}.`);
  }

  if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
    throw new RangeError("Line unit price must be a non-negative integer.");
  }

  const total = line.quantity * line.unitPriceCents;

  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Line total exceeded the safe integer range.");
  }

  return total;
}

export function calculateOrderTotalCents(
  lineItems: readonly LineItemAmounts[],
): number {
  return sumCents(lineItems.map(calculateLineTotalCents));
}

export function calculateAmountPaidCents(
  payments: readonly PaymentAmount[],
): number {
  return sumCents(payments.map((payment) => payment.amountCents));
}

export function calculateOrderTotals(
  lineItems: readonly LineItemAmounts[],
  payments: readonly PaymentAmount[],
): OrderTotals {
  const totalCents = calculateOrderTotalCents(lineItems);
  const paidCents = calculateAmountPaidCents(payments);

  return {
    totalCents,
    paidCents,
    // Clamped at zero. Over-payment cannot happen through the API, but a
    // negative "amount due" rendered in the UI would be a worse failure than a
    // zero, and clamping keeps a corrupted row from producing nonsense.
    dueCents: Math.max(0, totalCents - paidCents),
  };
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reduces a Date to its UTC calendar day, as `YYYY-MM-DD`.
 *
 * Due dates are stored as SQL DATE (no time component), which Prisma hands back
 * as midnight UTC. Comparing that against a raw `new Date()` would make an
 * order tip into `overdue` at midnight UTC rather than at the end of its due
 * day. Reducing both sides to a calendar key removes the time component from
 * the comparison entirely, so the rule reads exactly as the brief states it:
 * past the due DATE.
 *
 * Consequence, documented in the README: "today" is UTC today. For a single
 * user in one timezone that is at most a few hours of skew on the day an order
 * falls due, and the alternative (per-user timezones) is well outside scope.
 */
export function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DeriveStatusInput {
  totalCents: number;
  paidCents: number;
  dueDate: Date;
  /** The moment to evaluate against. Injected so tests are deterministic. */
  asOf: Date;
}

/**
 * Derives order status.
 *
 * Status is never stored. Two reasons: a stored total goes stale the moment a
 * line item is edited, and `overdue` would go stale merely because time passed,
 * with no write to trigger an update.
 *
 * THE ORDERING IS THE RULE. The four states overlap (an order can truthfully be
 * both partially paid and overdue), so precedence decides what the user sees:
 *
 *   1. Fully covered            -> paid
 *   2. Past the due date        -> overdue
 *   3. Something has been paid  -> partially_paid
 *   4. Otherwise                -> pending
 *
 * Consequences worth stating, both required by the brief:
 *
 *   - An order that was overdue and has since been settled reads `paid`, not
 *     `overdue`. Nothing is owed, so nothing can be late.
 *   - An unpaid order past its date reads `overdue`, not `pending`, because
 *     lateness is the more urgent fact for the person reading the dashboard.
 *
 * A zero-total order counts as `paid`: nothing is owed, so it is settled.
 */
export function deriveOrderStatus({
  totalCents,
  paidCents,
  dueDate,
  asOf,
}: DeriveStatusInput): OrderStatus {
  if (paidCents >= totalCents) {
    return "paid";
  }

  if (toUtcDateKey(asOf) > toUtcDateKey(dueDate)) {
    return "overdue";
  }

  if (paidCents > 0) {
    return "partially_paid";
  }

  return "pending";
}

export interface OrderSummary extends OrderTotals {
  status: OrderStatus;
}

/** Totals and status in one pass, which is what every read path actually needs. */
export function summariseOrder(
  lineItems: readonly LineItemAmounts[],
  payments: readonly PaymentAmount[],
  dueDate: Date,
  asOf: Date,
): OrderSummary {
  const totals = calculateOrderTotals(lineItems, payments);

  return {
    ...totals,
    status: deriveOrderStatus({
      totalCents: totals.totalCents,
      paidCents: totals.paidCents,
      dueDate,
      asOf,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Payment validation                                                  */
/* ------------------------------------------------------------------ */

/** Smallest recordable payment: one cent, per the brief's "amount >= 0.01". */
export const MIN_PAYMENT_CENTS = 1;

export type PaymentRejectionCode =
  | "PAYMENT_BELOW_MINIMUM"
  | "ORDER_ALREADY_SETTLED"
  | "PAYMENT_EXCEEDS_BALANCE";

export type PaymentValidation =
  | { ok: true }
  | {
      ok: false;
      code: PaymentRejectionCode;
      message: string;
      /** Largest payment that would be accepted right now, in cents. */
      maxAllowedCents: number;
    };

/**
 * Decides whether a payment may be recorded.
 *
 * The brief asks for over-payment to be rejected with "a clear, actionable
 * error (e.g. include the maximum allowed amount)", so every rejection carries
 * `maxAllowedCents` and a message that states it. "Invalid payment" tells the
 * user nothing they can act on.
 *
 * This function is pure and therefore not a defence against the concurrent
 * double-payment race on its own: two callers can both pass it with stale
 * balances. The lock that makes it safe lives in the payment repository, which
 * re-reads the balance inside a transaction that holds a row lock.
 */
export function validatePayment({
  amountCents,
  totalCents,
  alreadyPaidCents,
}: {
  amountCents: number;
  totalCents: number;
  alreadyPaidCents: number;
}): PaymentValidation {
  const remainingCents = Math.max(0, totalCents - alreadyPaidCents);

  if (!Number.isSafeInteger(amountCents) || amountCents < MIN_PAYMENT_CENTS) {
    return {
      ok: false,
      code: "PAYMENT_BELOW_MINIMUM",
      message: `Payment must be at least ${formatMoney(MIN_PAYMENT_CENTS)}.`,
      maxAllowedCents: remainingCents,
    };
  }

  if (remainingCents === 0) {
    return {
      ok: false,
      code: "ORDER_ALREADY_SETTLED",
      message:
        "This order is already fully paid, so no further payment can be recorded.",
      maxAllowedCents: 0,
    };
  }

  if (amountCents > remainingCents) {
    return {
      ok: false,
      code: "PAYMENT_EXCEEDS_BALANCE",
      message: `Payment of ${formatMoney(amountCents)} exceeds the amount due. The most you can record for this order is ${formatMoney(remainingCents)}.`,
      maxAllowedCents: remainingCents,
    };
  }

  return { ok: true };
}

/**
 * Whether an order's contents may still be changed.
 *
 * Locked once the first payment lands. The brief allows either policy provided
 * it is explained: the alternative (allow edits, but reject any that would drop
 * the total below what has already been collected) needs a second validation
 * path and can still leave a customer's receipt disagreeing with the order.
 * Freezing matches how invoicing actually works, where a settled document is
 * corrected by a credit note rather than by editing history.
 */
export function isOrderEditable(paymentCount: number): boolean {
  return paymentCount === 0;
}
