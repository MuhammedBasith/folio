import type { OrderStatus } from "@/lib/domain/orders";
import { STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status, in two weights.
 *
 * `StatusDot` is the default and is what a list uses: a small coloured dot
 * beside plain text. `StatusBadge` is the tinted pill, reserved for the single
 * place a status is the subject of the screen rather than one attribute among
 * six.
 *
 * The distinction matters. A pill on every row of a table stacks forty rounded
 * tinted rectangles down the page, and the eye reads that as decoration rather
 * than as data. The dot carries exactly the same information at a fraction of
 * the visual weight, and the column stays scannable.
 *
 * In both, colour is never the only signal: the label is always present, so
 * the four states remain distinguishable without colour vision.
 */

const DOT_COLOURS: Record<OrderStatus, string> = {
  pending: "bg-status-pending-ink",
  partially_paid: "bg-status-partial-ink",
  paid: "bg-status-paid-ink",
  overdue: "bg-status-overdue-ink",
};

const PILL_STYLES: Record<OrderStatus, string> = {
  pending:
    "bg-status-pending-tint border-status-pending-line text-status-pending-ink",
  partially_paid:
    "bg-status-partial-tint border-status-partial-line text-status-partial-ink",
  paid: "bg-status-paid-tint border-status-paid-line text-status-paid-ink",
  overdue:
    "bg-status-overdue-tint border-status-overdue-line text-status-overdue-ink",
};

/** List weight: a dot and a word. */
export function StatusDot({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-body-sm",
        status === "overdue" ? "text-status-overdue-ink" : "text-ink-muted",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", DOT_COLOURS[status])}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Feature weight: a tinted pill, for a detail header. */
export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-caption font-medium whitespace-nowrap",
        PILL_STYLES[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABELS[status]}
    </span>
  );
}
