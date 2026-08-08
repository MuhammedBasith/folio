import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Two projects, because they have genuinely different costs and requirements.
 *
 * `unit` runs the pure domain and money logic with no I/O at all, so it stays
 * fast enough to run on every save.
 *
 * `integration` exercises real API route handlers against a real PostgreSQL
 * database. It is single-threaded and non-isolated on purpose: the tests share
 * one database, and running them in parallel would have them fighting over the
 * same rows. That matters most for the concurrency test, which deliberately
 * fires two payments at the same row simultaneously and needs the database, not
 * a mock, to be the thing that arbitrates.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./tests/setup-integration.ts"],
          fileParallelism: false,
          sequence: { concurrent: false },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
