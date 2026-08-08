import type { OrderStatus } from "@/lib/domain/orders";

/**
 * Presentation helpers.
 *
 * Kept apart from `money.ts`, which owns arithmetic. This module only decides
 * how a value reads on screen.
 */

/** Human label for a status. `partially_paid` is not a thing to show a user. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  partially_paid: "Part paid",
  paid: "Paid",
  overdue: "Overdue",
};

/**
 * One-line explanation of each status, used in tooltips and the filter bar.
 * Writing the rule down in the interface means the user never has to guess why
 * an order they part-paid still shows as overdue.
 */
export const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending: "No payments recorded yet, and not past the due date.",
  partially_paid: "Some payment received, still within the due date.",
  paid: "Fully settled. Nothing outstanding.",
  overdue: "Past the due date and not fully paid.",
};

/**
 * Formats a YYYY-MM-DD string for display.
 *
 * Parsed as UTC and formatted in UTC. Passing the bare string to `new Date()`
 * in a browser west of Greenwich yields the previous day, which would show an
 * order as due a day earlier than the database says.
 */
export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Short form for dense table cells: "15 Aug". */
export function formatDateShort(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Relative phrasing for a due date: "in 5 days", "3 days ago", "today".
 *
 * Both sides are reduced to a UTC calendar day before subtracting, so the
 * result matches the status rule exactly. Deriving one from a timestamp and the
 * other from a date would let the badge say "due today" while the status says
 * overdue.
 */
export function describeDueDate(isoDate: string, asOf: Date = new Date()): string {
  const due = Date.parse(`${isoDate}T00:00:00.000Z`);
  const today = Date.parse(`${asOf.toISOString().slice(0, 10)}T00:00:00.000Z`);

  const days = Math.round((due - today) / 86_400_000);

  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days > 1) return `due in ${days} days`;
  return `${Math.abs(days)} days overdue`;
}

/** Pluralises a countable noun without a dedicated library. */
export function pluralise(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
