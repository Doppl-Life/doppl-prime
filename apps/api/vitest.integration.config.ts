import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Integration test project (P1.4+) — runs the testcontainers-backed suite against a real Dockerized
 * Postgres. Separate from the default (unit) config so `pnpm test` / `test:unit` never boot a
 * container; `test:integration` uses this config. Longer hook timeout covers container boot + migrate.
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
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/integration/setup/testcontainers-pg.ts'],
    hookTimeout: 120_000, // container pull + boot on a cold cache
    testTimeout: 60_000,
  },
});
