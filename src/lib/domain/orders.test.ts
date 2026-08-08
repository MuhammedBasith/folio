import { describe, expect, it } from "vitest";
import {
  MIN_PAYMENT_CENTS,
  calculateAmountPaidCents,
  calculateLineTotalCents,
  calculateOrderTotalCents,
  calculateOrderTotals,
  deriveOrderStatus,
  isOrderEditable,
  isOrderStatus,
  summariseOrder,
  toUtcDateKey,
  validatePayment,
} from "./orders";

/** SQL DATE values arrive from Prisma as midnight UTC. Mirror that here. */
function date(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function at(iso: string): Date {
  return new Date(iso);
}

describe("calculateLineTotalCents", () => {
  it("multiplies quantity by unit price", () => {
    expect(calculateLineTotalCents({ quantity: 2, unitPriceCents: 50_000 })).toBe(
      100_000,
    );
    expect(calculateLineTotalCents({ quantity: 1, unitPriceCents: 1 })).toBe(1);
  });

  it("allows a zero unit price", () => {
    expect(calculateLineTotalCents({ quantity: 3, unitPriceCents: 0 })).toBe(0);
  });

  it("rejects a quantity below one", () => {
    expect(() =>
      calculateLineTotalCents({ quantity: 0, unitPriceCents: 100 }),
    ).toThrow(RangeError);
    expect(() =>
      calculateLineTotalCents({ quantity: -1, unitPriceCents: 100 }),
    ).toThrow(RangeError);
  });

  it("rejects a fractional quantity", () => {
    expect(() =>
      calculateLineTotalCents({ quantity: 1.5, unitPriceCents: 100 }),
    ).toThrow(RangeError);
  });

  it("rejects a negative unit price", () => {
    expect(() =>
      calculateLineTotalCents({ quantity: 1, unitPriceCents: -1 }),
    ).toThrow(RangeError);
  });

  it("rejects an absurd quantity rather than overflowing", () => {
    expect(() =>
      calculateLineTotalCents({ quantity: 1_000_000, unitPriceCents: 100 }),
    ).toThrow(RangeError);
  });
});

describe("calculateOrderTotalCents", () => {
  it("sums every line", () => {
    expect(
      calculateOrderTotalCents([
        { quantity: 2, unitPriceCents: 50_000 },
        { quantity: 1, unitPriceCents: 25_000 },
      ]),
    ).toBe(125_000);
  });

  it("returns zero for an order with no lines", () => {
    expect(calculateOrderTotalCents([])).toBe(0);
  });
});

describe("calculateOrderTotals", () => {
  it("derives amount due from total minus paid", () => {
    const totals = calculateOrderTotals(
      [{ quantity: 2, unitPriceCents: 50_000 }],
      [{ amountCents: 40_000 }],
    );

    expect(totals).toEqual({
      totalCents: 100_000,
      paidCents: 40_000,
      dueCents: 60_000,
    });
  });

  it("clamps amount due at zero rather than reporting a negative balance", () => {
    // Only reachable from corrupted data, since the API rejects over-payment.
    const totals = calculateOrderTotals(
      [{ quantity: 1, unitPriceCents: 10_000 }],
      [{ amountCents: 15_000 }],
    );

    expect(totals.dueCents).toBe(0);
  });

  it("keeps repeated fractional payments exact", () => {
    const totals = calculateOrderTotals(
      [{ quantity: 1, unitPriceCents: 10_000 }],
      [{ amountCents: 3333 }, { amountCents: 3333 }, { amountCents: 3333 }],
    );

    expect(totals.paidCents).toBe(9999);
    expect(totals.dueCents).toBe(1);
  });
});

describe("calculateAmountPaidCents", () => {
  it("returns zero when nothing has been paid", () => {
    expect(calculateAmountPaidCents([])).toBe(0);
  });
});

describe("deriveOrderStatus", () => {
  const dueDate = date("2026-08-15");

  it("is pending when nothing has been paid and the date has not passed", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 0,
        dueDate,
        asOf: at("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("pending");
  });

  it("is partially_paid when some but not all has been paid", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 40_000,
        dueDate,
        asOf: at("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("partially_paid");
  });

  it("is paid when the balance is fully covered", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 100_000,
        dueDate,
        asOf: at("2026-08-10T12:00:00.000Z"),
      }),
    ).toBe("paid");
  });

  it("is overdue when unpaid past the due date", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 0,
        dueDate,
        asOf: at("2026-08-16T00:00:00.000Z"),
      }),
    ).toBe("overdue");
  });

  /* ---- precedence, the part the brief asks to be documented ---- */

  it("prefers overdue over partially_paid when both are true", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 40_000,
        dueDate,
        asOf: at("2026-08-20T12:00:00.000Z"),
      }),
    ).toBe("overdue");
  });

  it("prefers paid over overdue: settled late is settled, not late", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 100_000,
        dueDate,
        asOf: at("2026-09-30T12:00:00.000Z"),
      }),
    ).toBe("paid");
  });

  it("treats over-payment as paid rather than falling through", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 120_000,
        dueDate,
        asOf: at("2026-09-30T12:00:00.000Z"),
      }),
    ).toBe("paid");
  });

  it("treats a zero-total order as paid, since nothing is owed", () => {
    expect(
      deriveOrderStatus({
        totalCents: 0,
        paidCents: 0,
        dueDate,
        asOf: at("2026-12-31T12:00:00.000Z"),
      }),
    ).toBe("paid");
  });

  /* ---- date boundary, where a naive implementation breaks ---- */

  /**
   * This is the test that kills `asOf > dueDate`.
   *
   * A SQL DATE arrives as midnight UTC. Comparing raw Date objects makes an
   * order due today go overdue at 00:00 on its own due date, which is a full
   * day early. Only a calendar-day comparison gets this right.
   */
  it("is not overdue during the due date itself", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 0,
        dueDate,
        asOf: at("2026-08-15T10:00:00.000Z"),
      }),
    ).toBe("pending");
  });

  it("is not overdue at the last second of the due date", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 0,
        dueDate,
        asOf: at("2026-08-15T23:59:59.999Z"),
      }),
    ).toBe("pending");
  });

  it("becomes overdue at the first instant of the following day", () => {
    expect(
      deriveOrderStatus({
        totalCents: 100_000,
        paidCents: 0,
        dueDate,
        asOf: at("2026-08-16T00:00:00.000Z"),
      }),
    ).toBe("overdue");
  });
});

describe("toUtcDateKey", () => {
  it("reduces a timestamp to its UTC calendar day", () => {
    expect(toUtcDateKey(at("2026-08-15T23:59:59.999Z"))).toBe("2026-08-15");
    expect(toUtcDateKey(at("2026-08-16T00:00:00.000Z"))).toBe("2026-08-16");
  });
});

describe("summariseOrder", () => {
  it("returns totals and status together", () => {
    expect(
      summariseOrder(
        [{ quantity: 2, unitPriceCents: 50_000 }],
        [{ amountCents: 40_000 }],
        date("2026-08-15"),
        at("2026-08-10T00:00:00.000Z"),
      ),
    ).toEqual({
      totalCents: 100_000,
      paidCents: 40_000,
      dueCents: 60_000,
      status: "partially_paid",
    });
  });
});

describe("validatePayment", () => {
  it("accepts a payment below the remaining balance", () => {
    expect(
      validatePayment({
        amountCents: 40_000,
        totalCents: 100_000,
        alreadyPaidCents: 0,
      }),
    ).toEqual({ ok: true });
  });

  it("accepts a payment that exactly settles the balance", () => {
    expect(
      validatePayment({
        amountCents: 60_000,
        totalCents: 100_000,
        alreadyPaidCents: 40_000,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects one cent over the remaining balance", () => {
    const result = validatePayment({
      amountCents: 60_001,
      totalCents: 100_000,
      alreadyPaidCents: 40_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("PAYMENT_EXCEEDS_BALANCE");
    expect(result.maxAllowedCents).toBe(60_000);
    // The brief asks for the maximum allowed to appear in the message itself.
    expect(result.message).toContain("$600.00");
  });

  it("rejects any payment against an already settled order", () => {
    const result = validatePayment({
      amountCents: 100,
      totalCents: 100_000,
      alreadyPaidCents: 100_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("ORDER_ALREADY_SETTLED");
    expect(result.maxAllowedCents).toBe(0);
  });

  it("rejects zero and negative amounts", () => {
    for (const amountCents of [0, -1, -100]) {
      const result = validatePayment({
        amountCents,
        totalCents: 100_000,
        alreadyPaidCents: 0,
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.code).toBe("PAYMENT_BELOW_MINIMUM");
    }
  });

  it("accepts the smallest possible payment", () => {
    expect(
      validatePayment({
        amountCents: MIN_PAYMENT_CENTS,
        totalCents: 100_000,
        alreadyPaidCents: 0,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a fractional cent amount", () => {
    const result = validatePayment({
      amountCents: 10.5,
      totalCents: 100_000,
      alreadyPaidCents: 0,
    });
    expect(result.ok).toBe(false);
  });
});

describe("isOrderEditable", () => {
  it("is editable before the first payment", () => {
    expect(isOrderEditable(0)).toBe(true);
  });

  it("is frozen once any payment exists", () => {
    expect(isOrderEditable(1)).toBe(false);
    expect(isOrderEditable(9)).toBe(false);
  });
});

describe("isOrderStatus", () => {
  it("accepts the four known statuses", () => {
    for (const status of ["pending", "partially_paid", "paid", "overdue"]) {
      expect(isOrderStatus(status)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isOrderStatus("PAID")).toBe(false);
    expect(isOrderStatus("cancelled")).toBe(false);
    expect(isOrderStatus(null)).toBe(false);
    expect(isOrderStatus(1)).toBe(false);
  });
});

/**
 * The brief's own worked example, end to end through the domain layer.
 * If this passes, the core of the assignment is correct.
 */
describe("the brief's sample scenario", () => {
  const lineItems = [{ quantity: 2, unitPriceCents: 50_000 }];
  const dueDate = date("2026-08-15");
  const asOf = at("2026-08-10T12:00:00.000Z");

  it("step 1: a 2 x $500 order totals $1,000 and is pending", () => {
    const summary = summariseOrder(lineItems, [], dueDate, asOf);
    expect(summary.totalCents).toBe(100_000);
    expect(summary.dueCents).toBe(100_000);
    expect(summary.status).toBe("pending");
  });

  it("step 2: a $400 payment leaves $600 due and partially_paid", () => {
    const payments = [{ amountCents: 40_000 }];
    const summary = summariseOrder(lineItems, payments, dueDate, asOf);
    expect(summary.paidCents).toBe(40_000);
    expect(summary.dueCents).toBe(60_000);
    expect(summary.status).toBe("partially_paid");
  });

  it("step 3: a further $600 leaves $0 due and paid", () => {
    const payments = [{ amountCents: 40_000 }, { amountCents: 60_000 }];
    const summary = summariseOrder(lineItems, payments, dueDate, asOf);
    expect(summary.paidCents).toBe(100_000);
    expect(summary.dueCents).toBe(0);
    expect(summary.status).toBe("paid");
  });

  it("step 4: a further $1 is rejected with the maximum stated", () => {
    const result = validatePayment({
      amountCents: 100,
      totalCents: 100_000,
      alreadyPaidCents: 100_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("ORDER_ALREADY_SETTLED");
    expect(result.message).toMatch(/already fully paid/i);
  });
});
