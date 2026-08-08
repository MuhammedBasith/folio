import Link from "next/link";
import { Money } from "@/components/money";
import { StatusDot } from "@/components/status-badge";
import { describeDueDate, formatDateShort } from "@/lib/format";
import type { OrderDto } from "@/server/repositories/orders";
import { cn } from "@/lib/utils";

/**
 * Orders list.
 *
 * A DENSE DATA TABLE, not a spacious card grid. Rows are single-line so a full
 * page of orders is visible at once, which is the entire reason someone opens
 * this screen. The earlier version stacked a two-line customer cell against a
 * tinted pill, ran to 68px a row, showed six orders on a laptop, and read as a
 * marketing table rather than a working one.
 *
 * The reference is a ledger page: hairline rules, tabular figures, and nothing
 * between the rows competing for attention.
 *
 * TWO LAYOUTS, NOT ONE SCROLLING SIDEWAYS. Seven columns in a 375px viewport
 * either scroll horizontally, hiding the amount due, or crush every column into
 * two words. Phones get a stacked row per order with the same information in
 * priority order.
 */
export function OrdersTable({ orders }: { orders: OrderDto[] }) {
  return (
    <>
      {/* ---- Phones ---- */}
      <ul className="divide-y divide-line-subtle overflow-hidden rounded-lg border border-line bg-surface-raised md:hidden">
        {orders.map((order, index) => (
          <li key={order.id} style={stagger(index)} className="rise-in">
            <Link
              href={`/orders/${order.id}`}
              className={cn(
                "block px-4 py-3 transition-colors duration-120",
                "hover:bg-surface-sunken/70 active:bg-surface-sunken",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)",
              )}
            >
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
            </Link>
          </li>
        ))}
      </ul>

      {/* ---- Tablet and up ---- */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface-raised md:block">
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">
            Orders, showing reference, customer, status, total, amount paid,
            amount due and due date.
          </caption>
          <thead>
            <tr className="border-b border-line-subtle bg-surface-sunken/60">
              <Th className="w-24 text-left">Ref</Th>
              <Th className="text-left">Customer</Th>
              <Th className="w-32 text-left">Status</Th>
              <Th className="w-28 text-right">Total</Th>
              <Th className="w-28 text-right">Paid</Th>
              <Th className="w-28 text-right">Due</Th>
              <Th className="w-44 text-left">Due date</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => (
              <tr
                key={order.id}
                style={stagger(index)}
                className={cn(
                  "rise-in border-b border-line-subtle last:border-b-0",
                  "transition-colors duration-120 hover:bg-surface-sunken/60",
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
                <Td className="text-ink-muted">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        "px-3 py-2 text-label font-medium uppercase text-ink-faint",
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
