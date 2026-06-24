import { describe, expect, test } from 'vitest';
import viteConfig from '../../../vite.config';

/**
 * PD.14 — the Vite dev proxy IS the web↔API wiring (the lead/user Finding: with no proxy,
 * `pnpm -C apps/web dev` + the dashboard's `/api/*` calls 404, because the API serves at ROOT
 * `/runs` on a different origin). These config-level assertions pin the contract deterministically
 * (no server): `/api` → the API origin, the `/api` prefix stripped, so the data-client's `/api/runs`
 * resolves to the API's `/runs`. The real end-to-end proof is the web→proxy→REAL-API smoke.
 */
interface ProxyEntry {
  target?: string;
  changeOrigin?: boolean;
  rewrite?: (path: string) => string;
}

describe('vite dev proxy (web→API wiring, §11)', () => {
  const config = viteConfig as { server?: { proxy?: Record<string, ProxyEntry> } };
  const proxy = config.server?.proxy?.['/api'];

  test('proxies /api to the API origin (:3000) with changeOrigin', () => {
    expect(proxy).toBeDefined();
    expect(proxy?.target).toBe('http://localhost:3000');
    expect(proxy?.changeOrigin).toBe(true);
  });

  test('vite_proxy_rewrites_api_prefix_to_root', () => {
    expect(typeof proxy?.rewrite).toBe('function');
    expect(proxy?.rewrite?.('/api/runs')).toBe('/runs');
    expect(proxy?.rewrite?.('/api/runs/run_1/stream')).toBe('/runs/run_1/stream');
    expect(proxy?.rewrite?.('/api/problem-sets')).toBe('/problem-sets');
    expect(proxy?.rewrite?.('/api/demo/fallback-ladder')).toBe('/demo/fallback-ladder');
  });
});
