import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Adopt the frozen contracts barrel from source for apps/api's tests; the pnpm workspace
      // symlink (`@doppl/contracts: workspace:*`) backs node/typecheck resolution.
      '@doppl/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Unit project only — integration tests (testcontainers) run via vitest.integration.config.ts,
    // so `pnpm test` / `test:unit` / preflight never boot a Docker container. The Phase-J eval *.test.ts
    // (gold-set well-formedness + the KEYLESS discrimination-metric logic) also run here; the LIVE
    // `judge-calibration.eval.ts` is NOT matched (`.eval.ts`, key-gated → out of preflight).
    include: ['test/unit/**/*.test.ts', 'test/eval/**/*.test.ts'],
  },
});
