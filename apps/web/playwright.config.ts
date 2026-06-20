import { defineConfig } from "@playwright/test";

/**
 * Playwright e2e config (P7.15). Gated behind DOPPL_E2E=1; the
 * smoke is the single must-pass UI gate and runs against a local
 * Vite dev server + a running @doppl/api Hono server.
 *
 * The smoke does NOT auto-boot the API server (that requires a
 * Postgres + worker + RecordedGateway). The runner must start it
 * manually:
 *
 *   docker compose up -d postgres
 *   pnpm --filter @doppl/api dev    # in one terminal
 *   DOPPL_E2E=1 pnpm --filter @doppl/web test:e2e
 *
 * For CI the spec skips when the API is not reachable.
 */

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    headless: true,
    actionTimeout: 5_000,
  },
  webServer: process.env.DOPPL_E2E_AUTO_WEB
    ? {
        command: "pnpm dev",
        port: 5173,
        timeout: 20_000,
        reuseExistingServer: true,
      }
    : undefined,
  reporter: [["list"]],
});
