import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import {
  createOrder,
  deleteOrder,
  getOrder,
  listOrders,
  updateOrder,
} from "./orders";
import { recordPayment } from "./payments";

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

function order(overrides: Partial<Parameters<typeof createOrder>[1]> = {}) {
  return {
    customer: "Acme Corp",
    dueDate: "2026-08-15",
    lineItems: [{ description: "Laptop", quantity: 2, unitPriceCents: 50_000 }],
    ...overrides,
  };
}

function expectApiError(error: unknown): ApiError {
  if (!(error instanceof ApiError)) {
    throw new Error(`Expected an ApiError, received: ${String(error)}`);
  }
  return error;
}

describe("createOrder", () => {
  it("computes the total from the lines rather than trusting a client", async () => {
    const created = await createOrder(
      ownerId,
      order({
        lineItems: [
          { description: "Laptop", quantity: 2, unitPriceCents: 50_000 },
          { description: "Dock", quantity: 3, unitPriceCents: 12_500 },
        ],
      }),
    );

    expect(created.totalCents).toBe(137_500);
    expect(created.lineItems[0].lineTotalCents).toBe(100_000);
    expect(created.lineItems[1].lineTotalCents).toBe(37_500);
  });

  it("assigns sequential per-user references", async () => {
    const first = await createOrder(ownerId, order());
    const second = await createOrder(ownerId, order());

    expect(first.reference).toBe("ORD-0001");
    expect(second.reference).toBe("ORD-0002");
  });

  it("numbers each user's orders independently", async () => {
    const mine = await createOrder(ownerId, order());
    const theirs = await createOrder(otherOwnerId, order());

    expect(mine.reference).toBe("ORD-0001");
    expect(theirs.reference).toBe("ORD-0001");
  });

  it("does not reuse a reference after a deletion", async () => {
    const first = await createOrder(ownerId, order());
    await createOrder(ownerId, order());
    await deleteOrder(ownerId, first.id);

    const third = await createOrder(ownerId, order());
    expect(third.reference).toBe("ORD-0003");
  });

  it("survives concurrent creates without duplicating a reference", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createOrder(ownerId, order())),
    );

    const references = results.map((result) => result.reference);
    expect(new Set(references).size).toBe(5);
  });

  it("preserves the order lines were entered in", async () => {
    const created = await createOrder(
      ownerId,
      order({
        lineItems: [
          { description: "First", quantity: 1, unitPriceCents: 100 },
          { description: "Second", quantity: 1, unitPriceCents: 200 },
          { description: "Third", quantity: 1, unitPriceCents: 300 },
        ],
      }),
    );

    expect(created.lineItems.map((line) => line.description)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });
});

describe("listOrders", () => {
  it("returns only the caller's orders", async () => {
    await createOrder(ownerId, order({ customer: "Mine" }));
    await createOrder(otherOwnerId, order({ customer: "Theirs" }));

    const mine = await listOrders(ownerId);

    expect(mine).toHaveLength(1);
    expect(mine[0].customer).toBe("Mine");
  });

  it("filters by derived status", async () => {
    const asOf = new Date("2026-08-10T12:00:00.000Z");

    const pending = await createOrder(ownerId, order({ customer: "Pending" }));
    const partial = await createOrder(ownerId, order({ customer: "Partial" }));
    const settled = await createOrder(ownerId, order({ customer: "Paid" }));
    await createOrder(
      ownerId,
      order({ customer: "Overdue", dueDate: "2026-08-01" }),
    );

    await recordPayment(ownerId, partial.id, {
      amountCents: 40_000,
      paidOn: "2026-08-05",
    });
    await recordPayment(ownerId, settled.id, {
      amountCents: 100_000,
      paidOn: "2026-08-05",
    });

    expect(
      (await listOrders(ownerId, { status: "pending" }, asOf)).map(
        (o) => o.customer,
      ),
    ).toEqual(["Pending"]);

    expect(
      (await listOrders(ownerId, { status: "partially_paid" }, asOf)).map(
        (o) => o.customer,
      ),
    ).toEqual(["Partial"]);

    expect(
      (await listOrders(ownerId, { status: "paid" }, asOf)).map(
        (o) => o.customer,
      ),
    ).toEqual(["Paid"]);

    expect(
      (await listOrders(ownerId, { status: "overdue" }, asOf)).map(
        (o) => o.customer,
      ),
    ).toEqual(["Overdue"]);

    expect(await listOrders(ownerId, {}, asOf)).toHaveLength(4);
    expect(pending.status).toBe("pending");
  });

  /**
   * Status is derived, never stored, so the same row reports differently as
   * time moves. This is the behaviour that a `status` column would get wrong.
   */
  it("reports the same row as overdue once its due date passes", async () => {
    await createOrder(ownerId, order({ dueDate: "2026-08-15" }));

    const before = await listOrders(
      ownerId,
      {},
      new Date("2026-08-15T23:59:59.000Z"),
    );
    expect(before[0].status).toBe("pending");

    const after = await listOrders(
      ownerId,
      {},
      new Date("2026-08-16T00:00:00.000Z"),
    );
    expect(after[0].status).toBe("overdue");
  });
});

describe("order locking", () => {
  it("allows edits before any payment exists", async () => {
    const created = await createOrder(ownerId, order());
    expect(created.editable).toBe(true);

    const updated = await updateOrder(ownerId, created.id, {
      customer: "Acme Corporation",
      dueDate: "2026-09-01",
      lineItems: [
        { description: "Laptop", quantity: 1, unitPriceCents: 50_000 },
      ],
    });

    expect(updated.customer).toBe("Acme Corporation");
    expect(updated.totalCents).toBe(50_000);
    expect(updated.lineItems).toHaveLength(1);
  });

  it("refuses edits once a payment has been recorded", async () => {
    const created = await createOrder(ownerId, order());
    await recordPayment(ownerId, created.id, {
      amountCents: 10_000,
      paidOn: "2026-08-10",
    });

    const error = await updateOrder(ownerId, created.id, {
      customer: "Renamed",
      dueDate: "2026-09-01",
      lineItems: [{ description: "Cheaper", quantity: 1, unitPriceCents: 100 }],
    }).catch((thrown) => expectApiError(thrown));

    expect(error.code).toBe("ORDER_LOCKED");
    expect(error.status).toBe(409);

    // The attempted edit changed nothing.
    const reloaded = await getOrder(ownerId, created.id);
    expect(reloaded.customer).toBe("Acme Corp");
    expect(reloaded.totalCents).toBe(100_000);
    expect(reloaded.editable).toBe(false);
  });

  it("refuses deletion once a payment has been recorded", async () => {
    const created = await createOrder(ownerId, order());
    await recordPayment(ownerId, created.id, {
      amountCents: 10_000,
      paidOn: "2026-08-10",
    });

    const error = await deleteOrder(ownerId, created.id).catch((thrown) =>
      expectApiError(thrown),
    );

    expect(error.code).toBe("ORDER_LOCKED");
    await expect(getOrder(ownerId, created.id)).resolves.toBeDefined();
  });

  it("deletes an unpaid order along with its lines", async () => {
    const created = await createOrder(ownerId, order());
    await deleteOrder(ownerId, created.id);

    await expect(getOrder(ownerId, created.id)).rejects.toThrow(ApiError);
    expect(
      await prisma.lineItem.count({ where: { orderId: created.id } }),
    ).toBe(0);
  });
});

describe("tenant isolation on writes", () => {
  it("refuses to update another user's order", async () => {
    const created = await createOrder(ownerId, order());

    const error = await updateOrder(otherOwnerId, created.id, {
      customer: "Hijacked",
      dueDate: "2026-09-01",
      lineItems: [{ description: "x", quantity: 1, unitPriceCents: 1 }],
    }).catch((thrown) => expectApiError(thrown));

    expect(error.status).toBe(404);

    const reloaded = await getOrder(ownerId, created.id);
    expect(reloaded.customer).toBe("Acme Corp");
  });

  it("refuses to delete another user's order", async () => {
    const created = await createOrder(ownerId, order());

    const error = await deleteOrder(otherOwnerId, created.id).catch((thrown) =>
      expectApiError(thrown),
    );

    expect(error.status).toBe(404);
    await expect(getOrder(ownerId, created.id)).resolves.toBeDefined();
  });
});
