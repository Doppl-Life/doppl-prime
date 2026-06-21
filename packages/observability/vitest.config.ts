import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Adopt the frozen contracts barrel from source for this package's tests; the pnpm workspace
      // symlink (`@doppl/contracts: workspace:*`) backs node/typecheck resolution.
      '@doppl/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
