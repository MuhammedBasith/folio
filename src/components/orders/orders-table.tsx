import Link from "next/link";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { describeDueDate, formatDate } from "@/lib/format";
import type { OrderDto } from "@/server/repositories/orders";
import { cn } from "@/lib/utils";

/**
 * Orders list.
 *
 * TWO LAYOUTS, NOT ONE SCROLLING SIDEWAYS. A six-column money table shoved into
 * a 375px viewport is the lazy answer: it either scrolls horizontally, which
 * hides the amount due (the single most important column), or it crushes every
 * column into two words. So the table is desktop-only and phones get a stacked
 * card per order, with the same information ordered by importance.
 *
 * Amount due is the emphasised figure in both. Total and paid are context; what
 * the user actually came to find out is what is still owed.
 */
export function OrdersTable({ orders }: { orders: OrderDto[] }) {
  return (
    <>
      {/* ---- Phones ---- */}
      <ul className="flex flex-col gap-3 md:hidden">
        {orders.map((order, index) => (
          <li
            key={order.id}
            style={{ "--stagger-index": index } as React.CSSProperties}
            className="rise-in"
          >
            <Link
              href={`/orders/${order.id}`}
              className={cn(
                "block rounded-lg border border-line bg-surface-raised p-4",
                "transition-[border-color,box-shadow] duration-[160ms] ease-out-quint",
                "hover:border-line-strong/25 hover:shadow-raised",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">
                    {order.customer}
                  </p>
                  <p className="mt-0.5 font-mono text-caption text-ink-faint">
                    {order.reference}
                  </p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-label uppercase text-ink-faint">Due</p>
                  <Money
                    cents={order.dueCents}
                    tone={order.dueCents === 0 ? "muted" : "strong"}
                    className="text-metric"
                  />
                </div>
                <div className="text-right">
                  <p className="text-caption text-ink-muted">
                    {formatDate(order.dueDate)}
                  </p>
                  <p
                    className={cn(
                      "text-caption",
                      order.status === "overdue"
                        ? "text-status-overdue-ink"
                        : "text-ink-faint",
                    )}
                  >
                    {order.status === "paid"
                      ? "Settled"
                      : describeDueDate(order.dueDate)}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* ---- Tablet and up ---- */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface-raised md:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Orders, showing customer, status, total, amount paid, amount due and
            due date.
          </caption>
          <thead>
            <tr className="border-b border-line-subtle bg-surface-sunken">
              <Th className="text-left">Customer</Th>
              <Th className="text-left">Status</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Due</Th>
              <Th className="text-left">Due date</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => (
              <tr
                key={order.id}
                style={{ "--stagger-index": index } as React.CSSProperties}
                className={cn(
                  "rise-in group border-b border-line-subtle last:border-b-0",
                  "transition-colors duration-[120ms] hover:bg-surface-sunken/60",
                )}
              >
                <Td>
                  {/*
                    A stretched anchor, not an onClick on the row, so it stays a
                    real link: keyboard focusable, middle-clickable, copyable.

                    Its ::after covers the whole row, so the anchor's own
                    outline would ring the customer cell alone. The outline is
                    moved onto the ::after box instead, which is the shape the
                    user is about to activate. Removing the indicator without
                    replacing it would leave keyboard users with no idea where
                    they are.
                  */}
                  <Link
                    href={`/orders/${order.id}`}
                    className={cn(
                      "after:absolute after:inset-0 after:content-[''] after:rounded-sm",
                      "outline-none",
                      "focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px]",
                      "focus-visible:after:outline-[var(--focus-ring)]",
                    )}
                  >
                    <span className="block font-medium text-ink">
                      {order.customer}
                    </span>
                    <span className="mt-0.5 block font-mono text-caption text-ink-faint">
                      {order.reference}
                    </span>
                  </Link>
                </Td>
                <Td>
                  <StatusBadge status={order.status} />
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
                <Td>
                  <span className="block text-ink-muted">
                    {formatDate(order.dueDate)}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-caption",
                      order.status === "overdue"
                        ? "text-status-overdue-ink"
                        : "text-ink-faint",
                    )}
                  >
                    {order.status === "paid"
                      ? "Settled"
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
        "px-4 py-3 text-label font-medium uppercase text-ink-faint",
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
  return (
    <td className={cn("relative px-4 py-4 text-body-sm", className)}>
      {children}
    </td>
  );
}
