import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "smoke",
      include: ["tests/**/*.test.ts"],
    },
  },
  "packages/*",
]);
