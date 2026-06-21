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
    include: ['test/**/*.test.ts'],
  },
});
