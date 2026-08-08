import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import {
  createOrder,
  deleteOrder,
  getOrder,
  updateOrder,
} from "./orders";
import { recordPayment } from "./payments";

/**
 * Write-path locking.
 *
 * These cover a real defect found by adversarial review AFTER the payment lock
 * was already in place and tested. The payment path locked correctly; the edit
 * and delete paths checked `_count.payments` with a plain unlocked SELECT and
 * only touched the order row afterwards.
 *
 * The result was reproducible 40 times out of 40: an order's total could be cut
 * below the money already collected, and the order was then frozen so it could
 * not be corrected through the product, while reporting itself as `paid`
 * because `dueCents` clamps at zero.
 *
 * The lesson worth keeping: "we take a row lock" is not a property of a
 * codebase, it is a property of each individual write path.
 */

let ownerId: string;

beforeEach(async () => {
  const owner = await prisma.user.create({
    data: { email: "owner@example.com", passwordHash: "x" },
    select: { id: true },
  });
  ownerId = owner.id;
});

function thousandDollarOrder() {
  return createOrder(ownerId, {
    customer: "Acme Corp",
    dueDate: "2026-12-31",
    lineItems: [{ description: "Laptop", quantity: 2, unitPriceCents: 50_000 }],
  });
}

describe("update racing a payment", () => {
  /**
   * The exact reproduction from the review: replace the lines with a $1 item at
   * the same moment a $1,000 payment lands.
   *
   * Whichever wins, the invariant must hold afterwards: an order's total can
   * never be below what has been collected against it.
   */
  it("never lets an edit cut the total below money already collected", async () => {
    for (let run = 0; run < 8; run += 1) {
      const order = await thousandDollarOrder();

      await Promise.allSettled([
        updateOrder(ownerId, order.id, {
          customer: "Acme Corp",
          dueDate: "2026-12-31",
          lineItems: [
            { description: "Downgraded", quantity: 1, unitPriceCents: 100 },
          ],
        }),
        recordPayment(ownerId, order.id, {
          amountCents: 100_000,
          paidOn: "2026-08-10",
        }),
      ]);

      const reloaded = await getOrder(ownerId, order.id);

      expect(
        reloaded.paidCents,
        `run ${run}: collected ${reloaded.paidCents} against a total of ${reloaded.totalCents}`,
      ).toBeLessThanOrEqual(reloaded.totalCents);
    }
  });

  it("rejects an edit once the racing payment has landed", async () => {
    const order = await thousandDollarOrder();

    await recordPayment(ownerId, order.id, {
      amountCents: 10_000,
      paidOn: "2026-08-10",
    });

    await expect(
      updateOrder(ownerId, order.id, {
        customer: "Acme Corp",
        dueDate: "2026-12-31",
        lineItems: [{ description: "Cheaper", quantity: 1, unitPriceCents: 1 }],
      }),
    ).rejects.toThrow(ApiError);
  });
});

describe("delete racing a payment", () => {
  /**
   * Worse than the edit case, because `Payment.orderId` cascades: a payment
   * that committed between an unlocked check and the DELETE was erased, having
   * already been acknowledged to its caller with a 201.
   */
  it("never destroys a payment that was accepted", async () => {
    for (let run = 0; run < 8; run += 1) {
      const order = await thousandDollarOrder();

      const [deleted, paid] = await Promise.allSettled([
        deleteOrder(ownerId, order.id),
        recordPayment(ownerId, order.id, {
          amountCents: 40_000,
          paidOn: "2026-08-10",
        }),
      ]);

      // If the payment was accepted, its record must still exist.
      if (paid.status === "fulfilled") {
        const surviving = await prisma.payment.count({
          where: { orderId: order.id },
        });
        expect(
          surviving,
          `run ${run}: payment was accepted then erased by the delete`,
        ).toBe(1);
        expect(deleted.status).toBe("rejected");
      } else {
        // Otherwise the delete won and there is nothing left to protect.
        const remaining = await prisma.order.count({
          where: { id: order.id },
        });
        expect(remaining).toBe(0);
      }
    }
  });

  it("refuses to delete an order that already has a payment", async () => {
    const order = await thousandDollarOrder();
    await recordPayment(ownerId, order.id, {
      amountCents: 100,
      paidOn: "2026-08-10",
    });

    await expect(deleteOrder(ownerId, order.id)).rejects.toThrow(ApiError);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });
});

describe("reference numbering beyond four digits", () => {
  /**
   * `ORDER BY reference DESC` on text puts "ORD-9999" above "ORD-10000", so the
   * highest reference stops being found the moment a user passes four digits
   * and every subsequent create collides. The account could never create an
   * order again.
   */
  it("continues past ORD-9999 instead of deadlocking the account", async () => {
    await prisma.order.create({
      data: {
        ownerId,
        reference: "ORD-9999",
        customer: "Historic",
        dueDate: new Date("2026-01-01T00:00:00.000Z"),
        lineItems: {
          create: [
            {
              description: "x",
              quantity: 1,
              unitPriceCents: 100,
              position: 0,
            },
          ],
        },
      },
    });

    const next = await thousandDollarOrder();
    expect(next.reference).toBe("ORD-10000");

    const after = await thousandDollarOrder();
    expect(after.reference).toBe("ORD-10001");
  });

  it("keeps sorting numerically once five digits exist", async () => {
    for (const reference of ["ORD-0001", "ORD-9999", "ORD-10000"]) {
      await prisma.order.create({
        data: {
          ownerId,
          reference,
          customer: "Historic",
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          lineItems: {
            create: [
              {
                description: "x",
                quantity: 1,
                unitPriceCents: 100,
                position: 0,
              },
            ],
          },
        },
      });
    }

    const next = await thousandDollarOrder();
    expect(next.reference).toBe("ORD-10001");
  });
});
