import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { OrdersTable } from "@/components/orders/orders-table";
import { StatusFilter } from "@/components/orders/status-filter";
import {
  ORDER_STATUSES,
  type OrderStatus,
  isOrderStatus,
} from "@/lib/domain/orders";
import { STATUS_LABELS, pluralise } from "@/lib/format";
import { sumCents } from "@/lib/money";
import { requireUser } from "@/server/auth/current-user";
import { listOrders } from "@/server/repositories/orders";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Orders",
};

/**
 * Dashboard.
 *
 * A Server Component reading the repository directly. No client-side fetch, no
 * loading spinner, no waterfall: the HTML arrives with the numbers in it.
 *
 * `asOf` is captured ONCE and threaded through every derivation on the page, so
 * the status badge and the "5 days overdue" text beside it are computed from
 * the same instant. Letting each call default to its own `new Date()` means a
 * request that straddles midnight can render a badge that contradicts the words
 * next to it.
 *
 * All orders load in one query and the filter applies in memory, because the
 * summary figures and the per-status counts both need the full set anyway.
 * Filtering in SQL would mean either several round trips or losing the counts.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireUser();
  const { status } = await searchParams;

  const asOf = new Date();
  const orders = await listOrders(session.userId, {}, asOf);

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
    <main className="mx-auto w-full max-w-content px-5 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-display text-ink">Orders</h1>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a
              href={
                activeStatus
                  ? `/api/orders/export?status=${activeStatus}`
                  : "/api/orders/export"
              }
              download
            >
              Export
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/orders/new">
              <Plus aria-hidden className="size-3.5" />
              New order
            </Link>
          </Button>
        </div>
      </div>

      {/* ---- Summary ----
          A 1px gap over a `bg-line` parent, so the dividers are the parent
          showing through. Hairlines meet perfectly at the corners, which
          stacked borders never quite do. */}
      <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Metric
          label="Outstanding"
          cents={outstandingCents}
          note={`${orders.length} ${pluralise(orders.length, "order")}`}
        />
        <Metric
          label="Overdue"
          cents={overdueCents}
          note={
            counts.overdue === 0
              ? "Nothing late"
              : `${counts.overdue} past the due date`
          }
          alert={counts.overdue > 0}
        />
        <Metric
          label="Collected"
          cents={collectedCents}
          note="Across all orders"
        />
      </div>

      <div className="mt-7">
        <StatusFilter counts={counts} total={orders.length} />
      </div>

      <div className="mt-3">
        {visible.length > 0 ? (
          <OrdersTable orders={visible} />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            body="Create one and the total, status and amount due are worked out for you."
            action={
              <Button asChild size="sm">
                <Link href="/orders/new">Create an order</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`Nothing is ${STATUS_LABELS[activeStatus!].toLowerCase()}`}
            body="No orders match this filter."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/orders">Show all</Link>
              </Button>
            }
          />
        )}
      </div>
    </main>
  );
}

function Metric({
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
    <div className="bg-surface-raised px-4 py-3.5">
      <p className="text-label text-ink-faint">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-metric-lg",
          alert && cents > 0 ? "text-status-overdue-ink" : "text-ink",
        )}
      >
        <Money cents={cents} />
      </p>
      <p className="mt-0.5 text-caption text-ink-faint">{note}</p>
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
    <div className="rounded-lg border border-dashed border-line bg-surface-raised px-6 py-14 text-center">
      <h2 className="font-heading text-display-sm text-ink">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-prose text-body-sm text-ink-muted">
        {body}
      </p>
      <div className="mt-5 flex justify-center">{action}</div>
    </div>
  );
}
