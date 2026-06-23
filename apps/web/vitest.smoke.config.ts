import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * PD.14 — standalone config for the REAL web→API smoke (`test/smoke/**`). It boots a testcontainer PG +
 * the seeded API (child process) + Vite (programmatic) and fetches the dashboard's data through the dev
 * proxy — the connection the mocked Playwright e2e never exercised. Kept OUT of the fast unit gate
 * (`vite.config.ts` excludes `test/smoke/**`); invoked only by `pnpm test:smoke:web-api`. Mirrors the
 * apps/api unit-vs-integration config split (LESSONS §25). Long hook timeout covers container + API boot.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@doppl/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/smoke/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
