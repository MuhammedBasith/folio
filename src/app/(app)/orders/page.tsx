import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { AgeingReport } from "@/components/orders/ageing-report";
import { OrdersBrowser } from "@/components/orders/orders-browser";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/orders";
import { pluralise } from "@/lib/format";
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
 * IT NO LONGER READS `searchParams`, AND THAT IS THE POINT. Filtering and
 * search used to live in the URL and be applied here, so every tab press
 * re-ran this component: another database query, another render, another RSC
 * payload, to hide rows that were already on screen. It now hands the full list
 * to `OrdersBrowser`, which filters in the browser and keeps the URL in sync
 * through the history API. This page renders once per visit.
 *
 * Everything above the browser is a figure over ALL orders, which is why it
 * belongs here rather than there: the summary and the ageing profile do not
 * change when you look at one status, and it would be actively misleading if
 * they did.
 *
 * `asOf` is captured ONCE and threaded through every derivation on the page, so
 * the status badge and the "5 days overdue" text beside it are computed from
 * the same instant. Letting each call default to its own `new Date()` means a
 * request that straddles midnight can render a badge that contradicts the words
 * next to it.
 */
export default async function OrdersPage() {
  const session = await requireUser();

  const asOf = new Date();
  const orders = await listOrders(session.userId, {}, asOf);

  const counts = ORDER_STATUSES.reduce(
    (acc, value) => {
      acc[value] = orders.filter((order) => order.status === value).length;
      return acc;
    },
    {} as Record<OrderStatus, number>,
  );

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

        <Button asChild size="sm">
          <Link href="/orders/new">
            <Plus aria-hidden className="size-3.5" />
            New order
          </Link>
        </Button>
      </div>

      {/* ---- Summary ----

          THREE CARDS, NOT ONE STRIP. They were welded into a single bordered
          block split by hairlines, which said "these are three columns of one
          table". They are not: outstanding, overdue and collected are three
          independent readings that happen to sit together, and one of them
          turns red on its own. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
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

      {/* Renders nothing when everything is inside its terms, so it appears
          only on the days it has something to say. */}
      <AgeingReport orders={orders} asOf={asOf} />

      <OrdersBrowser orders={orders} counts={counts} />
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
  const resolved = cents > 0 ? tone : "neutral";

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-raised px-4 py-3.5",
        // The border carries the state too, not just the figure. A card that is
        // entirely neutral except for one red number reads as a typo.
        resolved === "alert"
          ? "border-status-overdue-line"
          : resolved === "positive"
            ? "border-status-paid-line/70"
            : "border-line",
      )}
    >
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
