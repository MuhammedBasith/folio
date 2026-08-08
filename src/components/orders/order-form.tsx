"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError, api } from "@/lib/api-client";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import { localIsoInDays, todayLocalIso } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Order editor.
 *
 * Amounts are typed as text and parsed with the shared money parser, never with
 * `parseFloat`. Everything sent to the API is integer cents, so the value the
 * user sees and the value stored are the same number by construction.
 *
 * The running total is a preview only. The server recomputes it from the line
 * items and never trusts a client-supplied total, which is why no total is sent
 * in the request at all.
 */

interface DraftLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let lineCounter = 0;
function emptyLine(): DraftLine {
  lineCounter += 1;
  return {
    key: `line-${lineCounter}`,
    description: "",
    quantity: "1",
    unitPrice: "",
  };
}

/**
 * Defaults come from the user's own calendar, not UTC.
 *
 * A UTC minimum blocks the user's local today for anyone west of Greenwich in
 * the evening: their calendar says the 8th, the input refuses anything before
 * the 9th.
 */
const defaultDueDate = () => localIsoInDays(14);

export function OrderForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const [customer, setCustomer] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);

  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const busy = submitting || isPending;

  /**
   * Running total.
   *
   * Unparseable lines contribute nothing rather than throwing, because this
   * recomputes on every keystroke and a half-typed "12." must not blow up the
   * page. Validation on submit is what reports those.
   */
  const previewTotalCents = useMemo(() => {
    return lines.reduce((total, line) => {
      const price = parseAmountToCents(line.unitPrice);
      const quantity = Number(line.quantity);

      if (!price.ok || !Number.isSafeInteger(quantity) || quantity < 1) {
        return total;
      }

      return total + price.cents * quantity;
    }, 0);
  }, [lines]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  /**
   * Adding or removing a line clears the line errors.
   *
   * They are keyed by array index (`lines.2.quantity`), which the server's own
   * paths force. Remove line 1 and every error after it now points at a
   * different, valid row: the user sees "at least 1" under a field reading 3.
   * Clearing is honest, and submitting re-derives them against the new shape.
   */
  function clearLineErrors() {
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith("lines.")),
      ),
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
    clearLineErrors();
  }

  function removeLine(key: string) {
    setLines((current) =>
      current.length === 1 ? current : current.filter((l) => l.key !== key),
    );
    clearLineErrors();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};

    if (customer.trim().length === 0) {
      nextErrors.customer = "Enter the customer's name.";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      nextErrors.dueDate = "Choose a due date.";
    }

    const parsedLines = lines.map((line, index) => {
      const price = parseAmountToCents(line.unitPrice);
      const quantity = Number(line.quantity);

      if (line.description.trim().length === 0) {
        nextErrors[`lines.${index}.description`] = "Describe this line.";
      }

      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        nextErrors[`lines.${index}.quantity`] = "At least 1.";
      }

      if (!price.ok) {
        nextErrors[`lines.${index}.unitPrice`] = price.error;
      }

      return {
        description: line.description.trim(),
        quantity: Number.isSafeInteger(quantity) ? quantity : 0,
        unitPriceCents: price.ok ? price.cents : 0,
      };
    });

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const { order } = await api.createOrder({
        customer: customer.trim(),
        dueDate,
        notes: notes.trim() || undefined,
        lineItems: parsedLines,
      });

      startTransition(() => {
        router.push(`/orders/${order.id}`);
        router.refresh();
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        // Server field paths are `lineItems.0.quantity`; the form keys them as
        // `lines.0.quantity`, so they are mapped rather than shown raw.
        const mapped: Record<string, string> = {};
        for (const [key, message] of Object.entries(error.fields)) {
          mapped[key.replace(/^lineItems\./, "lines.")] = message;
        }
        setErrors(mapped);
        if (Object.keys(mapped).length === 0) setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* ---- Details ---- */}
      <section className="rounded-lg border border-line bg-surface-raised p-5 md:p-6">
        <h2 className="font-heading text-display-sm text-ink">Details</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Labelled label="Customer" name="customer" error={errors.customer}>
            <Input
              id="customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Acme Corp"
              aria-invalid={errors.customer ? true : undefined}
              autoFocus
            />
          </Labelled>

          <Labelled
            label="Due date"
            name="dueDate"
            error={errors.dueDate}
            hint="When you expect to be paid."
          >
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              min={todayLocalIso()}
              onChange={(e) => setDueDate(e.target.value)}
              aria-invalid={errors.dueDate ? true : undefined}
            />
          </Labelled>
        </div>

        <div className="mt-4">
          <Labelled label="Notes" name="notes" optional error={errors.notes}>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering about this order"
              maxLength={1000}
              aria-invalid={errors.notes ? true : undefined}
            />
          </Labelled>
        </div>
      </section>

      {/* ---- Lines ---- */}
      <section className="rounded-lg border border-line bg-surface-raised p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-display-sm text-ink">Line items</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            <Plus aria-hidden />
            Add line
          </Button>
        </div>

        <ul className="mt-5 space-y-3">
          {lines.map((line, index) => {
            const price = parseAmountToCents(line.unitPrice);
            const quantity = Number(line.quantity);
            const lineTotal =
              price.ok && Number.isSafeInteger(quantity) && quantity > 0
                ? price.cents * quantity
                : null;

            return (
              <li
                key={line.key}
                className="rounded-md border border-line-subtle bg-surface p-4"
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_auto] sm:items-start">
                  <Labelled
                    label="Description"
                    name={`lines.${index}.description`}
                    error={errors[`lines.${index}.description`]}
                    compact
                  >
                    <Input
                      id={`lines.${index}.description`}
                      value={line.description}
                      onChange={(e) =>
                        updateLine(line.key, { description: e.target.value })
                      }
                      placeholder="Laptop"
                      aria-invalid={
                        errors[`lines.${index}.description`] ? true : undefined
                      }
                    />
                  </Labelled>

                  <Labelled
                    label="Qty"
                    name={`lines.${index}.quantity`}
                    error={errors[`lines.${index}.quantity`]}
                    compact
                  >
                    <Input
                      id={`lines.${index}.quantity`}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, { quantity: e.target.value })
                      }
                      aria-invalid={
                        errors[`lines.${index}.quantity`] ? true : undefined
                      }
                    />
                  </Labelled>

                  <Labelled
                    label="Unit price"
                    name={`lines.${index}.unitPrice`}
                    error={errors[`lines.${index}.unitPrice`]}
                    compact
                  >
                    <Input
                      id={`lines.${index}.unitPrice`}
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(line.key, { unitPrice: e.target.value })
                      }
                      placeholder="500.00"
                      aria-invalid={
                        errors[`lines.${index}.unitPrice`] ? true : undefined
                      }
                    />
                  </Labelled>

                  <div className="flex items-center justify-between gap-3 sm:mt-6 sm:justify-end">
                    <span
                      data-numeric
                      className="text-body-sm text-ink-muted sm:min-w-24 sm:text-right"
                    >
                      {/* Blank rather than a dash: the line has no total yet,
                          and the reserved width stops the row from jumping. */}
                      {lineTotal === null ? "" : formatMoney(lineTotal)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                      title={
                        lines.length === 1
                          ? "An order needs at least one line"
                          : "Remove this line"
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-baseline justify-between border-t border-line-subtle pt-4">
          <span className="text-label uppercase text-ink-faint">
            Order total
          </span>
          <span data-numeric className="text-metric text-ink">
            {formatMoney(previewTotalCents)}
          </span>
        </div>
        <p className="mt-2 text-caption text-ink-faint">
          Calculated on the server from the lines above. Never taken from the
          browser.
        </p>
      </section>

      {formError ? (
        <p
          role="alert"
          className="rounded-md border border-feedback-error-line bg-feedback-error-tint px-3 py-2.5 text-caption text-feedback-error-ink"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Creating order" : "Create order"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => router.back()}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Labelled({
  label,
  name,
  error,
  hint,
  optional,
  compact,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className={cn(
          "block font-medium text-ink",
          compact ? "text-caption" : "text-body-sm",
        )}
      >
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-ink-faint">optional</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-caption text-feedback-error-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}
