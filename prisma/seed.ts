import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

/**
 * Demo data.
 *
 * Signing in as the demo account shows every status the product can produce
 * straight away, without anyone having to build test data by hand first. An
 * empty dashboard demonstrates nothing.
 *
 * Dates are relative to the run date rather than hardcoded, so the overdue
 * order is genuinely overdue whenever the seed happens to run and the demo
 * never rots.
 */

const DEMO_EMAIL = "demo@folio.app";
const DEMO_PASSWORD = "demo1234";

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  console.log("Seeding demo data...");

  // Idempotent: re-running replaces the demo user's data rather than
  // accumulating duplicates, so the script is safe to run against a deployed
  // database more than once.
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
    },
  });

  const orders = [
    {
      reference: "ORD-0001",
      customer: "Northwind Traders",
      dueDate: daysFromNow(-21),
      notes: "Chased twice by email. No response yet.",
      lineItems: [
        { description: 'MacBook Pro 14"', quantity: 2, unitPriceCents: 199_900 },
        { description: "AppleCare+", quantity: 2, unitPriceCents: 27_900 },
      ],
      payments: [],
    },
    {
      reference: "ORD-0002",
      customer: "Acme Corp",
      dueDate: daysFromNow(-5),
      notes: "Part payment received against the deposit invoice.",
      lineItems: [
        { description: "Dell UltraSharp 27in", quantity: 4, unitPriceCents: 54_900 },
      ],
      payments: [{ amountCents: 100_000, paidOn: daysFromNow(-12), note: "Bank transfer" }],
    },
    {
      reference: "ORD-0003",
      customer: "Stellar Studios",
      dueDate: daysFromNow(9),
      notes: null,
      lineItems: [
        { description: "Logitech MX Master 3S", quantity: 6, unitPriceCents: 9_900 },
        { description: "USB-C hub", quantity: 6, unitPriceCents: 4_950 },
      ],
      payments: [],
    },
    {
      reference: "ORD-0004",
      customer: "Brightside Media",
      dueDate: daysFromNow(16),
      notes: "Paying in monthly instalments.",
      lineItems: [
        { description: "Studio monitor", quantity: 2, unitPriceCents: 42_500 },
        { description: "Audio interface", quantity: 1, unitPriceCents: 34_900 },
        { description: "Cabling and stands", quantity: 1, unitPriceCents: 12_600 },
      ],
      payments: [
        { amountCents: 30_000, paidOn: daysFromNow(-30), note: "Instalment 1 of 4" },
        { amountCents: 30_000, paidOn: daysFromNow(-2), note: "Instalment 2 of 4" },
      ],
    },
    {
      reference: "ORD-0005",
      customer: "Harbour Logistics",
      dueDate: daysFromNow(-40),
      notes: "Settled late, after the second reminder.",
      lineItems: [
        { description: "Rugged tablet", quantity: 3, unitPriceCents: 64_900 },
      ],
      payments: [
        { amountCents: 94_700, paidOn: daysFromNow(-35), note: "First instalment" },
        { amountCents: 100_000, paidOn: daysFromNow(-11), note: "Balance cleared" },
      ],
    },
    {
      reference: "ORD-0006",
      customer: "Fern & Oak Design",
      dueDate: daysFromNow(3),
      notes: null,
      lineItems: [
        { description: "Colour calibration service", quantity: 1, unitPriceCents: 18_000 },
      ],
      payments: [{ amountCents: 18_000, paidOn: daysFromNow(-1), note: "Paid on collection" }],
    },
    {
      reference: "ORD-0007",
      customer: "Copperline Ltd",
      dueDate: daysFromNow(30),
      notes: "Three payments of 33.33 recorded; one cent still outstanding.",
      lineItems: [
        { description: "Retainer, October", quantity: 1, unitPriceCents: 10_000 },
      ],
      payments: [
        { amountCents: 3_333, paidOn: daysFromNow(-9), note: null },
        { amountCents: 3_333, paidOn: daysFromNow(-6), note: null },
        { amountCents: 3_333, paidOn: daysFromNow(-3), note: null },
      ],
    },
  ];

  for (const order of orders) {
    await prisma.order.create({
      data: {
        ownerId: user.id,
        reference: order.reference,
        customer: order.customer,
        dueDate: toDateOnly(order.dueDate),
        notes: order.notes,
        lineItems: {
          create: order.lineItems.map((line, index) => ({
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            position: index,
          })),
        },
        payments: {
          create: order.payments.map((payment) => ({
            amountCents: payment.amountCents,
            paidOn: toDateOnly(payment.paidOn),
            note: payment.note,
          })),
        },
      },
    });
  }

  console.log(`Seeded ${orders.length} orders for ${DEMO_EMAIL}`);
  console.log("");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log("Statuses represented: overdue, overdue (part paid), pending,");
  console.log("partially_paid, paid (settled late), paid, and a one-cent remainder.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
