import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { buildServer } from '../../../src/server';
import type { ModelRouteOverrideAllowlist } from '../../../src/model-gateway/model-route-override';

/**
 * GET /config/model-route-overrides — serves the FB.2 per-run model-route override allowlist read-only so
 * the RunConfigPanel's model picker can offer only permitted targets. `final_judge` is never present
 * (rule #6 — the held-out judge model is not run-swappable). Real PG (shared testcontainer).
 */

const ALLOWLIST: ModelRouteOverrideAllowlist = {
  population_generator: [
    { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
    { provider: 'ollama', modelId: 'llama3.1' },
  ],
  fusion_synthesis: [{ provider: 'ollama', modelId: 'llama3.1' }],
  // final_judge intentionally ABSENT (rule #6).
};

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let idCounter = 0;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});
afterAll(async () => {
  await pool.end();
});

describe('GET /config/model-route-overrides', () => {
  test('serves the frozen per-role override allowlist (final_judge absent, rule #6)', async () => {
    const app = buildServer({
      store,
      db,
      newId: () => `mroe-${idCounter++}`,
      modelRouteOverrideAllowlist: ALLOWLIST,
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/config/model-route-overrides' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { allowlist: ModelRouteOverrideAllowlist };
      expect(body.allowlist.population_generator).toEqual(ALLOWLIST.population_generator);
      expect(body.allowlist.fusion_synthesis).toEqual(ALLOWLIST.fusion_synthesis);
      expect(body.allowlist.final_judge).toBeUndefined(); // rule #6 — not overridable
    } finally {
      await app.close();
    }
  });

  test('defaults to a fail-closed empty allowlist when none is injected', async () => {
    const app = buildServer({ store, db, newId: () => `mroe-${idCounter++}` });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/config/model-route-overrides' });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { allowlist: unknown }).allowlist).toEqual({});
    } finally {
      await app.close();
    }
  });
});
