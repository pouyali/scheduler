import { defineConfig } from "vitest/config";
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    pool: { pool: "forks", singleFork: true },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
