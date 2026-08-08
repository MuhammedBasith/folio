import { appendFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { createOrder, deleteOrder } from "./orders";
import { recordPayment } from "./payments";

const OUT =
  "/private/tmp/claude-501/-Users-basith-Developer-assessments-crossval/7cb6db69-568f-4b49-bb6f-372085502e1b/scratchpad/probe2.txt";

function log(tag: string, data: unknown): void {
  appendFileSync(OUT, `${tag} ${JSON.stringify(data, null, 2)}\n`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let ownerId: string;

beforeEach(async () => {
  const owner = await prisma.user.create({
    data: { email: "probe@example.com", passwordHash: "x" },
    select: { id: true },
  });
  ownerId = owner.id;
});

describe("PROBE delete vs payment, staggered", () => {
  it("sweeps stagger delays looking for a cascaded-away committed payment", async () => {
    const tally: Record<string, number> = {};
    let firstLoss: unknown = null;

    for (let i = 0; i < 120; i += 1) {
      const delayMs = (i % 6) * 0.5;

      const order = await createOrder(ownerId, {
        customer: "Acme Corp",
        dueDate: "2026-08-15",
        lineItems: [
          { description: "Laptop", quantity: 2, unitPriceCents: 50_000 },
        ],
      });

      const paymentPromise = recordPayment(ownerId, order.id, {
        amountCents: 100_000,
        paidOn: "2026-08-10",
      });

      const deletePromise = sleep(delayMs).then(() =>
        deleteOrder(ownerId, order.id),
      );

      const [p, d] = await Promise.allSettled([paymentPromise, deletePromise]);

      const ordersLeft = await prisma.order.count({ where: { id: order.id } });
      const paymentsLeft = await prisma.payment.count({
        where: { orderId: order.id },
      });

      // The dangerous outcome: the API told the caller the payment was
      // recorded (201), yet no payment row survives.
      const key =
        p.status === "fulfilled" && d.status === "fulfilled"
          ? `BOTH_SUCCEEDED orders=${ordersLeft} payments=${paymentsLeft}`
          : p.status === "fulfilled"
            ? `payment-ok delete-failed payments=${paymentsLeft}`
            : d.status === "fulfilled"
              ? `payment-failed delete-ok payments=${paymentsLeft}`
              : "both-failed";

      tally[key] = (tally[key] ?? 0) + 1;

      if (
        firstLoss === null &&
        p.status === "fulfilled" &&
        d.status === "fulfilled"
      ) {
        firstLoss = {
          delayMs,
          returnedPaymentId: p.value.payment.id,
          returnedAmountCents: p.value.payment.amountCents,
          returnedOrderStatus: p.value.order.status,
          ordersLeftInDb: ordersLeft,
          paymentsLeftInDb: paymentsLeft,
        };
      }

      await prisma.order.deleteMany({ where: { ownerId } });
    }

    log("PROBE-DELETE-SWEEP", { tally, firstLoss });

    expect(true).toBe(true);
  });
});
