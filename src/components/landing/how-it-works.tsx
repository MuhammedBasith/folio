import { Reveal } from "@/components/reveal";
import { Money } from "@/components/money";
import { StatusDot } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * How it works.
 *
 * THREE TINTED PANELS, AND THE TINT IS THE ONLY DECORATION. No icons in rounded
 * squares, no illustration, no numbered circle with a gradient in it. Each panel
 * holds a sentence and a working fragment of the interface it describes, which
 * is a stronger argument than any drawing of a clipboard.
 *
 * The washes come from the same three hues the gradient plates are built on, so
 * the section reads as part of the same world rather than as a palette someone
 * reached for. They are the lightest step of each ramp: enough to separate three
 * ideas, nowhere near enough to compete with the type.
 */
const STEPS = [
  {
    title: "Write the order",
    body: "Customer, due date, and the lines you supplied. The total comes from the lines, so you never type it and it can never be wrong.",
    wash: "bg-wash-ember border-wash-ember-line",
  },
  {
    title: "Record what arrives",
    body: "Money lands in your bank, you note it here. Part payments are normal, and each one is a permanent record rather than an edit.",
    wash: "bg-wash-sage border-wash-sage-line",
  },
  {
    title: "See what is short",
    body: "The balance and the status update themselves. Nothing to reconcile, nothing to recalculate, nothing to keep in your head.",
    wash: "bg-wash-slate border-wash-slate-line",
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto w-full max-w-content scroll-mt-24 px-5 py-20 md:px-8 md:py-24"
    >
      <Reveal>
        <p className="font-mono text-caption text-ink-faint">How it works</p>
        <h2 className="mt-3 max-w-[20ch] font-heading text-display-lg text-balance text-ink">
          Three steps, and the third one happens on its own.
        </h2>
      </Reveal>

      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Reveal as="li" key={step.title} delayIndex={index}>
            <div
              className={cn(
                "flex h-full flex-col rounded-xl border p-5",
                step.wash,
              )}
            >
              <span className="font-mono text-caption text-ink-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-heading text-display-sm text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-body-sm text-ink-muted">{step.body}</p>

              <div className="mt-6 flex-1">
                <StepVisual index={index} />
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/**
 * The working fragment inside each panel.
 *
 * Built from the same components the product uses, so they cannot drift out of
 * date: change the money formatter or a status colour and these change with it.
 * A screenshot would have been easier and would be wrong within a week.
 */
function StepVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-raised p-3">
        <div className="flex items-baseline justify-between gap-3 text-caption text-ink-faint">
          <span>Rugged tablet</span>
          <span data-numeric>3 × 649.00</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line-subtle pt-2">
          <span className="text-caption text-ink-muted">Order total</span>
          <Money cents={194_700} tone="strong" />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
        {[
          { amount: 94_700, note: "First instalment", date: "4 Jul" },
          { amount: 100_000, note: "Balance cleared", date: "28 Jul" },
        ].map((payment) => (
          <div
            key={payment.note}
            className="flex items-baseline justify-between gap-3 border-b border-line-subtle px-3 py-2 last:border-b-0"
          >
            <span className="min-w-0">
              <Money cents={payment.amount} tone="strong" />
              <span className="ml-2 text-caption text-ink-faint">
                {payment.note}
              </span>
            </span>
            <span className="shrink-0 text-caption text-ink-faint">
              {payment.date}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
      {[
        { customer: "Northwind Traders", status: "overdue", due: 455_600 },
        { customer: "Brightside Media", status: "partially_paid", due: 72_500 },
        { customer: "Harbour Logistics", status: "paid", due: 0 },
      ].map((row) => (
        <div
          key={row.customer}
          className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 py-2 last:border-b-0"
        >
          <StatusDot
            status={row.status as "overdue" | "partially_paid" | "paid"}
            className="text-caption"
          />
          <Money
            cents={row.due}
            tone={row.due === 0 ? "muted" : "strong"}
            className="text-caption"
          />
        </div>
      ))}
    </div>
  );
}
