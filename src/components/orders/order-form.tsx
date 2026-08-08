"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError, api } from "@/lib/api-client";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import { localIsoInDays, todayLocalIso } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Order editor.
 *
 * LINE ITEMS ARE A GRID, NOT A LIST OF CARDS. The earlier version wrapped every
 * line in its own bordered box inside a bordered section inside a bordered
 * page: three nested frames to hold three inputs. Lines here share one header
 * row and sit on hairline rules, so the columns align down the page and the
 * form reads as the document it is producing.
 *
 * Amounts are typed as text and parsed with the shared money parser, never with
 * `parseFloat`. Everything sent to the API is integer cents, so the value the
 * user sees and the value stored are the same number by construction.
 *
 * The running total is a preview. The server recomputes it from the lines and
 * never trusts a client-supplied total, which is why none is sent.
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
 * Defaults come from the user's own calendar, not UTC. A UTC minimum blocks the
 * user's local today for anyone west of Greenwich in the evening: their
 * calendar says the 8th, the input refuses anything before the 9th.
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
   * recomputes on every keystroke and a half-typed "12." must not break the
   * page. Validation on submit reports those.
   */
  const previewTotalCents = useMemo(
    () =>
      lines.reduce((total, line) => {
        const price = parseAmountToCents(line.unitPrice);
        const quantity = Number(line.quantity);

        if (!price.ok || !Number.isSafeInteger(quantity) || quantity < 1) {
          return total;
        }

        return total + price.cents * quantity;
      }, 0),
    [lines],
  );

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  /**
   * Adding or removing a line clears the line errors.
   *
   * They are keyed by array index (`lines.2.quantity`), which the server's own
   * paths force. Remove line 1 and every error after it points at a different,
   * valid row: the user sees "at least 1" under a field reading 3. Clearing is
   * honest, and submitting re-derives them against the new shape.
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

    if (Object.keys(nextErrors).length > 0) return;

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

  const lineErrors = lines.flatMap((_, index) =>
    ["description", "quantity", "unitPrice"]
      .map((field) => errors[`lines.${index}.${field}`])
      .filter(Boolean),
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* ---- Who and when ---- */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <Field label="Customer" name="customer" error={errors.customer}>
          <Input
            id="customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Acme Corp"
            aria-invalid={errors.customer ? true : undefined}
            autoFocus
          />
        </Field>

        <Field label="Due date" name="dueDate" error={errors.dueDate}>
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            min={todayLocalIso()}
            onChange={(e) => setDueDate(e.target.value)}
            aria-invalid={errors.dueDate ? true : undefined}
          />
        </Field>
      </div>

      {/* ---- Lines ---- */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-label uppercase text-ink-faint">Line items</h2>
          <span data-numeric className="text-caption text-ink-faint">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </span>
        </div>

        <div className="mt-2 overflow-hidden rounded-lg border border-line bg-surface-raised">
          {/*
            Column headers, hidden on phones where the grid stacks.

            The `px-1.5` matches the inner padding of the borderless inputs
            below, so a label sits directly above the text it names. Without it
            every heading is six pixels left of its column and the grid reads as
            slightly broken without it being obvious why.
          */}
          <div className="hidden border-b border-line-subtle bg-surface-sunken/60 px-3 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_7rem_6.5rem_1.75rem] sm:gap-3">
            <span className="px-1.5 text-label uppercase text-ink-faint">
              Description
            </span>
            <span className="px-1.5 text-label uppercase text-ink-faint">
              Qty
            </span>
            <span className="px-1.5 text-label uppercase text-ink-faint">
              Unit price
            </span>
            <span className="text-right text-label uppercase text-ink-faint">
              Amount
            </span>
            <span className="sr-only">Remove</span>
          </div>

          <ul>
            {lines.map((line, index) => {
              const price = parseAmountToCents(line.unitPrice);
              const quantity = Number(line.quantity);
              const lineTotal =
                price.ok && Number.isSafeInteger(quantity) && quantity > 0
                  ? price.cents * quantity
                  : null;

              const hasError =
                errors[`lines.${index}.description`] ??
                errors[`lines.${index}.quantity`] ??
                errors[`lines.${index}.unitPrice`];

              return (
                <li
                  key={line.key}
                  className={cn(
                    "border-b border-line-subtle px-3 py-2 last:border-b-0",
                    "sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_7rem_6.5rem_1.75rem] sm:items-center sm:gap-3",
                    hasError && "bg-feedback-error-tint/40",
                  )}
                >
                  <BareInput
                    aria-label={`Line ${index + 1} description`}
                    value={line.description}
                    onChange={(e) =>
                      updateLine(line.key, { description: e.target.value })
                    }
                    placeholder="What was supplied"
                    invalid={Boolean(errors[`lines.${index}.description`])}
                  />

                  <div className="mt-2 grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 sm:mt-0 sm:contents">
                    <BareInput
                      aria-label={`Line ${index + 1} quantity`}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, { quantity: e.target.value })
                      }
                      className="tabular-nums"
                      invalid={Boolean(errors[`lines.${index}.quantity`])}
                    />

                    <BareInput
                      aria-label={`Line ${index + 1} unit price`}
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) =>
                        updateLine(line.key, { unitPrice: e.target.value })
                      }
                      placeholder="0.00"
                      className="tabular-nums"
                      invalid={Boolean(errors[`lines.${index}.unitPrice`])}
                    />

                    <span
                      data-numeric
                      className="text-right text-body-sm text-ink-muted sm:tabular-nums"
                    >
                      {lineTotal === null ? "" : formatMoney(lineTotal)}
                    </span>

                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                      className={cn(
                        "pressable grid size-7 place-items-center rounded-sm text-ink-faint",
                        "transition-colors duration-160 ease-out-quint",
                        "hover:bg-action-ghost-hover hover:text-ink",
                        "disabled:pointer-events-none disabled:opacity-30",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)",
                      )}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-4 border-t border-line-subtle bg-surface-sunken/40 px-3 py-2">
            <button
              type="button"
              onClick={addLine}
              className={cn(
                "pressable -ml-0.5 inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1",
                "text-caption font-medium text-ink-muted",
                "transition-colors duration-160 ease-out-quint hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)",
              )}
            >
              <Plus aria-hidden className="size-3.5" />
              Add line
            </button>

            <div className="flex items-baseline gap-3">
              <span className="text-label uppercase text-ink-faint">Total</span>
              <span data-numeric className="text-metric text-ink">
                {formatMoney(previewTotalCents)}
              </span>
            </div>
          </div>
        </div>

        {lineErrors.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {lineErrors.map((message, i) => (
              <li key={i} role="alert" className="text-caption text-feedback-error-ink">
                {message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-caption text-ink-faint">
            The total is recalculated on the server from these lines. It is never
            taken from the browser.
          </p>
        )}
      </div>

      {/* ---- Notes ---- */}
      <div className="mt-8">
        <Field label="Notes" name="notes" optional error={errors.notes}>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this order"
            maxLength={1000}
            aria-invalid={errors.notes ? true : undefined}
          />
        </Field>
      </div>

      {formError ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-feedback-error-line bg-feedback-error-tint px-3 py-2 text-caption text-feedback-error-ink"
        >
          {formError}
        </p>
      ) : null}

      <div className="mt-8 flex items-center gap-2 border-t border-line-subtle pt-5">
        <Button type="submit" disabled={busy}>
          {busy ? "Creating" : "Create order"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * A borderless input for use inside the line grid.
 *
 * A bordered box per cell would draw 15 rectangles across five rows and fight
 * the table rules already separating them. The affordance comes from the hover
 * and focus states instead, which is enough once the header row has established
 * that these are fields.
 */
function BareInput({
  className,
  invalid,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-sm bg-transparent px-1.5 py-1",
        "text-base sm:text-body-sm text-ink placeholder:text-ink-disabled",
        "transition-colors duration-160 ease-out-quint",
        "hover:bg-surface-sunken/70",
        "focus:bg-surface-sunken focus:outline-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--focus-ring)",
        invalid && "text-feedback-error-ink",
        className,
      )}
    />
  );
}

function Field({
  label,
  name,
  error,
  optional,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="block text-label uppercase text-ink-faint"
      >
        {label}
        {optional ? (
          <span className="ml-1.5 normal-case tracking-normal text-ink-disabled">
            optional
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-caption text-feedback-error-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
