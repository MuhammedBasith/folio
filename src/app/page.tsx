import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-badge";
import { Money } from "@/components/money";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * Landing page.
 *
 * Editorial, not promotional. Type does the work; there are no feature cards,
 * no icons in rounded squares, no gradient, no testimonials and no logo bar.
 *
 * The two substantial sections are deliberate: showing the real order list
 * beats describing it, and writing the status rule out in full is the most
 * honest thing this page can say about the product, because that rule is the
 * only genuinely non-obvious decision in it.
 */
export default async function LandingPage() {
  if (await getCurrentUser()) {
    redirect("/orders");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-13 w-full max-w-content items-center justify-between px-5 md:px-8">
          <span className="font-heading text-[1.0625rem] leading-none tracking-[-0.02em] text-ink">
            Folio
          </span>
          <Link
            href="/login"
            className="text-caption text-ink-muted transition-colors duration-160 hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/*
          ---- Statement ----

          Centred on a narrow measure. Left-aligned in a 1152px container the
          headline occupied the left third and the right two thirds read as an
          unfinished layout. Centring is not the safe default here, it is what
          the editorial references do: the type is the design in this one place,
          so it should sit in the middle of the page rather than beside a void.
        */}
        <section className="px-5 pt-16 pb-14 md:px-8 md:pt-24 md:pb-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-label uppercase text-ink-faint">
              Orders and settlements
            </p>

            <h1 className="mt-5 font-heading text-display-hero text-balance text-ink">
              Know exactly who owes you what.
            </h1>

            <p className="mx-auto mt-5 max-w-prose text-body-lg text-ink-muted">
              Write down what a customer ordered. Record each payment as it
              lands. Folio works out the balance, decides whether the order is
              short or late, and keeps the arithmetic exact to the cent.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
              <Button asChild>
                <Link href="/login">Open the demo</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/signup">Create an account</Link>
              </Button>
            </div>

            <p className="mt-5 font-mono text-caption text-ink-faint">
              demo@folio.app
              <span className="mx-1.5 text-ink-disabled">/</span>
              demo1234
            </p>
          </div>
        </section>

        {/* ---- The product itself ---- */}
        <section className="border-y border-line bg-surface-sunken/40">
          <div className="mx-auto w-full max-w-4xl px-5 py-12 md:px-8 md:py-14">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-mono text-label uppercase text-ink-faint">
                The list
              </p>
              <p className="text-caption text-ink-faint">
                Balance and status are derived, never typed in
              </p>
            </div>

            <div
              aria-hidden
              className="mt-4 overflow-hidden rounded-lg border border-line bg-surface-raised"
            >
              <div className="hidden grid-cols-[5.5rem_minmax(0,1fr)_7rem_7rem_9rem] gap-3 border-b border-line-subtle bg-surface-sunken/60 px-3 py-2 sm:grid">
                {["Ref", "Customer", "Status", "Due", "Due date"].map(
                  (heading, i) => (
                    <span
                      key={heading}
                      className={`text-label uppercase text-ink-faint ${
                        i === 3 ? "text-right" : ""
                      }`}
                    >
                      {heading}
                    </span>
                  ),
                )}
              </div>

              {PREVIEW_ROWS.map((row, index) => (
                <div
                  key={row.reference}
                  style={{ "--stagger-index": index } as React.CSSProperties}
                  className="rise-in grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line-subtle px-3 py-2.5 text-body-sm last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)_7rem_7rem_9rem]"
                >
                  <span className="hidden font-mono text-caption text-ink-faint sm:block">
                    {row.reference}
                  </span>
                  <span className="truncate font-medium text-ink">
                    {row.customer}
                  </span>
                  <span className="hidden sm:block">
                    <StatusDot status={row.status} />
                  </span>
                  <span className="text-right">
                    <Money
                      cents={row.dueCents}
                      tone={row.dueCents === 0 ? "muted" : "strong"}
                    />
                  </span>
                  <span className="hidden text-ink-muted sm:block">
                    {row.due}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section className="mx-auto w-full max-w-content px-5 py-14 md:px-8 md:py-16">
          <p className="font-mono text-label uppercase text-ink-faint">
            How it works
          </p>

          <ol className="mt-6 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t border-line pt-4">
                <span className="font-mono text-caption text-ink-disabled">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-3 font-heading text-display-sm text-ink">
                  {step.title}
                </h2>
                <p className="mt-2 text-body-sm text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- The rule ---- */}
        <section className="border-t border-line">
          <div className="mx-auto grid w-full max-w-content gap-8 px-5 py-14 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-start md:gap-14 md:px-8 md:py-16">
            <div>
              <p className="font-mono text-label uppercase text-ink-faint">
                The one hard part
              </p>
              <h2 className="mt-4 font-heading text-display-lg text-balance text-ink">
                An order can be late and part paid at the same time.
              </h2>
              <p className="mt-3.5 text-body-sm text-ink-muted">
                Both descriptions are true, so precedence decides what you see.
                Folio checks in this order, and the consequences are the point:
                an order settled after its due date reads as paid, because
                nothing is owed and so nothing can be late.
              </p>
            </div>

            <ol className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line bg-surface-raised">
              {RULES.map((rule, index) => (
                <li
                  key={rule.status}
                  className="flex items-baseline gap-4 px-4 py-3.5"
                >
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
          </div>
        </section>

        {/* ---- Exactness ---- */}
        <section className="border-t border-line bg-surface-sunken/40">
          <div className="mx-auto grid w-full max-w-content gap-8 px-5 py-14 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-start md:gap-14 md:px-8 md:py-16">
            <div>
              <p className="font-mono text-label uppercase text-ink-faint">
                To the cent
              </p>
              <h2 className="mt-4 font-heading text-display-lg text-balance text-ink">
                Money is counted in whole cents, never in decimals.
              </h2>
              <p className="mt-3.5 text-body-sm text-ink-muted">
                Three payments of $33.33 against a $100 order leave exactly one
                cent outstanding. Held as decimals they sum to
                99.99000000000001, and the order either never settles or settles
                a cent early. Folio stores integers, so the balance is exact by
                construction rather than by rounding.
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-line bg-surface-raised font-mono text-caption">
              {[
                ["Order total", "$100.00"],
                ["Payment", "$33.33"],
                ["Payment", "$33.33"],
                ["Payment", "$33.33"],
              ].map(([label, value], i) => (
                <div
                  key={i}
                  className="flex justify-between border-b border-line-subtle px-4 py-2 text-ink-muted"
                >
                  <span>{label}</span>
                  <span className="tabular-nums">{value}</span>
                </div>
              ))}
              <div className="flex justify-between bg-surface-sunken/60 px-4 py-2 text-ink">
                <span>Still due</span>
                <span className="tabular-nums">$0.01</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-between gap-3 px-5 py-6 md:px-8">
          <span className="font-heading text-body-lg text-ink">Folio</span>
          <div className="flex items-center gap-5">
            <Link
              href="/tokens"
              className="text-caption text-ink-faint transition-colors duration-160 hover:text-ink"
            >
              Design tokens
            </Link>
            <Link
              href="/login"
              className="text-caption text-ink-faint transition-colors duration-160 hover:text-ink"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

const PREVIEW_ROWS = [
  {
    reference: "ORD-0001",
    customer: "Northwind Traders",
    status: "overdue" as const,
    dueCents: 455_600,
    due: "18 Jul",
  },
  {
    reference: "ORD-0002",
    customer: "Acme Corp",
    status: "overdue" as const,
    dueCents: 119_600,
    due: "3 Aug",
  },
  {
    reference: "ORD-0004",
    customer: "Brightside Media",
    status: "partially_paid" as const,
    dueCents: 72_500,
    due: "24 Aug",
  },
  {
    reference: "ORD-0003",
    customer: "Stellar Studios",
    status: "pending" as const,
    dueCents: 89_100,
    due: "17 Aug",
  },
  {
    reference: "ORD-0006",
    customer: "Fern & Oak Design",
    status: "paid" as const,
    dueCents: 0,
    due: "11 Aug",
  },
];

const STEPS = [
  {
    title: "Write the order",
    body: "Customer, due date, and the lines you supplied. The total comes from the lines; you never type it.",
  },
  {
    title: "Record what arrives",
    body: "Money lands in your bank, you note it here. Partial payments are normal and expected.",
  },
  {
    title: "See what is short",
    body: "The balance and the status update themselves. Nothing to reconcile, nothing to recalculate.",
  },
];

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
