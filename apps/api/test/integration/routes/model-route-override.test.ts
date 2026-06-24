import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../src/server';
import type { ModelRouteOverrideAllowlist } from '../../../src/model-gateway/model-route-override';

/**
 * FB.2 — POST /runs clamps RunConfig.modelRouteOverride to a frozen per-role allowlist (ARCHITECTURE.md
 * §11/§5/§6). A non-permitted override (or one targeting final_judge — rule #6) is rejected 422 BEFORE
 * the run.configured append (rule #2 — never persist an invalid override); a permitted (or absent)
 * override appends run.configured carrying it. Mirrors the cap-override 422 (overCapField). Real PG.
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let idCounter = 0;

const ALLOWLIST: ModelRouteOverrideAllowlist = {
  population_generator: [{ provider: 'ollama', modelId: 'llama3.1' }],
  // final_judge intentionally ABSENT (rule #6 — not run-swappable).
};

const validBody = {
  seed: 'scenario-x',
  enabledSubtypes: ['cross_domain_transfer'],
  caps: {
    maxPopulation: 10,
    maxGenerations: 5,
    energyBudget: 50_000,
    maxSpawnDepth: 4,
    maxToolCalls: 100,
    wallClockTimeoutMs: 300_000,
  },
  modelProfile: 'default',
  scoringPolicyVersion: 'scoring-v1',
  rngSeed: 1,
};

function makeApp() {
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    // Unique id prefix — the integration suite shares ONE testcontainer DB across files, so a generic
    // `id-N` would collide with other route tests' event ids on append (unique pk → 500).
    newId: () => `mro-${idCounter++}`,
    modelRouteOverrideAllowlist: ALLOWLIST,
  });
}

async function countType(runId: string, type: string): Promise<number> {
  return (await store.readByRun(runId)).filter((e) => e.type === type).length;
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('POST /runs — modelRouteOverride allowlist clamp (spec §11/§5/§6)', () => {
  test('test_post_runs_rejects_unpermitted_override_422', async () => {
    // rule #1/#2: a {provider,modelId} not in the role's allowlist → 422, NO run.configured appended.
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          ...validBody,
          modelRouteOverride: {
            population_generator: { provider: 'ollama', modelId: 'NOT-ALLOWED' },
          },
        },
      });
      expect(res.statusCode).toBe(422);
      const body = res.json() as { error: string; role: string };
      expect(body.error).toBe('model_route_override_not_permitted');
      expect(body.role).toBe('population_generator');
      const { runId } = res.json() as { runId?: string };
      expect(runId).toBeUndefined(); // no run created
    } finally {
      await app.close();
    }
  });

  test('test_post_runs_rejects_final_judge_override_422', async () => {
    // rule #6: an override targeting final_judge is rejected — the held-out judge is not run-swappable.
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          ...validBody,
          modelRouteOverride: { final_judge: { provider: 'ollama', modelId: 'llama3.1' } },
        },
      });
      expect(res.statusCode).toBe(422);
      expect((res.json() as { error: string; role: string }).role).toBe('final_judge');
    } finally {
      await app.close();
    }
  });

  test('test_post_runs_accepts_permitted_override', async () => {
    // happy path: a permitted override appends run.configured carrying it; an absent override also appends.
    const app = makeApp();
    await app.ready();
    try {
      const permitted = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          ...validBody,
          modelRouteOverride: { population_generator: { provider: 'ollama', modelId: 'llama3.1' } },
        },
      });
      expect(permitted.statusCode).toBe(201);
      const runId = (permitted.json() as { runId: string }).runId;
      expect(await countType(runId, 'run.configured')).toBe(1);
      const configured = (await store.readByRun(runId)).find((e) => e.type === 'run.configured');
      expect((configured?.payload as { modelRouteOverride?: unknown }).modelRouteOverride).toEqual({
        population_generator: { provider: 'ollama', modelId: 'llama3.1' },
      });
    } finally {
      await app.close();
    }
  });
});
