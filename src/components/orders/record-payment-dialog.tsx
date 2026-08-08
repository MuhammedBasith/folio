"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError, api } from "@/lib/api-client";
import { formatCents, formatMoney, parseAmountToCents } from "@/lib/money";

/**
 * Record a payment.
 *
 * This dialog does the arithmetic the user would otherwise do in their head:
 * the maximum is stated, and one tap fills the field with the exact remaining
 * balance. Most payments settle an invoice in full, so the common case is a
 * single click.
 *
 * When the server rejects an over-payment it returns `details.maxAllowedCents`,
 * and that number is written straight back into the hint. So if the balance
 * moved between the page rendering and the submit landing (a second payment
 * recorded elsewhere, say), the error does not just say no: it tells the user
 * the number that is true right now.
 */
export function RecordPaymentDialog({
  orderId,
  dueCents,
}: {
  orderId: string;
  dueCents: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [maxCents, setMaxCents] = useState(dueCents);
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting || isPending;

  function reset() {
    setAmount("");
    setNote("");
    setError(null);
    setMaxCents(dueCents);
    setPaidOn(new Date().toISOString().slice(0, 10));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = parseAmountToCents(amount);

    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    if (parsed.cents > maxCents) {
      // Caught here for instant feedback. The server checks it again inside a
      // row lock, which is the check that actually counts.
      setError(
        `That is more than the amount due. The most you can record is ${formatMoney(maxCents)}.`,
      );
      return;
    }

    setSubmitting(true);

    try {
      await api.recordPayment(orderId, {
        amountCents: parsed.cents,
        paidOn,
        note: note.trim() || undefined,
      });

      setOpen(false);
      reset();

      startTransition(() => {
        router.refresh();
      });
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);

        // Adopt the server's view of the balance. It may have changed since
        // this page was rendered.
        const serverMax = caught.details.maxAllowedCents;
        if (typeof serverMax === "number") {
          setMaxCents(serverMax);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" disabled={dueCents === 0}>
          {dueCents === 0 ? "Fully paid" : "Record payment"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-display-sm text-ink">
            Record a payment
          </DialogTitle>
          <DialogDescription className="text-body-sm text-ink-muted">
            {formatMoney(maxCents)} is still outstanding on this order.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="amount"
                className="text-body-sm font-medium text-ink"
              >
                Amount
              </label>
              <button
                type="button"
                onClick={() => {
                  setAmount(formatCents(maxCents));
                  setError(null);
                }}
                className="text-caption text-ink-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink"
              >
                Pay the full {formatMoney(maxCents)}
              </button>
            </div>
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              placeholder={formatCents(maxCents)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "amount-error" : "amount-hint"}
              autoFocus
            />
            {error ? (
              <p
                id="amount-error"
                role="alert"
                className="text-caption text-feedback-error-ink"
              >
                {error}
              </p>
            ) : (
              <p id="amount-hint" className="text-caption text-ink-faint">
                Maximum {formatMoney(maxCents)}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="paidOn" className="text-body-sm font-medium text-ink">
              Date received
            </label>
            <Input
              id="paidOn"
              type="date"
              value={paidOn}
              onChange={(event) => setPaidOn(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="note" className="text-body-sm font-medium text-ink">
              Note
              <span className="ml-1.5 font-normal text-ink-faint">optional</span>
            </label>
            <Input
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Bank transfer, cheque, reference number"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Recording" : "Record payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
