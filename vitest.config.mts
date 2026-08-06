import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

// next dev/build/start all auto-load .env; vitest doesn't, since it isn't
// running through Next. Integration tests need the same DATABASE_URL the
// app itself would use, so it's loaded explicitly here rather than each
// test file (or a CI-only env var) having to supply it a second way.
export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: loadEnv(mode, import.meta.dirname, ""),
    // Integration tests share one real Postgres — vitest's default runs
    // separate test *files* in parallel worker threads, so without this a
    // stray row from one file's still-in-flight test is visible to
    // generateMatchesForPost (or any other broad query) in another file's
    // test running at the same moment, against the same database. Unit
    // tests don't touch the DB so pay nothing for this; the handful of
    // integration files are small enough that serial execution costs
    // single-digit seconds, not worth trading for a flaky suite.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "server-only": path.resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
    },
  },
}));
