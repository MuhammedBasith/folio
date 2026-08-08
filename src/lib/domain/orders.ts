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
 * round: there is no tax and no discount here, and both operands are
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
 * the comparison entirely, so the rule means what it says: past the due DATE.
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
 * Two consequences worth stating:
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

/** Smallest recordable payment: one cent. */
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
 * Every rejection carries `maxAllowedCents` and a message that states it,
 * because "invalid payment" tells the user nothing they can act on whereas
 * "the most you can record is $600.00" tells them what to type.
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
 * Locked once the first payment lands. The alternative (allow edits, but
 * reject any that would drop the total below what has already been collected)
 * needs a second validation path on every write and can still leave a
 * customer's receipt disagreeing with the order.
 * Freezing matches how invoicing actually works, where a settled document is
 * corrected by a credit note rather than by editing history.
 */
export function isOrderEditable(paymentCount: number): boolean {
  return paymentCount === 0;
}

/**
 * Sort order for a list somebody is going to act on.
 *
 * Due date ascending is the obvious answer and it is wrong, because it puts
 * orders that settled two months ago at the top of the page. The list exists to
 * answer "what needs chasing", so it is sorted by how much attention each row
 * wants:
 *
 *   1. overdue, longest overdue first  the money you are least likely to get
 *   2. part paid, then pending          live, ordered by what is due soonest
 *   3. paid, most recent first          done, kept for reference
 *
 * Part paid outranks pending inside the live group because someone has already
 * engaged with it; a half-settled order that goes quiet is worth a call sooner
 * than one that is not due yet.
 *
 * This is presentation, not domain truth, which is why it takes a summary
 * rather than living in the repository: the API and the CSV export keep the
 * stable due-date ordering, where a predictable sequence matters more than a
 * helpful one.
 */
const URGENCY_RANK: Record<OrderStatus, number> = {
  overdue: 0,
  partially_paid: 1,
  pending: 2,
  paid: 3,
};

export function compareByUrgency(
  a: { status: OrderStatus; dueDate: string },
  b: { status: OrderStatus; dueDate: string },
): number {
  const rank = URGENCY_RANK[a.status] - URGENCY_RANK[b.status];
  if (rank !== 0) return rank;

  // Within paid, newest first: the useful question about a settled order is
  // "what did we just close", not "what did we close in March".
  if (a.status === "paid") return b.dueDate.localeCompare(a.dueDate);

  // Everywhere else, soonest (or longest overdue) first.
  return a.dueDate.localeCompare(b.dueDate);
}

/* ------------------------------------------------------------------ */
/* Ageing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Debtor ageing.
 *
 * This is the one report every accounts receivable ledger in the world has, and
 * the reason is that "you are owed $7,368" is almost useless on its own. Money
 * that is four days late and money that is four months late are different
 * problems: the first is an admin oversight, the second is a bad debt forming.
 * The buckets are how you tell them apart at a glance, and they are what turns
 * a list into a decision about who to call first.
 *
 * The boundaries are the conventional ones (current, 1-30, 31-60, 61-90, 90+),
 * so anybody who has run a business recognises the shape without being taught
 * it. `current` holds everything not yet past its due date, including orders
 * that are part paid: they are outstanding, but they are not late.
 *
 * Derived, never stored. Every number here comes from the same due dates and
 * payments the rest of the product reads, evaluated against an injected `asOf`,
 * so the report cannot disagree with the list it sits above and cannot go stale
 * merely because time passed.
 */
export const AGEING_BUCKETS = [
  { key: "current", label: "Not yet due", from: null, to: 0 },
  { key: "d1_30", label: "1 to 30 days", from: 1, to: 30 },
  { key: "d31_60", label: "31 to 60 days", from: 31, to: 60 },
  { key: "d61_90", label: "61 to 90 days", from: 61, to: 90 },
  { key: "d90_plus", label: "Over 90 days", from: 91, to: null },
] as const;

export type AgeingBucketKey = (typeof AGEING_BUCKETS)[number]["key"];

export interface AgeingBucket {
  key: AgeingBucketKey;
  label: string;
  /** Total still owed across the orders in this bucket, in cents. */
  cents: number;
  /** How many orders landed here. */
  count: number;
}

export interface AgeingReport {
  buckets: AgeingBucket[];
  /** Everything still owed, which is the sum of every bucket. */
  totalCents: number;
  /** Everything owed that is past its due date, so every bucket but the first. */
  overdueCents: number;
}

/**
 * How many whole days past its due date an order is, as of a given moment.
 *
 * Negative or zero means it is not late yet.
 *
 * TAKES THE CALENDAR KEY, NOT A `Date`. `YYYY-MM-DD` is the canonical form of a
 * due date in this system: it is what the column stores, what the DTO carries
 * and what the API returns. Accepting a `Date` here would mean every caller
 * choosing a timezone to convert through, and the whole point of the key is
 * that there is nothing left to choose. Anyone holding a `Date` calls
 * `toUtcDateKey` first, which is one function with one answer.
 *
 * Both sides are reduced the same way `deriveOrderStatus` does, so an order can
 * never be reported as one day overdue here while reading as pending in the row
 * beside it.
 */
export function daysOverdue(dueDateKey: string, asOf: Date): number {
  const due = Date.parse(`${dueDateKey}T00:00:00.000Z`);
  const today = Date.parse(`${toUtcDateKey(asOf)}T00:00:00.000Z`);

  return Math.round((today - due) / 86_400_000);
}

function bucketFor(days: number): AgeingBucketKey {
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

/**
 * Buckets every unsettled order by how late it is.
 *
 * Settled orders are excluded rather than bucketed at zero. An ageing report
 * answers "what is still out there", and an order that has been paid is not out
 * there: including it would inflate every count with rows that need no action.
 */
export function buildAgeingReport(
  orders: readonly {
    dueCents: number;
    /** The calendar key, `YYYY-MM-DD`, exactly as the DTO carries it. */
    dueDate: string;
    status: OrderStatus;
  }[],
  asOf: Date,
): AgeingReport {
  const totals = new Map<AgeingBucketKey, { cents: number; count: number }>(
    AGEING_BUCKETS.map((bucket) => [bucket.key, { cents: 0, count: 0 }]),
  );

  for (const order of orders) {
    if (order.status === "paid" || order.dueCents <= 0) continue;

    const slot = totals.get(bucketFor(daysOverdue(order.dueDate, asOf)))!;
    slot.cents += order.dueCents;
    slot.count += 1;
  }

  const buckets = AGEING_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    ...totals.get(bucket.key)!,
  }));

  return {
    buckets,
    totalCents: sumCents(buckets.map((bucket) => bucket.cents)),
    overdueCents: sumCents(
      buckets.filter((b) => b.key !== "current").map((bucket) => bucket.cents),
    ),
  };
}
