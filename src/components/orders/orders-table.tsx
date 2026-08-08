"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Money } from "@/components/money";
import { StatusDot } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { describeDueDate, formatDateShort, pluralise } from "@/lib/format";
import type { OrderDto } from "@/server/repositories/orders";
import { cn } from "@/lib/utils";

/** How many rows before the list stops and offers to show more. */
const PAGE_SIZE = 12;

/**
 * Orders list.
 *
 * A DENSE LEDGER, NOT A CARD GRID. Rows are single-line so a full screen of
 * orders is visible at once, which is the entire reason someone opens this
 * page. Hairline rules, tabular figures, and nothing between the rows competing
 * for attention.
 *
 * THE WHOLE ROW IS THE LINK, AND IT SAYS SO. Previously only the reference cell
 * was clickable, which nobody found: you had to already know to aim at
 * ORD-0002. Now a stretched anchor covers the row, the row lifts on hover, and
 * a chevron appears in a column reserved for it. That column is present whether
 * or not the chevron is showing, so the chevron arriving cannot move the
 * figures beside it.
 *
 * TWO LAYOUTS, NOT ONE SCROLLING SIDEWAYS. Seven columns in a 375px viewport
 * either scroll horizontally, hiding the amount due, or crush every column into
 * two words. Phones get a stacked row per order with the same information in
 * priority order.
 *
 * It is a client component only because of the "show more" counter. Everything
 * it renders came from the server; nothing is fetched here.
 */
export function OrdersTable({ orders }: { orders: OrderDto[] }) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  const visible = orders.slice(0, limit);
  const remaining = orders.length - visible.length;

  return (
    <>
      {/* ---- Phones ---- */}
      <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface-raised md:hidden">
        {visible.map((order, index) => (
          <li key={order.id} style={stagger(index)} className="rise-in">
            <Link
              href={`/orders/${order.id}`}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-colors duration-120",
                "active:bg-surface-sunken",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-body font-medium text-ink">
                    {order.customer}
                  </span>
                  <Money
                    cents={order.dueCents}
                    tone={order.dueCents === 0 ? "muted" : "strong"}
                    className="shrink-0 text-body"
                  />
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <StatusDot status={order.status} className="text-caption" />
                  <span
                    className={cn(
                      "shrink-0 text-caption",
                      order.status === "overdue"
                        ? "text-status-overdue-ink"
                        : "text-ink-faint",
                    )}
                  >
                    {order.status === "paid"
                      ? "Settled"
                      : describeDueDate(order.dueDate)}
                  </span>
                </div>
              </div>
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-ink-disabled"
              />
            </Link>
          </li>
        ))}
      </ul>

      {/* ---- Tablet and up ---- */}
      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface-raised md:block">
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">
            Orders, showing reference, customer, status, total, amount paid,
            amount due and due date. Each row links to the order.
          </caption>
          <thead>
            <tr className="border-b border-line-subtle bg-surface-sunken/45">
              <Th className="w-24 text-left">Ref</Th>
              <Th className="text-left">Customer</Th>
              <Th className="w-30 text-left">Status</Th>
              <Th className="w-28 text-right">Total</Th>
              <Th className="w-28 text-right">Paid</Th>
              <Th className="w-28 text-right">Due</Th>
              {/*
                Wide enough for "21 days overdue" without wrapping. At w-40 the
                relative phrase dropped to a second line on exactly the rows the
                reader most needs to compare, so those rows became taller than
                the ones around them and the column of figures stopped scanning.
              */}
              <Th className="w-52 text-left">Due date</Th>
              <Th className="w-9">
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((order, index) => (
              <tr
                key={order.id}
                style={stagger(index)}
                className={cn(
                  "group rise-in border-b border-line-subtle last:border-b-0",
                  "transition-colors duration-120 hover:bg-surface-sunken/55",
                )}
              >
                <Td className="font-mono text-caption text-ink-faint">
                  {/*
                    A stretched anchor, not an onClick on the row, so it stays a
                    real link: keyboard focusable, middle-clickable, copyable.

                    Its ::after covers the whole row, so the anchor's own outline
                    would ring this cell alone. The outline moves onto the
                    ::after box, which is the shape the user activates.
                  */}
                  <Link
                    href={`/orders/${order.id}`}
                    className={cn(
                      "after:absolute after:inset-0 after:content-['']",
                      "outline-none",
                      "focus-visible:after:outline-2 focus-visible:after:-outline-offset-2",
                      "focus-visible:after:outline-(--focus-ring)",
                    )}
                  >
                    {order.reference}
                  </Link>
                </Td>
                <Td className="font-medium text-ink">
                  <span className="block truncate">{order.customer}</span>
                </Td>
                <Td>
                  <StatusDot status={order.status} />
                </Td>
                <Td className="text-right">
                  <Money cents={order.totalCents} className="text-ink-muted" />
                </Td>
                <Td className="text-right">
                  <Money
                    cents={order.paidCents}
                    tone={order.paidCents === 0 ? "muted" : "default"}
                    className={order.paidCents === 0 ? "" : "text-ink-muted"}
                  />
                </Td>
                <Td className="text-right">
                  <Money
                    cents={order.dueCents}
                    tone={order.dueCents === 0 ? "muted" : "strong"}
                  />
                </Td>
                <Td className="whitespace-nowrap text-ink-muted">
                  <span className="tabular-nums">
                    {formatDateShort(order.dueDate)}
                  </span>
                  <span
                    className={cn(
                      "ml-2 text-caption",
                      order.status === "overdue"
                        ? "text-status-overdue-ink"
                        : "text-ink-faint",
                    )}
                  >
                    {order.status === "paid"
                      ? "settled"
                      : describeDueDate(order.dueDate)}
                  </span>
                </Td>
                <Td className="text-right">
                  <ChevronRight
                    aria-hidden
                    className="ml-auto size-3.5 text-ink-disabled opacity-0 transition-opacity duration-120 group-hover:opacity-100"
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Show more, not infinite scroll and not numbered pages.

        Twelve rows is roughly a screen. Past that the honest thing is to say
        how many are left rather than silently truncating, which is what a bare
        "next" arrow does. The count is the point: "38 more" tells you whether
        it would be quicker to filter instead.
      */}
      {remaining > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
          >
            Show {Math.min(remaining, PAGE_SIZE)} more
          </Button>
          <span className="text-caption text-ink-faint">
            {visible.length} of {orders.length}{" "}
            {pluralise(orders.length, "order")}
          </span>
        </div>
      ) : null}
    </>
  );
}

/**
 * Stagger caps at eight rows.
 *
 * Uncapped, the fortieth row waits 1.6 seconds to appear, and an entrance that
 * outlasts the reader's attention is lag, not polish. Past the eighth the
 * cascade has already done its job.
 */
function stagger(index: number): React.CSSProperties {
  return { "--stagger-index": Math.min(index, 8) } as React.CSSProperties;
}

function Th({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-caption font-normal text-ink-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <td className={cn("relative px-3 py-2.5", className)}>{children}</td>;
}
