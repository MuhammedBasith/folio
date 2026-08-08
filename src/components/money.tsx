import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Money display.
 *
 * `data-numeric` switches on tabular figures, so every digit occupies the same
 * width and decimal points stack down a column. Without it, a column of
 * proportional numerals wanders left and right and stops being scannable, which
 * is the entire job of a money column.
 *
 * `tone="muted"` is for a zero balance: a settled order should read as quiet
 * rather than shouting $0.00 in full contrast alongside live figures.
 */
export function Money({
  cents,
  className,
  tone = "default",
}: {
  cents: number;
  className?: string;
  tone?: "default" | "muted" | "strong";
}) {
  return (
    <span
      data-numeric
      className={cn(
        tone === "muted" && "text-ink-faint",
        tone === "strong" && "text-ink font-medium",
        className,
      )}
    >
      {formatMoney(cents)}
    </span>
  );
}
