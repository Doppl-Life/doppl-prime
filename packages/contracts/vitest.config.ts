import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Self-reference resolves to the barrel source within this package's own tests.
      // External consumers resolve `@doppl/contracts` via the pnpm workspace symlink.
      '@doppl/contracts': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
