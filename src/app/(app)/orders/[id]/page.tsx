import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApiError } from "@/server/api/errors";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
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
    return { title: `${order.reference} · ${order.customer} — Ledger` };
  } catch {
    return { title: "Order — Ledger" };
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
    <main className="mx-auto w-full max-w-detail px-5 py-10 md:px-8 md:py-14">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All orders
      </Link>

      {/* ---- Header ---- */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="font-mono text-label uppercase text-ink-faint">
            {order.reference}
          </p>
          <h1 className="mt-2 font-heading text-display text-ink">
            {order.customer}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span title={STATUS_DESCRIPTIONS[order.status]}>
              <StatusBadge status={order.status} />
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
                ? "Settled in full"
                : describeDueDate(order.dueDate)}
            </span>
          </div>
        </div>

        <RecordPaymentDialog orderId={order.id} dueCents={order.dueCents} />
      </div>

      {order.notes ? (
        <p className="mt-6 max-w-prose rounded-md border-l-2 border-line-strong/20 bg-surface-sunken px-4 py-3 text-body-sm text-ink-muted">
          {order.notes}
        </p>
      ) : null}

      {/* ---- Money ---- */}
      <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Figure label="Order total" cents={order.totalCents} />
        <Figure label="Paid" cents={order.paidCents} />
        <Figure
          label="Still due"
          cents={order.dueCents}
          emphasis={order.dueCents > 0}
          alert={order.status === "overdue"}
        />
      </div>

      {/* ---- Lines ---- */}
      <section className="mt-9">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-heading text-display-sm text-ink">Line items</h2>
          {!order.editable ? (
            <p className="text-caption text-ink-faint">
              Locked: payments have been recorded
            </p>
          ) : null}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface-raised">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-subtle bg-surface-sunken">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-label font-medium uppercase text-ink-faint"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-label font-medium uppercase text-ink-faint"
                >
                  Qty
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-label font-medium uppercase text-ink-faint"
                >
                  Unit price
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-label font-medium uppercase text-ink-faint"
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-line-subtle last:border-b-0"
                >
                  <td className="px-4 py-3.5 text-body-sm text-ink">
                    {line.description}
                  </td>
                  <td
                    data-numeric
                    className="px-4 py-3.5 text-right text-body-sm text-ink-muted"
                  >
                    {line.quantity}
                  </td>
                  <td className="px-4 py-3.5 text-right text-body-sm">
                    <Money
                      cents={line.unitPriceCents}
                      className="text-ink-muted"
                    />
                  </td>
                  <td className="px-4 py-3.5 text-right text-body-sm">
                    <Money cents={line.lineTotalCents} tone="strong" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-sunken">
                <td
                  colSpan={3}
                  className="px-4 py-3.5 text-right text-label uppercase text-ink-faint"
                >
                  Order total
                </td>
                <td className="px-4 py-3.5 text-right">
                  <Money cents={order.totalCents} tone="strong" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ---- Payments ---- */}
      <section className="mt-9">
        <h2 className="font-heading text-display-sm text-ink">
          Payment history
        </h2>

        {order.payments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-raised px-6 py-12 text-center">
            <p className="text-body-sm text-ink-muted">
              No payments recorded yet.
            </p>
            <p className="mt-1 text-caption text-ink-faint">
              When money arrives, record it here and the status updates itself.
            </p>
          </div>
        ) : (
          <ol className="mt-4 overflow-hidden rounded-lg border border-line bg-surface-raised">
            {order.payments.map((payment, index) => (
              <li
                key={payment.id}
                style={{ "--stagger-index": index } as React.CSSProperties}
                className="rise-in flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-4 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <Money
                    cents={payment.amountCents}
                    tone="strong"
                    className="text-body"
                  />
                  {payment.note ? (
                    <p className="mt-0.5 truncate text-caption text-ink-muted">
                      {payment.note}
                    </p>
                  ) : null}
                </div>
                <p className="text-caption text-ink-faint">
                  {formatDate(payment.paidOn)}
                </p>
              </li>
            ))}
          </ol>
        )}

        {order.payments.length > 0 ? (
          <p className="mt-3 text-caption text-ink-faint">
            {order.payments.length === 1
              ? "1 payment recorded."
              : `${order.payments.length} payments recorded.`}{" "}
            Payments are a record of what happened and cannot be edited or
            removed.
          </p>
        ) : null}
      </section>
    </main>
  );
}

function Figure({
  label,
  cents,
  emphasis,
  alert,
}: {
  label: string;
  cents: number;
  emphasis?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="bg-surface-raised px-5 py-5">
      <p className="text-label uppercase text-ink-faint">{label}</p>
      <p
        className={cn(
          "mt-2 text-metric-lg",
          alert && cents > 0
            ? "text-status-overdue-ink"
            : emphasis
              ? "text-ink"
              : "text-ink-muted",
        )}
      >
        <Money cents={cents} />
      </p>
    </div>
  );
}
