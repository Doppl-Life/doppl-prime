import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/runs": { target: API_TARGET, changeOrigin: true },
      "/model-routes": { target: API_TARGET, changeOrigin: true },
      "/healthz": { target: API_TARGET, changeOrigin: true },
      "/demo": { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-utils/setup.ts"],
    coverage: { provider: "v8" },
    // Playwright e2e specs live under tests/e2e/ and run via
    // `pnpm test:e2e`. Vitest skips them.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
