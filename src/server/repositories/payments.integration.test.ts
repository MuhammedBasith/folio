import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { createOrder, getOrder } from "./orders";
import { recordPayment } from "./payments";

/**
 * Payment integration tests.
 *
 * These run against real PostgreSQL because the invariant under test is
 * enforced by the database, not by application code. A mock would let every one
 * of these pass while the real system loses money.
 */

let ownerId: string;
let otherOwnerId: string;

beforeEach(async () => {
  const [owner, other] = await Promise.all([
    prisma.user.create({
      data: { email: "owner@example.com", passwordHash: "x" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: "other@example.com", passwordHash: "x" },
      select: { id: true },
    }),
  ]);

  ownerId = owner.id;
  otherOwnerId = other.id;
});

/** A $1,000 order: 2 x $500. */
async function createThousandDollarOrder(userId = ownerId) {
  return createOrder(userId, {
    customer: "Acme Corp",
    dueDate: "2026-08-15",
    lineItems: [
      { description: "Laptop", quantity: 2, unitPriceCents: 50_000 },
    ],
  });
}

/**
 * Asserts a promise rejects with an ApiError, and returns it narrowed.
 *
 * Written as a wrapper rather than `.catch(assert)` because catching widens the
 * result type to `T | ApiError`, and more importantly a `.catch` would let a
 * call that unexpectedly RESOLVED slip through as a pass.
 */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw new Error(`Expected an ApiError, received: ${String(error)}`);
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

describe("the full payment lifecycle, over the real database", () => {
  it("runs 400 then 600 then rejects a further 1", async () => {
    const order = await createThousandDollarOrder();
    expect(order.totalCents).toBe(100_000);
    expect(order.status).toBe("pending");

    const first = await recordPayment(ownerId, order.id, {
      amountCents: 40_000,
      paidOn: "2026-08-10",
    });
    expect(first.order.status).toBe("partially_paid");
    expect(first.order.dueCents).toBe(60_000);

    const second = await recordPayment(ownerId, order.id, {
      amountCents: 60_000,
      paidOn: "2026-08-12",
    });
    expect(second.order.status).toBe("paid");
    expect(second.order.dueCents).toBe(0);

    await expect(
      recordPayment(ownerId, order.id, {
        amountCents: 100,
        paidOn: "2026-08-13",
      }),
    ).rejects.toThrow(ApiError);

    // And nothing was written by the rejected attempt.
    const reloaded = await getOrder(ownerId, order.id);
    expect(reloaded.payments).toHaveLength(2);
    expect(reloaded.paidCents).toBe(100_000);
  });
});

describe("over-payment rejection", () => {
  it("rejects one cent over the balance and names the maximum", async () => {
    const order = await createThousandDollarOrder();

    const error = await expectApiError(
      recordPayment(ownerId, order.id, {
        amountCents: 100_001,
        paidOn: "2026-08-10",
      }),
    );

    expect(error.code).toBe("PAYMENT_EXCEEDS_BALANCE");
    expect(error.status).toBe(422);
    expect(error.message).toContain("$1,000.00");
    expect(error.details?.maxAllowedCents).toBe(100_000);

    const reloaded = await getOrder(ownerId, order.id);
    expect(reloaded.payments).toHaveLength(0);
  });

  it("accepts a payment that exactly settles the balance", async () => {
    const order = await createThousandDollarOrder();

    const result = await recordPayment(ownerId, order.id, {
      amountCents: 100_000,
      paidOn: "2026-08-10",
    });

    expect(result.order.status).toBe("paid");
    expect(result.order.dueCents).toBe(0);
  });
});

describe("concurrency", () => {
  /**
   * THE TEST THIS WHOLE DESIGN EXISTS FOR.
   *
   * Two payments that each exactly settle the order are fired simultaneously.
   * Without the row lock both read "$1,000 due", both pass validation, and both
   * insert, collecting $2,000 against a $1,000 order. With the lock, the second
   * blocks until the first commits, then re-reads, sees zero due, and is
   * rejected.
   *
   * Note what is asserted: not just that one failed, but that the database
   * holds exactly one payment afterwards. A test that only checked the
   * rejection could pass while a duplicate row was quietly written.
   */
  it("rejects the loser when two full payments race", async () => {
    const order = await createThousandDollarOrder();

    const results = await Promise.allSettled([
      recordPayment(ownerId, order.id, {
        amountCents: 100_000,
        paidOn: "2026-08-10",
      }),
      recordPayment(ownerId, order.id, {
        amountCents: 100_000,
        paidOn: "2026-08-10",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reloaded = await getOrder(ownerId, order.id);
    expect(reloaded.payments).toHaveLength(1);
    expect(reloaded.paidCents).toBe(100_000);
    expect(reloaded.status).toBe("paid");
  });

  it("never lets ten concurrent payments exceed the order total", async () => {
    const order = await createThousandDollarOrder();

    // Ten payments of $200 against a $1,000 order: at most five can succeed.
    const attempts = Array.from({ length: 10 }, () =>
      recordPayment(ownerId, order.id, {
        amountCents: 20_000,
        paidOn: "2026-08-10",
      }),
    );

    const results = await Promise.allSettled(attempts);
    const accepted = results.filter((r) => r.status === "fulfilled").length;

    expect(accepted).toBe(5);

    const reloaded = await getOrder(ownerId, order.id);
    expect(reloaded.paidCents).toBe(100_000);
    expect(reloaded.paidCents).toBeLessThanOrEqual(reloaded.totalCents);
    expect(reloaded.payments).toHaveLength(5);
    expect(reloaded.status).toBe("paid");
  });

  it("keeps partial concurrent payments consistent", async () => {
    const order = await createThousandDollarOrder();

    const results = await Promise.allSettled([
      recordPayment(ownerId, order.id, {
        amountCents: 60_000,
        paidOn: "2026-08-10",
      }),
      recordPayment(ownerId, order.id, {
        amountCents: 60_000,
        paidOn: "2026-08-10",
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const reloaded = await getOrder(ownerId, order.id);
    expect(reloaded.paidCents).toBe(60_000);
    expect(reloaded.dueCents).toBe(40_000);
    expect(reloaded.status).toBe("partially_paid");
  });
});

describe("tenant isolation", () => {
  it("refuses to record a payment against another user's order", async () => {
    const order = await createThousandDollarOrder(ownerId);

    const error = await expectApiError(
      recordPayment(otherOwnerId, order.id, {
        amountCents: 10_000,
        paidOn: "2026-08-10",
      }),
    );

    expect(error.code).toBe("NOT_FOUND");
    expect(error.status).toBe(404);

    const reloaded = await getOrder(ownerId, order.id);
    expect(reloaded.payments).toHaveLength(0);
  });

  it("reports another user's order as not found rather than forbidden", async () => {
    const order = await createThousandDollarOrder(ownerId);

    const error = await expectApiError(getOrder(otherOwnerId, order.id));

    // 404 not 403: a 403 would confirm the order exists.
    expect(error.status).toBe(404);
  });
});

describe("fractional amounts", () => {
  /**
   * The float bug, end to end through the database.
   *
   * Three payments of $33.33 against a $100 order leave one cent outstanding.
   * A float implementation sums these to 99.99000000000001, which is neither
   * equal to nor less than 100 in a way anyone can reason about, and the order
   * either never settles or settles a cent early.
   */
  it("leaves exactly one cent due after three payments of 33.33", async () => {
    const order = await createOrder(ownerId, {
      customer: "Precision Ltd",
      dueDate: "2026-08-15",
      lineItems: [
        { description: "Consulting", quantity: 1, unitPriceCents: 10_000 },
      ],
    });

    for (let i = 0; i < 3; i += 1) {
      await recordPayment(ownerId, order.id, {
        amountCents: 3333,
        paidOn: "2026-08-10",
      });
    }

    const reloaded = await getOrder(ownerId, order.id);
    expect(reloaded.paidCents).toBe(9999);
    expect(reloaded.dueCents).toBe(1);
    expect(reloaded.status).toBe("partially_paid");

    // And the final cent settles it exactly.
    await recordPayment(ownerId, order.id, {
      amountCents: 1,
      paidOn: "2026-08-11",
    });

    const settled = await getOrder(ownerId, order.id);
    expect(settled.dueCents).toBe(0);
    expect(settled.status).toBe("paid");
  });
});
