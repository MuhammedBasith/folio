import { config } from "dotenv";
import { beforeEach } from "vitest";

/**
 * Integration test harness.
 *
 * Runs against a REAL PostgreSQL database, not a mock. That is not gold
 * plating: the single most important behaviour in this application is that two
 * simultaneous payments cannot both be accepted, and that behaviour is provided
 * by `SELECT ... FOR UPDATE`. A mocked client would happily let both through and
 * the test would prove nothing.
 *
 * Environment is loaded before anything imports the Prisma client, because the
 * client reads DATABASE_URL when it is first constructed. `override: true`
 * matters: `.env` may already be in the process environment and would otherwise
 * win, pointing tests at the development database.
 */
config({ path: ".env.test", override: true, quiet: true });

if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(
    `Refusing to run integration tests: DATABASE_URL does not look like a test database (${process.env.DATABASE_URL}). These tests truncate every table.`,
  );
}

/**
 * Truncated before each test rather than after, so a failed run leaves its data
 * behind to inspect. CASCADE handles the foreign keys; RESTART IDENTITY keeps
 * any sequence deterministic across runs.
 */
beforeEach(async () => {
  const { prisma } = await import("@/server/db/client");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "payments", "line_items", "orders", "users" RESTART IDENTITY CASCADE`,
  );
});
