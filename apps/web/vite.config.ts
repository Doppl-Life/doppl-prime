import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Vitest reads this Vite config. The `@doppl/contracts` alias adopts the frozen contracts barrel
// from source (matching apps/api + packages/observability); the pnpm workspace symlink
// (`@doppl/contracts: workspace:*`) backs node/typecheck resolution. Default env is `node` (the
// data-client tests are DOM-free + deterministic via injected transport doubles); the render-smoke
// test opts into happy-dom with a `// @vitest-environment happy-dom` docblock.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@doppl/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
