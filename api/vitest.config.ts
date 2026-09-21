import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-at-least-8-chars",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/portask_test",
    },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});