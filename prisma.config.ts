import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 removed `url` from the schema's datasource block, so connection
 * details live here for CLI work (migrate, db push, seed) and reach the client
 * through a driver adapter in `src/server/db/client.ts`.
 *
 * `dotenv/config` is imported explicitly because Prisma no longer auto-loads
 * `.env`.
 *
 * Migrations use DIRECT_URL when present. A pooled connection cannot run DDL
 * reliably, so the direct endpoint is the correct target on Neon; locally the
 * two are the same string.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun prisma/seed.ts",
  },
  datasource: {
    url: env(process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL"),
  },
});
