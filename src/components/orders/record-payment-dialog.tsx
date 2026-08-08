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
import { StableLabel } from "@/components/ui/stable-label";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { ApiClientError, api } from "@/lib/api-client";
import { formatCents, formatMoney, parseAmountToCents } from "@/lib/money";
import { todayLocalIso } from "@/lib/format";

/**
 * Record a payment.
 *
 * This dialog does the arithmetic the user would otherwise do in their head:
 * the maximum is stated, and one tap fills the field with the exact remaining
 * balance. Most payments settle an invoice in full, so the common case is a
 * single click.
 *
 * NOTHING IS RENDERED WHEN THE ORDER IS SETTLED. There used to be a disabled
 * button reading "Fully paid", which is not a control at all: it looks like an
 * action, cannot be used, and repeats what the status beside it already says.
 * A dead button is worse than no button, because the user has to work out why
 * it will not respond.
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
  const [paidOn, setPaidOn] = useState(todayLocalIso);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [maxCents, setMaxCents] = useState(dueCents);
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting || isPending;

  if (dueCents === 0) return null;

  /**
   * Reset on OPEN, not on close.
   *
   * Two bugs lived here. Resetting on close re-seeded `maxCents` from a
   * `dueCents` prop that was still the pre-refresh value, so reopening the
   * dialog after a payment offered a maximum that had already been collected.
   * And `submitting` was never cleared on the success path at all, so after one
   * successful payment the button read "Recording" and stayed disabled for the
   * life of the page.
   *
   * Seeding on open fixes both: the prop is current by then, and every field
   * including `submitting` starts from a known state each time.
   */
  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) {
      setAmount("");
      setNote("");
      setError(null);
      setMaxCents(dueCents);
      setPaidOn(todayLocalIso());
    }

    setSubmitting(false);
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
      setSubmitting(false);

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
        <Button size="sm">Record payment</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader className="gap-1">
          <DialogTitle className="font-heading text-display-sm text-ink">
            Record a payment
          </DialogTitle>
          <DialogDescription className="text-body-sm text-ink-muted">
            {formatMoney(maxCents)} is still outstanding on this order.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="amount"
                className="text-caption font-medium text-ink-muted"
              >
                Amount
              </label>
              {/*
                A chip, not an underlined link. The old treatment made the most
                common action on this screen look like a footnote, and links
                inside a form imply navigation away from it.
              */}
              <button
                type="button"
                onClick={() => {
                  setAmount(formatCents(maxCents));
                  setError(null);
                }}
                className="pressable rounded-full border border-line bg-surface-sunken/60 px-2 py-0.5 text-caption text-ink-muted transition-colors duration-160 ease-out-quint hover:border-line-strong/25 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
              >
                Pay in full
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

          <div className="space-y-2">
            <label
              htmlFor="paidOn"
              className="block text-caption font-medium text-ink-muted"
            >
              Date received
            </label>
            <DateField id="paidOn" value={paidOn} onChange={setPaidOn} />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="note"
              className="block text-caption font-medium text-ink-muted"
            >
              Note
              <span className="ml-1.5 font-normal text-ink-disabled">
                optional
              </span>
            </label>
            <Input
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Bank transfer, cheque, reference number"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              <StableLabel
                options={["Record payment", "Recording"]}
                active={busy ? "Recording" : "Record payment"}
              />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
