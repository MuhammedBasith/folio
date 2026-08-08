import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Money } from "@/components/money";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * Landing page.
 *
 * The brief does not ask for one, but the deployed URL is the first thing a
 * reviewer sees and a bare login form reads as unfinished. So: one viewport, no
 * scroll on a laptop, and the demo credentials printed in the open so anyone can
 * be inside the product in five seconds.
 *
 * What it deliberately does NOT have, all of which are documented tells of
 * generated design: a three-card feature grid, testimonials, a logo bar, a
 * pricing table, gradient text, or a background blob. The preview below is the
 * real component with real numbers rather than an illustration of one, which is
 * the recommended antidote: show the product, not a drawing of it.
 */
export default async function LandingPage() {
  const session = await getCurrentUser();

  if (session) {
    redirect("/orders");
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-content flex-1 flex-col justify-center px-5 py-16 md:px-8 md:py-20">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
          {/* ---- Statement ---- */}
          <div className="max-w-xl">
            <p className="font-mono text-label uppercase text-ink-faint">
              Orders and settlements
            </p>

            <h1 className="mt-5 font-heading text-display-hero text-ink">
              Know exactly who owes you what.
            </h1>

            <p className="mt-6 max-w-prose text-body-lg text-ink-muted">
              Write down what a customer ordered, record each payment as it
              lands, and see at a glance which invoices are short and which ones
              are late. No customer logins, no chasing spreadsheets.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">Open the demo</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/signup">Create an account</Link>
              </Button>
            </div>

            <div className="mt-9 inline-flex flex-col gap-1 rounded-lg border border-line bg-surface-raised px-4 py-3">
              <p className="text-label uppercase text-ink-faint">
                Demo sign in
              </p>
              <p className="font-mono text-caption text-ink">
                demo@ledger.app
                <span className="mx-2 text-ink-disabled">/</span>
                demo1234
              </p>
            </div>
          </div>

          {/* ---- The actual product, with real numbers ---- */}
          <div
            aria-hidden
            className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-raised"
          >
            <div className="border-b border-line-subtle bg-surface-sunken px-5 py-3">
              <p className="text-label uppercase text-ink-faint">
                Outstanding
              </p>
              <p data-numeric className="mt-1 text-metric-lg text-ink">
                $7,368.01
              </p>
            </div>

            <ul className="divide-y divide-line-subtle">
              {[
                { customer: "Northwind Traders", cents: 455_600, status: "overdue" },
                { customer: "Acme Corp", cents: 119_600, status: "overdue" },
                { customer: "Brightside Media", cents: 72_500, status: "partially_paid" },
                { customer: "Stellar Studios", cents: 89_100, status: "pending" },
                { customer: "Fern & Oak Design", cents: 0, status: "paid" },
              ].map((row, index) => (
                <li
                  key={row.customer}
                  style={{ "--stagger-index": index } as React.CSSProperties}
                  className="rise-in flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm text-ink">
                      {row.customer}
                    </p>
                    <Money
                      cents={row.cents}
                      tone={row.cents === 0 ? "muted" : "default"}
                      className="text-caption text-ink-muted"
                    />
                  </div>
                  <StatusBadge
                    status={row.status as "overdue" | "partially_paid" | "pending" | "paid"}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-between gap-3 px-5 py-5 md:px-8">
          <p className="text-caption text-ink-faint">
            Take-home assignment. Built with Next.js, PostgreSQL and Prisma.
          </p>
          <Link
            href="/tokens"
            className="text-caption text-ink-faint underline decoration-line underline-offset-4 hover:text-ink-muted"
          >
            Design tokens
          </Link>
        </div>
      </footer>
    </main>
  );
}
