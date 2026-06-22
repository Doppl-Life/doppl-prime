import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the §16 happy-path smoke (P7.15). The spec drives the REAL mounted App
 * (P7.14 Dashboard) in a browser against the Vite dev server; the data-client (REST + SSE) is
 * MOCKED via `page.route` interception inside the spec — no live backend (that lands at the
 * demo→cody merge). Deterministic: fixed fixtures + locator waits, no arbitrary sleeps.
 *
 * Run: `pnpm e2e` (requires `pnpm exec playwright install chromium` once). If the browser binary
 * isn't installed in this environment, the spec + config still type-check/lint — the run is a
 * CI/integration step (the spec is the deliverable).
 */
const PORT = 5174;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
