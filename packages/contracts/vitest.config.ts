import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@doppl/contracts",
    include: ["src/**/*.test.ts"],
  },
});
