import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

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
  server: {
    proxy: {
      // PD.14 — the dev proxy IS the web↔API wiring (the Finding: with no proxy the dashboard's
      // `/api/*` calls 404, because the API serves at ROOT `/runs` on a different origin). This
      // strips the `/api` prefix + forwards to the API origin. `http-proxy-3` (Vite's proxy backend)
      // PIPES responses, so SSE (`/api/runs/:id/stream`) streams unbuffered with no extra config.
      // The target is env-overridable (default :3000) so the real web→API smoke can point at a
      // spawned API's ephemeral port.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    // The real web→API smoke (test/smoke/**) boots a testcontainer PG + the seeded API + Vite — it
    // runs via `vitest.smoke.config.ts` (`pnpm test:smoke:web-api`), never the fast network-free
    // unit gate. Mirrors the apps/api unit-vs-integration config split (LESSONS §25).
    exclude: [...configDefaults.exclude, 'test/smoke/**'],
  },
});
