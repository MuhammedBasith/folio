import type { OrderStatus } from "@/lib/domain/orders";
import { STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status badge.
 *
 * The only place colour appears in this interface. Because nothing else on
 * screen is chromatic, a red pill is legible at a glance across a full table
 * without needing to be loud, which is why the tints are low chroma.
 *
 * The dot is not decoration. It gives the badge a second, non-colour channel:
 * position and label still distinguish the four states for a user who cannot
 * separate red from green, and the label alone carries the meaning if colour
 * fails entirely.
 */

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:
    "bg-status-pending-tint border-status-pending-line text-status-pending-ink",
  partially_paid:
    "bg-status-partial-tint border-status-partial-line text-status-partial-ink",
  paid: "bg-status-paid-tint border-status-paid-line text-status-paid-ink",
  overdue:
    "bg-status-overdue-tint border-status-overdue-line text-status-overdue-ink",
};

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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        "text-caption font-medium whitespace-nowrap",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABELS[status]}
    </span>
  );
}
