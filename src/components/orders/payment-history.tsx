"use client";

import { useState } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { formatDate, pluralise } from "@/lib/format";

/** Payments visible before the list offers to show the rest. */
const PAGE_SIZE = 8;

interface PaymentRow {
  id: string;
  amountCents: number;
  paidOn: string;
  note: string | null;
}

/**
 * Payment history.
 *
 * A LEDGER WITH A RUNNING BALANCE, not a list of amounts. "$947.00" on its own
 * makes the reader do subtraction; "$947.00, leaving $1,000.00" answers the
 * question they actually had. The running figure is computed here from the
 * order total rather than stored, which is the same rule the rest of the
 * product follows: derive, never persist, so it cannot go stale.
 *
 * Payments arrive newest first, so "the balance after this payment" is the
 * total minus everything from this row DOWNWARDS: this payment plus every older
 * one. Reading the array in the order it arrives and subtracting as you go
 * would credit the most recent payment first and print a history that never
 * happened.
 *
 * Expressed as a slice per row rather than an accumulator, which is quadratic
 * and does not matter: an order has a handful of payments, and the pure version
 * says what it means in one line instead of maintaining a counter across a map.
 */
export function PaymentHistory({
  payments,
  totalCents,
}: {
  payments: PaymentRow[];
  totalCents: number;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  const withBalance = payments.map((payment, index) => {
    const paidByThen = payments
      .slice(index)
      .reduce((sum, older) => sum + older.amountCents, 0);

    return {
      ...payment,
      remainingCents: Math.max(0, totalCents - paidByThen),
    };
  });

  const visible = withBalance.slice(0, limit);
  const remaining = withBalance.length - visible.length;

  return (
    <>
      <ol className="mt-2 overflow-hidden rounded-xl border border-line bg-surface-raised">
        {visible.map((payment, index) => (
          <li
            key={payment.id}
            style={{ "--stagger-index": Math.min(index, 8) } as React.CSSProperties}
            className="rise-in flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <Money
                cents={payment.amountCents}
                tone="strong"
                className="text-body-sm"
              />
              {payment.note ? (
                <span className="ml-2 text-caption text-ink-muted">
                  {payment.note}
                </span>
              ) : null}
            </div>

            <div className="flex shrink-0 items-baseline gap-4">
              <span className="text-caption text-ink-faint">
                {payment.remainingCents === 0 ? (
                  "settled"
                ) : (
                  <>
                    left <Money cents={payment.remainingCents} tone="muted" />
                  </>
                )}
              </span>
              <span className="text-caption text-ink-faint tabular-nums">
                {formatDate(payment.paidOn)}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-ink-faint">
          {payments.length} {pluralise(payments.length, "payment")} recorded.
          Payments are a record of what happened and cannot be edited or removed.
        </p>

        {remaining > 0 ? (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
          >
            Show {Math.min(remaining, PAGE_SIZE)} more
          </Button>
        ) : null}
      </div>
    </>
  );
}
