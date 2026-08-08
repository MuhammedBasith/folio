import { formatMoney } from "@/lib/money";
import type { OrderStatus } from "@/lib/domain/orders";
import { daysOverdue } from "@/lib/domain/orders";

/**
 * The chase message.
 *
 * WHAT THIS PRODUCT IS ACTUALLY FOR. Nobody opens a receivables ledger to
 * admire the total; they open it because somebody has not paid and they have to
 * write the awkward email. The rest of the app answers "who owes me what". This
 * answers the question immediately after it, which is "what do I say", and it
 * is the difference between a report and a tool.
 *
 * It drafts rather than sends. There is no mail transport here and adding one
 * would be a different product with a different set of failure modes, secrets
 * and deliverability problems. A draft on the clipboard costs nothing, works
 * with whatever the user already sends mail from, and leaves the wording under
 * their control, which matters a great deal when the recipient is a customer
 * they want to keep.
 *
 * THE TONE ESCALATES WITH THE AGE, because a real person's would. A gentle
 * nudge the week something falls due and a firm note at ninety days are
 * different emails, and sending the ninety day one on day two loses you the
 * account. The thresholds match the ageing buckets on the dashboard, so what
 * the report says and what the message sounds like cannot drift apart.
 *
 * Pure and clock-injected like everything else in the domain layer, which is
 * what makes "the wording at 61 days" a test rather than a thing you find out
 * in production.
 */

export interface ChaseInput {
  reference: string;
  customer: string;
  /** The calendar key, `YYYY-MM-DD`. */
  dueDate: string;
  totalCents: number;
  paidCents: number;
  dueCents: number;
  status: OrderStatus;
  asOf: Date;
  /** The sender's name, appended as a sign-off when there is one. */
  senderName?: string;
}

export interface ChaseMessage {
  subject: string;
  body: string;
  /** Which register the message is written in, for labelling the UI. */
  tone: "reminder" | "nudge" | "firm" | "final";
}

/**
 * Parsed and formatted in UTC on both sides. A local parse west of Greenwich
 * turns a date stored as the 3rd into the 2nd, and this string is going into an
 * email a customer will hold you to.
 */
function formatDue(dueDateKey: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dueDateKey}T00:00:00.000Z`));
}

function toneFor(days: number): ChaseMessage["tone"] {
  if (days <= 0) return "reminder";
  if (days <= 30) return "nudge";
  if (days <= 90) return "firm";
  return "final";
}

const OPENING: Record<ChaseMessage["tone"], (days: number) => string> = {
  reminder: (days) =>
    days === 0
      ? "This is just a note that the invoice below falls due today."
      : `This is just a note that the invoice below falls due in ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}.`,
  nudge: (days) =>
    `I wanted to check in on the invoice below, which is now ${days} ${days === 1 ? "day" : "days"} past its due date. I appreciate these things slip through.`,
  firm: (days) =>
    `The invoice below is now ${days} days past its due date. Could you let me know when it is likely to be settled, or put me in touch with whoever handles payments on your side?`,
  final: (days) =>
    `The invoice below is now ${days} days past its due date and remains unpaid. I would rather resolve this directly with you than escalate it, so please reply with a payment date this week.`,
};

const SIGN_OFF: Record<ChaseMessage["tone"], string> = {
  reminder: "Thanks very much,",
  nudge: "Thanks very much,",
  firm: "Thank you,",
  final: "Regards,",
};

/**
 * Composes the draft.
 *
 * Throws on a settled order. There is nothing to chase, so producing a polite
 * request for zero pounds would be a bug that reaches a customer, and returning
 * an empty string would push the same check out to every caller. The UI does
 * not offer the action in that state, which makes this the assertion that keeps
 * it that way.
 */
export function buildChaseMessage(input: ChaseInput): ChaseMessage {
  if (input.dueCents <= 0 || input.status === "paid") {
    throw new Error("Cannot chase an order with nothing outstanding.");
  }

  const days = daysOverdue(input.dueDate, input.asOf);
  const tone = toneFor(days);

  const subject =
    tone === "reminder"
      ? `${input.reference} due ${formatDue(input.dueDate)}`
      : `${input.reference} overdue: ${formatMoney(input.dueCents)} outstanding`;

  // A part payment is acknowledged before the balance is asked for. Being
  // chased for the full amount after paying half of it is the fastest way to
  // make a customer stop replying.
  const ledger =
    input.paidCents > 0
      ? [
          `Order ${input.reference}`,
          `Total: ${formatMoney(input.totalCents)}`,
          `Received, with thanks: ${formatMoney(input.paidCents)}`,
          `Still outstanding: ${formatMoney(input.dueCents)}`,
          `Due: ${formatDue(input.dueDate)}`,
        ]
      : [
          `Order ${input.reference}`,
          `Amount: ${formatMoney(input.dueCents)}`,
          `Due: ${formatDue(input.dueDate)}`,
        ];

  const closing =
    input.paidCents > 0 && tone !== "reminder"
      ? "Thank you for the payment already made. If the balance has been sent since, please ignore this."
      : "If this has already been paid, please ignore this note and accept my apologies.";

  const body = [
    `Hello ${input.customer},`,
    "",
    OPENING[tone](days),
    "",
    ...ledger,
    "",
    closing,
    "",
    SIGN_OFF[tone],
    input.senderName ?? "",
  ]
    .join("\n")
    .trimEnd();

  return { subject, body, tone };
}
