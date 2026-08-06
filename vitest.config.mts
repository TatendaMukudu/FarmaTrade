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
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "server-only": path.resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
    },
  },
}));
