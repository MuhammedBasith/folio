import { Money } from "@/components/money";
import { buildAgeingReport } from "@/lib/domain/orders";
import type { OrderStatus } from "@/lib/domain/orders";
import { pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Debtor ageing, as a single stacked bar.
 *
 * WHY A BAR AND NOT A TABLE. The question this answers is comparative, not
 * arithmetic: is my overdue money mostly a few days late, or is it sitting at
 * ninety days? Five figures in a row make the reader do that comparison
 * themselves; one bar segmented by width answers it before they have read a
 * number. The figures are underneath for when they want the exact amount.
 *
 * IT HIDES ITSELF WHEN NOTHING IS LATE. A ledger with everything inside its
 * terms has no ageing profile worth a row of zeroes, and a panel that is always
 * present but usually empty trains people to skip it. When it appears, it means
 * something.
 *
 * Colour runs cool to hot with age, which is the one place in this product a
 * gradient of severity is genuinely the information rather than decoration.
 */
const SEGMENT_STYLES: Record<string, { bar: string; dot: string }> = {
  current: { bar: "bg-line-strong/30", dot: "bg-line-strong/30" },
  d1_30: { bar: "bg-status-partial-ink/45", dot: "bg-status-partial-ink/45" },
  d31_60: { bar: "bg-status-partial-ink/75", dot: "bg-status-partial-ink/75" },
  d61_90: { bar: "bg-status-overdue-ink/70", dot: "bg-status-overdue-ink/70" },
  d90_plus: { bar: "bg-status-overdue-ink", dot: "bg-status-overdue-ink" },
};

export function AgeingReport({
  orders,
  asOf,
}: {
  orders: readonly {
    dueCents: number;
    dueDate: string;
    status: OrderStatus;
  }[];
  asOf: Date;
}) {
  const report = buildAgeingReport(orders, asOf);

  if (report.overdueCents === 0) return null;

  const filled = report.buckets.filter((bucket) => bucket.cents > 0);

  return (
    <section
      aria-label="Ageing of outstanding balances"
      className="mt-3 rounded-xl border border-line bg-surface-raised px-4 py-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-caption font-medium text-ink-muted">
          How old the debt is
        </h2>
        <p className="text-caption text-ink-faint">
          <Money cents={report.overdueCents} tone="strong" /> of{" "}
          <Money cents={report.totalCents} /> is past its due date
        </p>
      </div>

      {/* The bar. `flex` with per-segment `flex-grow` rather than percentage
          widths, so the segments always fill the track exactly and rounding
          cannot leave a one pixel gap at the end. */}
      <div className="mt-3 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
        {filled.map((bucket) => (
          <div
            key={bucket.key}
            style={{ flexGrow: bucket.cents }}
            className={cn("h-full rounded-full", SEGMENT_STYLES[bucket.key].bar)}
          />
        ))}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {filled.map((bucket) => (
          <div key={bucket.key} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 translate-y-[-1px] rounded-full",
                SEGMENT_STYLES[bucket.key].dot,
              )}
            />
            <dt className="text-caption text-ink-faint">{bucket.label}</dt>
            <dd className="text-caption text-ink">
              <Money cents={bucket.cents} tone="strong" />
              <span className="ml-1.5 text-ink-disabled">
                {bucket.count} {pluralise(bucket.count, "order")}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
