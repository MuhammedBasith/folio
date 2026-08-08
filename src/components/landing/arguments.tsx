import { Reveal } from "@/components/reveal";
import { StatusDot } from "@/components/status-badge";

/**
 * The two things worth arguing about.
 *
 * Both sections exist because they are the only genuinely non-obvious decisions
 * in the product, and a landing page that explains its hard parts is more
 * convincing than one that lists its features. Anyone can claim "powerful
 * dashboards"; almost nobody writes down what their software does when two
 * descriptions of the same order are both true.
 */

const RULES = [
  {
    condition: "Payments cover the total",
    note: "Even if it settled long after the due date",
    status: "paid" as const,
  },
  {
    condition: "Past the due date",
    note: "Lateness outranks how much has been paid",
    status: "overdue" as const,
  },
  {
    condition: "Something has been paid",
    note: "Still within the due date",
    status: "partially_paid" as const,
  },
  {
    condition: "Nothing yet",
    note: "The starting state of every order",
    status: "pending" as const,
  },
];

export function StatusRule() {
  return (
    <section id="the-rule" className="scroll-mt-24 border-t border-line">
      <div className="mx-auto grid w-full max-w-content gap-10 px-5 py-20 md:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] md:items-start md:gap-16 md:px-8 md:py-24">
        <Reveal>
          <p className="font-mono text-caption text-ink-faint">
            The one hard part
          </p>
          <h2 className="mt-3 font-heading text-display-lg text-balance text-ink">
            An order can be late and part paid at the same time.
          </h2>
          <p className="mt-4 text-body-sm text-ink-muted">
            Both descriptions are true, so precedence has to decide which one
            you see. Folio checks in this order, and the consequence is the
            point: an order settled after its due date reads as paid, because
            nothing is owed and so nothing can be late.
          </p>
          <p className="mt-3.5 text-body-sm text-ink-muted">
            Status is never stored. It is derived from the payments and the date
            every time it is read, so it cannot be stale and there is no state
            to migrate when the rule changes.
          </p>
        </Reveal>

        <Reveal delayIndex={1}>
          <ol className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface-raised">
            {RULES.map((rule, index) => (
              <li key={rule.status} className="flex items-baseline gap-4 px-4 py-4">
                <span className="font-mono text-caption text-ink-disabled">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm text-ink">{rule.condition}</p>
                  <p className="mt-0.5 text-caption text-ink-faint">
                    {rule.note}
                  </p>
                </div>
                <span className="ml-auto shrink-0">
                  <StatusDot status={rule.status} />
                </span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The float argument, shown as a receipt rather than described.
 *
 * The numbers are the actual output of the two approaches. `99.99000000000001`
 * is not an exaggeration for effect; it is what a browser prints for
 * `33.33 * 3`, and seeing it is more persuasive than being told about it.
 */
export function Exactness() {
  return (
    <section id="exact" className="scroll-mt-24 border-t border-line">
      <div className="mx-auto grid w-full max-w-content gap-10 px-5 py-20 md:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] md:items-start md:gap-16 md:px-8 md:py-24">
        <Reveal>
          <p className="font-mono text-caption text-ink-faint">To the cent</p>
          <h2 className="mt-3 font-heading text-display-lg text-balance text-ink">
            Money is counted in whole cents, never in decimals.
          </h2>
          <p className="mt-4 text-body-sm text-ink-muted">
            Three payments of $33.33 against a $100 order leave exactly one cent
            outstanding. Held as decimals that balance computes to
            0.010000000000005116, which prints as $0.01 and fails every
            comparison you would write against it.
          </p>
          <p className="mt-3.5 text-body-sm text-ink-muted">
            Folio stores integers end to end. Nothing is rounded on the way in
            or on the way out, so the balance is exact by construction rather
            than by hoping the rounding cancels.
          </p>
        </Reveal>

        <Reveal delayIndex={1}>
          <div className="overflow-hidden rounded-xl border border-line bg-surface-raised font-mono text-body-sm">
            {[
              ["Order total", "$100.00"],
              ["Payment", "$33.33"],
              ["Payment", "$33.33"],
              ["Payment", "$33.33"],
            ].map(([label, value], index) => (
              <div
                key={index}
                className="flex justify-between border-b border-line-subtle px-4 py-2.5 text-ink-muted"
              >
                <span>{label}</span>
                <span className="tabular-nums">{value}</span>
              </div>
            ))}

            <div className="flex justify-between bg-surface-sunken/70 px-4 py-2.5 text-ink">
              <span>Still due, in cents</span>
              <span className="tabular-nums">$0.01</span>
            </div>

            {/*
              The exact value V8 produces for `100 - (33.33 + 33.33 + 33.33)`.
              Not an illustration and not rounded for effect: run it and this is
              what comes back. Wrapped so it does not force the card wider than
              its column on a phone.
            */}
            <div className="flex flex-col gap-1 border-t border-line-subtle px-4 py-2.5 text-caption text-status-overdue-ink sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <span className="shrink-0">Still due, in decimals</span>
              <span className="break-all tabular-nums">
                0.010000000000005116
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
