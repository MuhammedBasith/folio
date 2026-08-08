import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderSearch } from "@/components/orders/order-search";
import { StatusFilter } from "@/components/orders/status-filter";
import {
  ORDER_STATUSES,
  type OrderStatus,
  compareByUrgency,
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
 * All orders load in one query and both filters apply in memory, because the
 * summary figures and the per-status counts need the full set anyway. Doing it
 * in SQL would mean either several round trips or losing the counts.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await requireUser();
  const { status, q } = await searchParams;

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
  const query = (q ?? "").trim().toLowerCase();

  const visible = orders
    .filter((order) => {
      if (activeStatus && order.status !== activeStatus) return false;
      if (!query) return true;

      // Customer and reference only. Searching the notes as well would produce
      // hits the user cannot see anywhere in the row that matched, which reads
      // as a bug rather than as a feature.
      return (
        order.customer.toLowerCase().includes(query) ||
        order.reference.toLowerCase().includes(query)
      );
    })
    // Sorted for reading, not for storage. The repository returns due date
    // ascending, which is stable and correct for the API and the CSV export but
    // opens this page on an order that settled two months ago.
    .sort(compareByUrgency);

  const outstandingCents = sumCents(orders.map((order) => order.dueCents));
  const overdueCents = sumCents(
    orders
      .filter((order) => order.status === "overdue")
      .map((order) => order.dueCents),
  );
  const collectedCents = sumCents(orders.map((order) => order.paidCents));
  const invoicedCents = collectedCents + outstandingCents;

  return (
    <main className="mx-auto w-full max-w-content px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-display text-ink">Orders</h1>
          <p className="mt-0.5 text-caption text-ink-faint">
            {orders.length} {pluralise(orders.length, "order")}
            {counts.overdue > 0 ? ` · ${counts.overdue} overdue` : ""}
          </p>
        </div>

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
      <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        <Metric
          label="Outstanding"
          cents={outstandingCents}
          note={`Across ${orders.length} ${pluralise(orders.length, "order")}`}
          share={invoicedCents > 0 ? outstandingCents / invoicedCents : 0}
        />
        <Metric
          label="Overdue"
          cents={overdueCents}
          note={
            counts.overdue === 0
              ? "Nothing is late"
              : `${counts.overdue} past the due date`
          }
          share={outstandingCents > 0 ? overdueCents / outstandingCents : 0}
          tone="alert"
        />
        <Metric
          label="Collected"
          cents={collectedCents}
          note={
            invoicedCents > 0
              ? `${Math.round((collectedCents / invoicedCents) * 100)}% of everything invoiced`
              : "Nothing invoiced yet"
          }
          share={invoicedCents > 0 ? collectedCents / invoicedCents : 0}
          tone="positive"
        />
      </div>

      {/* ---- Filter and search, on one line ---- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <StatusFilter counts={counts} total={orders.length} />
        <OrderSearch />
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
            title={query ? `Nothing matches “${q}”` : "Nothing here"}
            body={
              query
                ? "Search looks at the customer name and the reference."
                : `No orders are ${STATUS_LABELS[activeStatus!].toLowerCase()}.`
            }
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/orders">Clear filters</Link>
              </Button>
            }
          />
        )}
      </div>
    </main>
  );
}

/**
 * A summary figure with a share bar under it.
 *
 * THE BAR IS THE ADDITION. A number alone answers "how much"; the bar answers
 * "how much of the whole", which is the question somebody actually has when
 * they read an overdue total. It is two divs rather than a chart library,
 * because it encodes exactly one number.
 *
 * Colour is information here and nowhere else on this screen. Overdue turns red
 * only when there IS something overdue, so a healthy ledger shows no red at all
 * and red therefore means something on the day it appears.
 */
function Metric({
  label,
  cents,
  note,
  share,
  tone = "neutral",
}: {
  label: string;
  cents: number;
  note: string;
  share: number;
  tone?: "neutral" | "alert" | "positive";
}) {
  const live = cents > 0;
  const resolved = live ? tone : "neutral";

  return (
    <div className="bg-surface-raised px-4 py-3.5">
      <p className="text-caption text-ink-faint">{label}</p>

      <p
        className={cn(
          "mt-1.5 text-metric-lg",
          resolved === "alert" ? "text-status-overdue-ink" : "text-ink",
        )}
      >
        <Money cents={cents} />
      </p>

      <div className="mt-2.5 h-0.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out-quint",
            resolved === "alert"
              ? "bg-status-overdue-ink"
              : resolved === "positive"
                ? "bg-status-paid-ink"
                : "bg-line-strong/40",
          )}
          style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
        />
      </div>

      <p className="mt-2 text-caption text-ink-faint">{note}</p>
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
    <div className="rounded-xl border border-dashed border-line bg-surface-raised px-6 py-14 text-center">
      <h2 className="font-heading text-display-sm text-ink">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-prose text-body-sm text-ink-muted">
        {body}
      </p>
      <div className="mt-5 flex justify-center">{action}</div>
    </div>
  );
}
