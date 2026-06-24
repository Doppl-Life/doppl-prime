import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { RunCaps } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../src/server';

/**
 * PD.12 — wire the PD.4 demo helpers into production (ARCHITECTURE.md §17/§11/§5, KEY SAFETY RULE #1).
 * POST /runs applies `applyDemoCapOverride` (a demo cap-LOWERING convenience that defers to the
 * authoritative `overCapField`/kernel clamp — an above-maxima override is still 422'd); a read-only
 * GET /demo/fallback-ladder exposes the 3 `createFallbackLadder` rung descriptors. Real PG (testcontainers)
 * + Fastify inject. These wire the two built-but-orphaned demo exports to production entries (clears the
 * /phase-exit PD reachability gate). Read paths append nothing (rule #2).
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let idCounter = 0;

const PROBLEM_SETS = [{ id: 'p1', title: 'Demo problem', prompt: 'solve X with Y' }];

function makeApp() {
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    // Unique runId prefix — the integration testcontainer DB is SHARED across route test files, so a
    // generic `id-N` would collide with runs.test.ts on the append's unique(run_id, sequence).
    newId: () => `pd12-${idCounter++}`,
    problemSets: PROBLEM_SETS,
  });
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('PD.12 — POST /runs demo cap-override (spec §17/§5, rule #1)', () => {
  // spec(§17/§5) — a demo cap-override LOWERS within maxima: the run.configured records the lowered cap
  // (recorded==executed); applyDemoCapOverride is now reached from the production POST /runs handler.
  test('post_runs_applies_demo_cap_override', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { demoOverride: { maxPopulation: 1, maxGenerations: 1 } },
    });
    expect(res.statusCode).toBe(201);
    const { runId } = res.json() as { runId: string };
    const configured = (await store.readByRun(runId)).find((e) => e.type === 'run.configured');
    const caps = (configured!.payload as { caps: RunCaps }).caps;
    expect(caps.maxPopulation).toBe(1); // lowered
    expect(caps.maxGenerations).toBe(1); // lowered
    expect(caps.energyBudget).toBe(DEFAULT_RUN_CONFIG.caps.energyBudget); // non-overridden = maximum
    await app.close();
  });

  // rule #1 (LESSONS §89) — a demo-override that tries to RAISE a cap above maxima is STILL 422'd; the
  // override defers to the authoritative clamp, never bypasses it.
  test('post_runs_demo_override_still_rejects_above_maxima', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { demoOverride: { maxPopulation: 1_000_000 } },
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { error?: string }).error).toBe('cap_override_exceeds_max');
    await app.close();
  });
});

describe('PD.12 — GET /demo/fallback-ladder (spec §17/§11)', () => {
  // spec(§17/§11) — the read-only ladder route returns the 3 serializable rung descriptors (low-cap-live
  // caps · prepared runConfig · replay runId); createFallbackLadder is now reached from a production route.
  test('demo_ladder_route_returns_three_rungs', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/demo/fallback-ladder' });
    expect(res.statusCode).toBe(200);
    const { rungs } = res.json() as {
      rungs: {
        kind: string;
        mode: string;
        caps?: RunCaps;
        runConfig?: unknown;
        replayRunId?: string;
      }[];
    };
    expect(rungs.map((r) => r.kind)).toEqual(['low-cap-live', 'prepared', 'replay']);
    const live = rungs.find((r) => r.kind === 'low-cap-live')!;
    expect(live.mode).toBe('live');
    expect(live.caps!.maxPopulation).toBeLessThanOrEqual(DEFAULT_RUN_CONFIG.caps.maxPopulation); // only-lowers
    expect(rungs.find((r) => r.kind === 'prepared')!.runConfig).toBeDefined();
    expect(rungs.find((r) => r.kind === 'replay')!.replayRunId).toBe('demo-recorded-001');
    await app.close();
  });
});
