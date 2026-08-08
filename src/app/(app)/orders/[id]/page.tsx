import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError } from "@/server/api/errors";
import { Money } from "@/components/money";
import { StatusDot } from "@/components/status-badge";
import { PaymentHistory } from "@/components/orders/payment-history";
import { RecordPaymentDialog } from "@/components/orders/record-payment-dialog";
import { STATUS_DESCRIPTIONS, describeDueDate, formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getOrder } from "@/server/repositories/orders";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireUser();
  const { id } = await params;

  try {
    const order = await getOrder(session.userId, id);
    return { title: `${order.reference} · ${order.customer}` };
  } catch {
    return { title: "Order" };
  }
}

/**
 * Order detail.
 *
 * Reads through the repository, so the totals and status shown here come from
 * exactly the same domain functions the API uses. There is no second
 * implementation that could disagree with the list page.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const { id } = await params;

  /**
   * The repository throws an `ApiError` with a 404 status, which is the right
   * shape for the REST API but means nothing to Next. It has to be translated
   * into `notFound()` explicitly, otherwise a mistyped id renders the generic
   * error boundary instead of the 404 page.
   *
   * Only 404s are translated. Anything else is a genuine fault and should reach
   * the error boundary rather than being disguised as a missing page.
   */
  const order = await getOrder(session.userId, id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  });

  return (
    <main className="mx-auto w-full max-w-detail px-5 py-7 md:px-8 md:py-9">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-caption text-ink-faint transition-colors duration-160 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3" />
        Orders
      </Link>

      {/* ---- Header ----

          NO STATUS CHIP IN THE TOP RIGHT. There was one, and it said "Fully
          paid" beside a disabled button that also said "Fully paid": the same
          fact twice, once as a badge and once as a control that could not be
          used. The status now appears once, on the line under the customer
          name, where it sits with the due date it depends on. */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption text-ink-faint tabular-nums">
            {order.reference}
          </p>
          <h1 className="mt-1 font-heading text-display text-ink">
            {order.customer}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span title={STATUS_DESCRIPTIONS[order.status]}>
              <StatusDot status={order.status} />
            </span>
            <span aria-hidden className="text-ink-disabled">
              ·
            </span>
            <span className="text-body-sm text-ink-muted">
              Due {formatDate(order.dueDate)}
            </span>
            <span
              className={cn(
                "text-body-sm",
                order.status === "overdue"
                  ? "text-status-overdue-ink"
                  : "text-ink-faint",
              )}
            >
              {order.status === "paid"
                ? "settled in full"
                : describeDueDate(order.dueDate)}
            </span>
          </div>
        </div>

        <RecordPaymentDialog orderId={order.id} dueCents={order.dueCents} />
      </div>

      {/* ---- Notes ----

          A plain panel, with no coloured bar down its left edge. That bar is
          the callout treatment every documentation theme ships, so it arrives
          carrying an implied severity this text does not have: these are the
          user's own notes, not a warning. Quoting them in a recessed panel says
          "someone wrote this" without pretending to rank it. */}
      {order.notes ? (
        <div className="mt-5 max-w-prose rounded-lg border border-line-subtle bg-surface-sunken/55 px-4 py-3">
          <p className="text-caption text-ink-faint">Note</p>
          <p className="mt-1 text-body-sm text-ink-muted">{order.notes}</p>
        </div>
      ) : null}

      {/* ---- Money ---- */}
      <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        <Figure label="Order total" cents={order.totalCents} />
        <Figure
          label="Paid"
          cents={order.paidCents}
          share={
            order.totalCents > 0 ? order.paidCents / order.totalCents : 1
          }
          tone="positive"
        />
        <Figure
          label="Still due"
          cents={order.dueCents}
          share={order.totalCents > 0 ? order.dueCents / order.totalCents : 0}
          emphasis={order.dueCents > 0}
          tone={order.status === "overdue" ? "alert" : "neutral"}
        />
      </div>

      {/* ---- Lines ---- */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-caption font-medium text-ink-muted">Line items</h2>
          {!order.editable ? (
            <p className="text-caption text-ink-faint">
              Locked: payments have been recorded
            </p>
          ) : null}
        </div>

        <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface-raised">
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface-sunken/45">
                <Th className="text-left">Description</Th>
                <Th className="w-20 text-right">Qty</Th>
                <Th className="w-32 text-right">Unit price</Th>
                <Th className="w-32 text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-line-subtle last:border-b-0"
                >
                  <td className="px-3 py-2.5 text-ink">{line.description}</td>
                  <td
                    data-numeric
                    className="px-3 py-2.5 text-right text-ink-muted"
                  >
                    {line.quantity}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Money
                      cents={line.unitPriceCents}
                      className="text-ink-muted"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Money cents={line.lineTotalCents} tone="strong" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-sunken/55">
                <td
                  colSpan={3}
                  className="px-3 py-2.5 text-right text-caption text-ink-faint"
                >
                  Order total
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Money cents={order.totalCents} tone="strong" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ---- Payments ---- */}
      <section className="mt-8">
        <h2 className="text-caption font-medium text-ink-muted">
          Payment history
        </h2>

        {order.payments.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-line bg-surface-raised px-6 py-10 text-center">
            <p className="text-body-sm text-ink-muted">
              No payments recorded yet.
            </p>
            <p className="mt-1 text-caption text-ink-faint">
              When money arrives, record it here and the status updates itself.
            </p>
          </div>
        ) : (
          <PaymentHistory
            payments={order.payments}
            totalCents={order.totalCents}
          />
        )}
      </section>
    </main>
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
        "px-3 py-2.5 text-caption font-normal text-ink-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * One of the three figures at the top of the order.
 *
 * The share bar is the same device as on the dashboard, doing the same job at a
 * different scale: on the list it is "how much of everything", here it is "how
 * much of this order". Repeating one idea across two screens is worth more than
 * inventing a second way to say the same thing.
 */
function Figure({
  label,
  cents,
  share,
  emphasis,
  tone = "neutral",
}: {
  label: string;
  cents: number;
  share?: number;
  emphasis?: boolean;
  tone?: "neutral" | "alert" | "positive";
}) {
  const resolved = cents > 0 ? tone : "neutral";

  return (
    <div className="bg-surface-raised px-4 py-3.5">
      <p className="text-caption text-ink-faint">{label}</p>

      <p
        className={cn(
          "mt-1.5 text-metric-lg",
          resolved === "alert"
            ? "text-status-overdue-ink"
            : emphasis || share === undefined
              ? "text-ink"
              : "text-ink-muted",
        )}
      >
        <Money cents={cents} />
      </p>

      {share === undefined ? null : (
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
      )}
    </div>
  );
}
