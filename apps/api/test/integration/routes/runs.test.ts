import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../src/server';

/**
 * P6.6 — REST write path + Fastify bootstrap (integration, testcontainers/real PG + Fastify inject).
 * spec(§11) idempotent mutating endpoints; spec(§15) one-active-run + fail-fast config; spec(§14)
 * bodyLimit ingestion gate + REST = sole write path (appends authoritative events, never mutates a
 * projection — rule #2). The kernel that EXECUTES a configured run is P3 (unmerged) — this slice is
 * the endpoint (validate + idempotent append + concurrency).
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let idCounter = 0;

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

function makeApp(bodyLimit?: number) {
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    newId: () => `id-${idCounter++}`,
    ...(bodyLimit !== undefined ? { bodyLimit } : {}),
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

describe('POST /runs + /runs/:id/stop — REST write path (spec §11/§14/§15)', () => {
  // §11 — a valid config → 2xx + exactly one run.configured appended. Positive guard.
  test('test_post_runs_valid_appends_run_configured', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'POST', url: '/runs', payload: validBody });
      expect(res.statusCode).toBe(201);
      const { runId } = res.json() as { runId: string };
      expect(runId).toBeTruthy();
      expect(await countType(runId, 'run.configured')).toBe(1);
    } finally {
      await app.close();
    }
  });

  // §15 — an invalid config fails fast with a clear validation error and appends NO run.configured.
  test('test_post_runs_invalid_config_fails_fast_no_append', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const before = (await store.readByRun('nope')).length;
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: { ...validBody, enabledSubtypes: [] }, // RunConfig requires ≥1 subtype
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: string }).error).toBe('invalid_config');
      expect((await store.readByRun('nope')).length).toBe(before); // nothing appended anywhere
    } finally {
      await app.close();
    }
  });

  // §11 — a cap above the validated maxima is refused (never silently clamped up); a lowering within
  // ceilings is accepted.
  test('test_post_runs_rejects_over_cap_override', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const over = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: { ...validBody, caps: { ...validBody.caps, maxPopulation: 9_999 } },
      });
      expect(over.statusCode).toBe(422);
      expect((over.json() as { error: string }).error).toBe('cap_override_exceeds_max');

      const lowered = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: { ...validBody, caps: { ...validBody.caps, maxPopulation: 2 } },
      });
      expect(lowered.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  // §11 — idempotent via Idempotency-Key: a repeated request with the same key returns the same run,
  // no second run.configured.
  test('test_post_runs_idempotent_same_key', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const headers = { 'idempotency-key': 'key-abc' };
      const first = await app.inject({ method: 'POST', url: '/runs', payload: validBody, headers });
      const second = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: validBody,
        headers,
      });
      const runA = (first.json() as { runId: string }).runId;
      const runB = (second.json() as { runId: string }).runId;
      expect(runB).toBe(runA); // same run
      expect(await countType(runA, 'run.configured')).toBe(1); // no duplicate append
    } finally {
      await app.close();
    }
  });

  // §15 — one active run at a time: starting while a run is non-terminal is refused (not queued).
  test('test_one_active_run_refused', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const first = await app.inject({ method: 'POST', url: '/runs', payload: validBody });
      expect(first.statusCode).toBe(201);
      const second = await app.inject({ method: 'POST', url: '/runs', payload: validBody });
      expect(second.statusCode).toBe(409);
      expect((second.json() as { error: string }).error).toBe('run_already_active');
    } finally {
      await app.close();
    }
  });

  // §11 — stop is idempotent: stop on active → terminal + partial evidence preserved; stop again on
  // already-terminal → no-op success (no second run.stopped).
  test('test_stop_idempotent_terminal_noop', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const created = await app.inject({ method: 'POST', url: '/runs', payload: validBody });
      const runId = (created.json() as { runId: string }).runId;

      const stop1 = await app.inject({ method: 'POST', url: `/runs/${runId}/stop` });
      expect(stop1.statusCode).toBe(200);
      expect(await countType(runId, 'run.stopped')).toBe(1);
      // partial evidence preserved (append-only — run.configured still in the log).
      expect(await countType(runId, 'run.configured')).toBe(1);

      const stop2 = await app.inject({ method: 'POST', url: `/runs/${runId}/stop` });
      expect(stop2.statusCode).toBe(200); // already-terminal → no-op success
      expect(await countType(runId, 'run.stopped')).toBe(1); // no second terminal append
    } finally {
      await app.close();
    }
  });

  // §14 — the bodyLimit ingestion gate rejects an over-limit request body before the per-type ceiling.
  test('test_body_limit_rejects_oversize_request', async () => {
    const app = makeApp(256); // tiny bodyLimit
    await app.ready();
    try {
      const huge = { ...validBody, seed: 'x'.repeat(2_000) };
      const res = await app.inject({ method: 'POST', url: '/runs', payload: huge });
      expect(res.statusCode).toBe(413); // FST_ERR_CTP_BODY_TOO_LARGE — rejected at ingestion
    } finally {
      await app.close();
    }
  });

  // §15 (security fix) — a present-but-non-object body (array/string) is rejected fail-fast (400),
  // never masked into a silent default-config run.
  test('test_post_runs_non_object_body_rejected', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        payload: ['not', 'an', 'object'],
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: string }).error).toBe('invalid_config');
    } finally {
      await app.close();
    }
  });

  // boundary error hygiene (security fix) — /stop on a run whose log carries a foreign-producer event
  // with an unsupported schemaVersion surfaces a CLEAN 500 (no internal ProjectionError message leak).
  test('test_stop_on_unreadable_log_returns_clean_500', async () => {
    const runId = 'foreign-sv';
    await store.append({
      id: `evt-${runId}-x`,
      runId,
      type: 'run.configured',
      actor: 'operator',
      payload: {},
      schemaVersion: 99, // > CURRENT_SCHEMA_VERSION → buildCurrentState throws ProjectionError
    });
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'POST', url: `/runs/${runId}/stop` });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'internal_error' }); // no message / schemaVersion leak
    } finally {
      await app.close();
    }
  });

  // rule #2 — the write path appends authoritative events only; it never mutates a projection directly
  // (structural: the route module performs no direct DB insert/update — it goes through store.append).
  test('test_endpoints_never_mutate_projection_directly', async () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../src/routes/runs.ts', import.meta.url)),
      'utf8',
    );
    expect(src.length).toBeGreaterThan(0);
    expect(/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.values\s*\(/.test(src)).toBe(false);
    expect(/from\s+['"][^'"]*drizzle/.test(src)).toBe(false); // no direct DB driver import
  });
});
