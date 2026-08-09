import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOrderSchema, recordPaymentSchema } from "@/lib/schemas/order";
import { MAX_AMOUNT_CENTS } from "@/lib/money";

/**
 * The MCP write tools must enforce exactly what the REST API enforces.
 *
 * WHY THIS FILE EXISTS. The MCP tools advertise their arguments with a schema
 * assembled field by field out of `createOrderSchema.shape.*`, so that each
 * field can carry a description a model can read. That assembly silently drops
 * anything the canonical schema asserts about the OBJECT rather than about one
 * field, and `createOrderSchema` has exactly one such rule: the cap on the
 * aggregate order total.
 *
 * Dropping it was not a theoretical problem. Sending 100 lines of 100,000 units
 * at $9,999,999.99 through the tool produced a total past
 * `Number.MAX_SAFE_INTEGER`, the row committed, and from that moment every read
 * of the account threw: the order list, the ageing report and the dashboard all
 * returned 500 and there was no way back through the product. The tool now
 * parses its input with the canonical schema before writing anything.
 *
 * These tests assert the property that made the bug possible, so that if a
 * future edit rebuilds a tool schema by hand again, something fails here rather
 * than in somebody's ledger.
 */

describe("createOrderSchema", () => {
  function order(lineItems: Array<{ quantity: number; unitPriceCents: number }>) {
    return {
      customer: "Acme Corp",
      dueDate: "2027-01-01",
      lineItems: lineItems.map((line, index) => ({
        description: `Line ${index}`,
        ...line,
      })),
    };
  }

  it("rejects an aggregate total that overflows safe integers", () => {
    /**
     * The exact payload that broke a test account. Every individual field is
     * inside its own limit; only their product is not.
     */
    const overflowing = order(
      Array.from({ length: 100 }, () => ({
        quantity: 100_000,
        unitPriceCents: MAX_AMOUNT_CENTS,
      })),
    );

    const result = createOrderSchema.safeParse(overflowing);

    expect(result.success).toBe(false);
  });

  it("rejects an aggregate over the cap even when every line is legal", () => {
    const justOver = order([
      { quantity: 1, unitPriceCents: MAX_AMOUNT_CENTS },
      { quantity: 1, unitPriceCents: 1 },
    ]);

    expect(createOrderSchema.safeParse(justOver).success).toBe(false);
  });

  it("accepts an order sitting exactly on the cap", () => {
    const exactly = order([{ quantity: 1, unitPriceCents: MAX_AMOUNT_CENTS }]);

    expect(createOrderSchema.safeParse(exactly).success).toBe(true);
  });

  it("carries a rule that field-wise reconstruction would lose", () => {
    /**
     * The guard against the original mistake. If somebody rebuilds the tool
     * schema from `.shape` again, this documents in one assertion why that is
     * not equivalent: the reconstructed object accepts a payload the canonical
     * schema refuses.
     */
    const reconstructed = z.object({
      customer: createOrderSchema.shape.customer,
      dueDate: createOrderSchema.shape.dueDate,
      lineItems: createOrderSchema.shape.lineItems,
      notes: createOrderSchema.shape.notes,
    });

    const overflowing = order(
      Array.from({ length: 100 }, () => ({
        quantity: 100_000,
        unitPriceCents: MAX_AMOUNT_CENTS,
      })),
    );

    expect(reconstructed.safeParse(overflowing).success).toBe(true);
    expect(createOrderSchema.safeParse(overflowing).success).toBe(false);
  });
});

describe("recordPaymentSchema", () => {
  it("requires a date, which the tool supplies when the caller omits it", () => {
    expect(
      recordPaymentSchema.safeParse({ amountCents: 100 }).success,
    ).toBe(false);

    expect(
      recordPaymentSchema.safeParse({ amountCents: 100, paidOn: "2026-08-09" })
        .success,
    ).toBe(true);
  });

  it("rejects a zero or negative payment", () => {
    expect(
      recordPaymentSchema.safeParse({ amountCents: 0, paidOn: "2026-08-09" })
        .success,
    ).toBe(false);

    expect(
      recordPaymentSchema.safeParse({ amountCents: -1, paidOn: "2026-08-09" })
        .success,
    ).toBe(false);
  });

  it("rejects a fractional number of cents", () => {
    expect(
      recordPaymentSchema.safeParse({ amountCents: 10.5, paidOn: "2026-08-09" })
        .success,
    ).toBe(false);
  });
});
