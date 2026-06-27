import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Phase J eval project — the LIVE, key-gated harnesses (`test/eval/**\/*.eval.ts`). Separate from the unit
 * config (which runs the keyless `*.test.ts`) so `/preflight` + CI never make a provider call. Run on demand:
 *   OPENROUTER_API_KEY=… pnpm -C apps/api test:eval
 * The `*.eval.ts` files `describe.skipIf(!OPENROUTER_API_KEY)` so a keyless invocation is a clean no-op.
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
    include: ['test/eval/**/*.eval.ts'],
    testTimeout: 240_000,
    hookTimeout: 240_000,
  },
});
