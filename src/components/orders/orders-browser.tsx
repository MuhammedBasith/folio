"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderSearch } from "@/components/orders/order-search";
import { StatusFilter } from "@/components/orders/status-filter";
import {
  type OrderStatus,
  compareByUrgency,
  isOrderStatus,
} from "@/lib/domain/orders";
import { STATUS_LABELS } from "@/lib/format";
import type { OrderDto } from "@/server/repositories/orders";

/**
 * Filtering and search, entirely on the client.
 *
 * THIS USED TO GO TO THE SERVER, AND IT WAS THE WRONG ARCHITECTURE. Changing a
 * tab called `router.replace`, which re-ran the page as a Server Component: a
 * fresh database query, a fresh render, a fresh RSC payload over the wire, all
 * to decide which of the rows already on screen should be hidden. On localhost
 * that is fifty milliseconds and easy to miss. On a serverless function talking
 * to a database that suspends when idle, it is one to three seconds of a tab
 * that does not move when you press it.
 *
 * Nothing about it needed the server. The page already loads every order in one
 * query, because the summary figures and the per-status counts both need the
 * full set anyway. Filtering that array is a microsecond of work in the browser.
 *
 * So the URL is updated with `history.pushState`, which Next integrates with
 * its router: `useSearchParams` sees the change, this component re-renders, and
 * no server component re-runs. The URL stays shareable, the back button still
 * works, and the tab moves on the frame you clicked it.
 *
 * `pushState` for the filter, because going back to the previous tab is a
 * reasonable thing to want. `replaceState` for the search box, because one
 * history entry per keystroke is not.
 */
export function OrdersBrowser({
  orders,
  counts,
}: {
  orders: OrderDto[];
  counts: Record<OrderStatus, number>;
}) {
  const searchParams = useSearchParams();

  const status = searchParams.get("status");
  const activeStatus = isOrderStatus(status) ? status : undefined;

  /**
   * The query is held locally as well as in the URL.
   *
   * Typing has to be instant, and the URL is only a place to record where you
   * ended up. Local state leads; the URL follows on a debounce so the address
   * bar does not thrash while somebody is mid-word.
   */
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");

  const writeUrl = useCallback((next: URLSearchParams, push: boolean) => {
    const search = next.toString();
    const url = search ? `?${search}` : window.location.pathname;

    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const selectStatus = useCallback(
    (value: string) => {
      const params = new URLSearchParams(window.location.search);

      if (value === "all") params.delete("status");
      else params.set("status", value);

      writeUrl(params, true);
    },
    [writeUrl],
  );

  const changeQuery = useCallback(
    (value: string) => {
      setQuery(value);

      const params = new URLSearchParams(window.location.search);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");

      writeUrl(params, false);
    },
    [writeUrl],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return orders
      .filter((order) => {
        if (activeStatus && order.status !== activeStatus) return false;
        if (!needle) return true;

        // Customer and reference only. Searching the notes as well would
        // produce hits the user cannot see anywhere in the row that matched,
        // which reads as a bug rather than as a feature.
        return (
          order.customer.toLowerCase().includes(needle) ||
          order.reference.toLowerCase().includes(needle)
        );
      })
      // Sorted for reading, not for storage. The repository returns due date
      // ascending, which is right for the API and the CSV export but opens this
      // page on an order that settled two months ago.
      .sort(compareByUrgency);
  }, [orders, activeStatus, query]);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <StatusFilter
          counts={counts}
          total={orders.length}
          value={activeStatus ?? "all"}
          onSelect={selectStatus}
        />

        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <OrderSearch value={query} onChange={changeQuery} />
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
        </div>
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
            title={query.trim() ? `Nothing matches “${query.trim()}”` : "Nothing here"}
            body={
              query.trim()
                ? "Search looks at the customer name and the reference."
                : `No orders are ${STATUS_LABELS[activeStatus!].toLowerCase()}.`
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  writeUrl(new URLSearchParams(), true);
                }}
              >
                Clear filters
              </Button>
            }
          />
        )}
      </div>
    </>
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
