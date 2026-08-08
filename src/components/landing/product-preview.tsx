import { Money } from "@/components/money";
import { Reveal } from "@/components/reveal";
import { StatusDot } from "@/components/status-badge";

const ROWS = [
  {
    reference: "ORD-0001",
    customer: "Northwind Traders",
    status: "overdue" as const,
    total: 455_600,
    paid: 0,
    due: 455_600,
    date: "18 Jul",
  },
  {
    reference: "ORD-0002",
    customer: "Acme Corp",
    status: "overdue" as const,
    total: 249_600,
    paid: 130_000,
    due: 119_600,
    date: "3 Aug",
  },
  {
    reference: "ORD-0004",
    customer: "Brightside Media",
    status: "partially_paid" as const,
    total: 145_000,
    paid: 72_500,
    due: 72_500,
    date: "24 Aug",
  },
  {
    reference: "ORD-0003",
    customer: "Stellar Studios",
    status: "pending" as const,
    total: 89_100,
    paid: 0,
    due: 89_100,
    date: "17 Aug",
  },
  {
    reference: "ORD-0005",
    customer: "Harbour Logistics",
    status: "paid" as const,
    total: 194_700,
    paid: 194_700,
    due: 0,
    date: "29 Jun",
  },
];

/**
 * The actual list, on the actual page.
 *
 * Every landing page for a tool eventually has to answer "what does it look
 * like", and the honest answer is a screenshot of the thing. This is better
 * than a screenshot: it is the real markup, using the real tokens, so it stays
 * correct as the product changes and it renders in whichever theme the reader
 * is using.
 *
 * The two figures above it are the ones that matter, and they are the argument.
 * Somebody scanning this page is deciding whether the product answers "how much
 * am I owed", so the answer sits at the top in the largest numerals on the
 * screen.
 */
export function ProductPreview() {
  return (
    <section className="mx-auto w-full max-w-content px-5 pb-4 md:px-8">
      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-overlay">
          {/* ---- Summary strip ---- */}
          <div className="grid gap-px bg-line sm:grid-cols-3">
            <Figure
              label="Outstanding"
              cents={736_800}
              note="5 orders"
            />
            <Figure
              label="Overdue"
              cents={575_200}
              note="2 past the due date"
              alert
            />
            <Figure
              label="Collected"
              cents={397_200}
              note="Across all orders"
            />
          </div>

          {/* ---- The rows ---- */}
          <div className="border-t border-line">
            <div className="hidden grid-cols-[6rem_minmax(0,1fr)_7.5rem_7rem_7rem_5rem] gap-3 border-b border-line-subtle bg-surface-sunken/50 px-4 py-2.5 md:grid">
              {["Ref", "Customer", "Status", "Paid", "Due", "By"].map(
                (heading, index) => (
                  <span
                    key={heading}
                    className={`text-caption text-ink-faint ${
                      index === 3 || index === 4 ? "text-right" : ""
                    }`}
                  >
                    {heading}
                  </span>
                ),
              )}
            </div>

            {ROWS.map((row) => (
              <div
                key={row.reference}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line-subtle px-4 py-3 text-body-sm last:border-b-0 md:grid-cols-[6rem_minmax(0,1fr)_7.5rem_7rem_7rem_5rem] md:py-2.5"
              >
                <span className="hidden font-mono text-caption text-ink-faint md:block">
                  {row.reference}
                </span>
                <span className="truncate font-medium text-ink">
                  {row.customer}
                </span>
                <span className="hidden md:block">
                  <StatusDot status={row.status} />
                </span>
                <span className="hidden text-right md:block">
                  <Money
                    cents={row.paid}
                    tone={row.paid === 0 ? "muted" : "default"}
                    className={row.paid === 0 ? "" : "text-ink-muted"}
                  />
                </span>
                <span className="text-right">
                  <Money
                    cents={row.due}
                    tone={row.due === 0 ? "muted" : "strong"}
                  />
                </span>
                <span className="hidden text-ink-faint tabular-nums md:block">
                  {row.date}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal delayIndex={1}>
        <p className="mt-4 text-center text-caption text-ink-faint">
          Totals come from the lines, balances come from the payments, and the
          status comes from both. Nothing on this screen was typed in.
        </p>
      </Reveal>
    </section>
  );
}

function Figure({
  label,
  cents,
  note,
  alert,
}: {
  label: string;
  cents: number;
  note: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-surface-raised px-4 py-4">
      <p className="text-caption text-ink-faint">{label}</p>
      <p
        className={`mt-1.5 text-metric-lg ${
          alert ? "text-status-overdue-ink" : "text-ink"
        }`}
      >
        <Money cents={cents} />
      </p>
      <p className="mt-0.5 text-caption text-ink-faint">{note}</p>
    </div>
  );
}
