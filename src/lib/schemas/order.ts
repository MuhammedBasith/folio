import { z } from "zod";
import { MAX_AMOUNT_CENTS, MAX_QUANTITY, formatMoney } from "@/lib/money";
import { MIN_PAYMENT_CENTS, ORDER_STATUSES } from "@/lib/domain/orders";

/**
 * Order and payment payloads.
 *
 * MONEY CROSSES THE API AS INTEGER CENTS, never as a decimal string or a float.
 * `{"amountCents": 40000}` cannot be misread; `{"amount": "400.00"}` invites
 * every consumer to write its own parser and get 0.29 wrong. Clients that take
 * typed input parse it with `parseAmountToCents` before sending, so parsing
 * happens once, in one implementation.
 */

/** Calendar date, no time component: "2026-08-15". */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    // Round-trips only for real calendar dates, so 2026-02-30 is caught here
    // rather than silently rolling over to 2 March.
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "That is not a real date.");

export const centsSchema = z
  .number()
  .int("Amounts must be a whole number of cents.")
  .min(0, "Amount cannot be negative.")
  .max(
    MAX_AMOUNT_CENTS,
    `Amount cannot exceed ${formatMoney(MAX_AMOUNT_CENTS)}.`,
  );

export const lineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Describe what this line is for.")
    .max(200, "Keep the description under 200 characters."),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(MAX_QUANTITY, `Quantity cannot exceed ${MAX_QUANTITY}.`),
  unitPriceCents: centsSchema,
});

export const createOrderSchema = z.object({
  customer: z
    .string()
    .trim()
    .min(1, "Enter the customer's name.")
    .max(120, "Keep the customer name under 120 characters."),
  dueDate: dateStringSchema,
  notes: z
    .string()
    .trim()
    .max(1000, "Keep notes under 1000 characters.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  lineItems: z
    .array(lineItemSchema)
    // At least one line, otherwise an order is a customer name with no meaning
    // and a total of zero that would immediately read as "paid".
    .min(1, "Add at least one line item.")
    .max(100, "An order cannot have more than 100 line items."),
});

/** Same shape as create: editing an order replaces its lines wholesale. */
export const updateOrderSchema = createOrderSchema;

export const recordPaymentSchema = z.object({
  amountCents: z
    .number()
    .int("Amounts must be a whole number of cents.")
    .min(
      MIN_PAYMENT_CENTS,
      `Payment must be at least ${formatMoney(MIN_PAYMENT_CENTS)}.`,
    )
    .max(
      MAX_AMOUNT_CENTS,
      `Amount cannot exceed ${formatMoney(MAX_AMOUNT_CENTS)}.`,
    ),
  paidOn: dateStringSchema,
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const orderStatusSchema = z.enum(ORDER_STATUSES);

/** Query string for the order list. `status=all` is the same as omitting it. */
export const listOrdersQuerySchema = z.object({
  status: z
    .union([orderStatusSchema, z.literal("all")])
    .optional()
    .transform((value) => (value === "all" ? undefined : value)),
});

export type LineItemInput = z.infer<typeof lineItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
