import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { OrdersTable } from "@/components/orders/orders-table";
import { StatusFilter } from "@/components/orders/status-filter";
import { ORDER_STATUSES, type OrderStatus, isOrderStatus } from "@/lib/domain/orders";
import { STATUS_LABELS, pluralise } from "@/lib/format";
import { sumCents } from "@/lib/money";
import { requireUser } from "@/server/auth/current-user";
import { listOrders } from "@/server/repositories/orders";

export const metadata: Metadata = {
  title: "Orders · Ledger",
};

/**
 * Dashboard.
 *
 * A Server Component reading the repository directly. No client-side fetch, no
 * loading spinner, no waterfall: the HTML arrives with the numbers already in
 * it.
 *
 * All orders are loaded once and the filter is applied in memory, because the
 * summary strip and the per-status counts on the filter both need the full set
 * anyway. Filtering in the query would mean either three round trips or losing
 * the counts.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireUser();
  const { status } = await searchParams;

  const orders = await listOrders(session.userId);

  const counts = ORDER_STATUSES.reduce(
    (acc, value) => {
      acc[value] = orders.filter((order) => order.status === value).length;
      return acc;
    },
    {} as Record<OrderStatus, number>,
  );

  const activeStatus = isOrderStatus(status) ? status : undefined;
  const visible = activeStatus
    ? orders.filter((order) => order.status === activeStatus)
    : orders;

  const outstandingCents = sumCents(orders.map((order) => order.dueCents));
  const overdueCents = sumCents(
    orders
      .filter((order) => order.status === "overdue")
      .map((order) => order.dueCents),
  );
  const collectedCents = sumCents(orders.map((order) => order.paidCents));

  return (
    <main className="mx-auto w-full max-w-content px-5 py-10 md:px-8 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label uppercase text-ink-faint">Your ledger</p>
          <h1 className="mt-2 font-heading text-display text-ink">Orders</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="secondary">
            {/* Carries the active filter through, so the file matches the
                rows on screen rather than silently exporting everything. */}
            <a
              href={
                activeStatus
                  ? `/api/orders/export?status=${activeStatus}`
                  : "/api/orders/export"
              }
              download
            >
              Export CSV
            </a>
          </Button>
          <Button asChild>
            <Link href="/orders/new">New order</Link>
          </Button>
        </div>
      </div>

      {/* ---- Summary ---- */}
      <div className="mt-9 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Metric
          label="Outstanding"
          cents={outstandingCents}
          note={`Across ${orders.length} ${pluralise(orders.length, "order")}`}
        />
        <Metric
          label="Overdue"
          cents={overdueCents}
          note={
            counts.overdue === 0
              ? "Nothing is late"
              : `${counts.overdue} ${pluralise(counts.overdue, "order")} past the due date`
          }
          tone={counts.overdue > 0 ? "alert" : "default"}
        />
        <Metric
          label="Collected"
          cents={collectedCents}
          note="Recorded against all orders"
        />
      </div>

      {/* ---- Filter ---- */}
      <div className="mt-9">
        <StatusFilter counts={counts} total={orders.length} />
      </div>

      {/* ---- List ---- */}
      <div className="mt-5">
        {visible.length > 0 ? (
          <OrdersTable orders={visible} />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            body="Create your first order and the totals, status and amount due are worked out for you."
            action={
              <Button asChild>
                <Link href="/orders/new">Create an order</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`Nothing is ${STATUS_LABELS[activeStatus!].toLowerCase()}`}
            body="No orders match this filter right now."
            action={
              <Button asChild variant="secondary">
                <Link href="/orders">Show all orders</Link>
              </Button>
            }
          />
        )}
      </div>
    </main>
  );
}

/**
 * One figure in the summary strip.
 *
 * The grid uses a 1px gap over a `bg-line` parent so the dividers between cells
 * are the parent showing through. That gives hairlines that meet perfectly at
 * the corners, which stacked borders never quite do.
 */
function Metric({
  label,
  cents,
  note,
  tone = "default",
}: {
  label: string;
  cents: number;
  note: string;
  tone?: "default" | "alert";
}) {
  return (
    <div className="bg-surface-raised px-5 py-5">
      <p className="text-label uppercase text-ink-faint">{label}</p>
      <p
        className={
          tone === "alert" && cents > 0
            ? "mt-2 text-metric-lg text-status-overdue-ink"
            : "mt-2 text-metric-lg text-ink"
        }
      >
        <Money cents={cents} />
      </p>
      <p className="mt-1 text-caption text-ink-faint">{note}</p>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface-raised px-6 py-16 text-center">
      <h2 className="font-heading text-display-sm text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-prose text-body-sm text-ink-muted">
        {body}
      </p>
      <div className="mt-6 flex justify-center">{action}</div>
    </div>
  );
}
