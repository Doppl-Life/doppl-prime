import { describe, expect, test } from 'vitest';
import { resolveApiBaseUrl } from '../../../src/data/apiBase';

/**
 * PD.14 — the data-client baseUrl is env-configurable (`import.meta.env.VITE_API_BASE ?? '/api'`) so
 * an operator can point the dashboard at a non-proxy API origin; the default `/api` is the dev-proxy
 * path. `resolveApiBaseUrl` is a pure helper over an injected env object so the resolution is
 * deterministic + DOM/import.meta-free in tests (App.tsx calls it with `import.meta.env`).
 */
describe('resolveApiBaseUrl — env-configurable data-client baseUrl', () => {
  test('baseurl_env_configurable: uses VITE_API_BASE when set', () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE: 'http://localhost:3000' })).toBe(
      'http://localhost:3000',
    );
  });

  test('defaults to /api (the dev-proxy path) when unset', () => {
    expect(resolveApiBaseUrl({})).toBe('/api');
  });
});
