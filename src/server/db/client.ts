import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client singleton.
 *
 * Two things this guards against:
 *
 * 1. Development hot reload. Next.js re-evaluates modules on every edit, and a
 *    fresh PrismaClient per reload exhausts the connection pool within a few
 *    minutes. Caching on `globalThis` survives module reevaluation.
 *
 * 2. Serverless connection storms. Each warm Lambda keeps its pool; a pooled
 *    connection string (PgBouncer on Neon) is what keeps that sustainable, which
 *    is why DATABASE_URL is the pooled endpoint and DIRECT_URL is reserved for
 *    migrations.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    // Queries are noisy in dev and useless in prod; warnings and errors matter
    // in both.
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
