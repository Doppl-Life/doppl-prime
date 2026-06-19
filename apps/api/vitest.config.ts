import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@doppl/api",
    include: ["src/**/*.test.ts", "__integration_tests__/**/*.int.test.ts"],
    // Integration tests boot Postgres containers; give them room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
