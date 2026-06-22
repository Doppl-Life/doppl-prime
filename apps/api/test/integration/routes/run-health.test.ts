import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { validRunCaps, validCandidateIdeaCrossDomain, validCriticReview } from '@doppl/contracts';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../src/server';

/**
 * P6.8 — GET /runs/:id/health (integration, testcontainers/real PG + Fastify inject). spec(§11/§12):
 * a read-only, projection-derived runtime signal (generation, candidates-in-flight, operations-in-
 * flight via unpaired markers, last-event time, caps-consumed-vs-ceiling); rebuild-on-read; unknown→404.
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function ev(
  runId: string,
  seq: number,
  type: string,
  fields: Partial<AppendInput> = {},
): AppendInput {
  return {
    id: `${runId}-${seq}`,
    runId,
    type: type as AppendInput['type'],
    actor: 'runtime',
    payload: fields.payload ?? {},
    schemaVersion: 2,
    ...(fields.generationId !== undefined ? { generationId: fields.generationId } : {}),
    ...(fields.agenomeId !== undefined ? { agenomeId: fields.agenomeId } : {}),
  };
}

function makeApp() {
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    newId: () => `id-${Math.floor(performance.now())}`,
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

describe('GET /runs/:id/health — runtime signal (spec §11/§12)', () => {
  // §11 — health returns current generation + candidates-in-flight + caps-consumed for an appended run.
  test('test_health_reports_generation_candidates_caps', async () => {
    const runId = 'health-basic';
    await store.append(
      ev(runId, 0, 'run.configured', { payload: { seed: 's', caps: validRunCaps } }),
    );
    await store.append(ev(runId, 1, 'generation.started', { generationId: 'gen_0' }));
    await store.append(
      ev(runId, 2, 'agenome.spawned', { generationId: 'gen_0', agenomeId: 'agn_1' }),
    );
    await store.append(
      ev(runId, 3, 'candidate.created', { payload: validCandidateIdeaCrossDomain }),
    );
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/health` });
      expect(res.statusCode).toBe(200);
      const h = res.json() as {
        runId: string;
        generationCount: number;
        candidatesInFlight: number;
        capsConsumed: { generations: { ceiling: number } } | null;
      };
      expect(h.runId).toBe(runId);
      expect(h.generationCount).toBe(1);
      expect(h.candidatesInFlight).toBe(1); // 'created' candidate is non-terminal
      expect(h.capsConsumed?.generations.ceiling).toBe(validRunCaps.maxGenerations);
    } finally {
      await app.close();
    }
  });

  // §4/§12 — an unpaired *_started marker counts as in-flight; its completion clears it.
  test('test_operations_in_flight_from_unpaired_markers', async () => {
    const runId = 'health-inflight';
    await store.append(
      ev(runId, 0, 'run.configured', { payload: { seed: 's', caps: validRunCaps } }),
    );
    await store.append(ev(runId, 1, 'critic.review_started'));
    const app = makeApp();
    await app.ready();
    try {
      const open = await app.inject({ method: 'GET', url: `/runs/${runId}/health` });
      expect(
        (open.json() as { operationsInFlight: { byType: Record<string, number> } })
          .operationsInFlight.byType.critic,
      ).toBe(1);

      await store.append(ev(runId, 2, 'critic.reviewed', { payload: validCriticReview }));
      const closed = await app.inject({ method: 'GET', url: `/runs/${runId}/health` });
      expect(
        (closed.json() as { operationsInFlight: { total: number } }).operationsInFlight.total,
      ).toBe(0);
    } finally {
      await app.close();
    }
  });

  // §11 — last-event time reflects the most recent appended run_event.
  test('test_last_event_time_reflects_latest', async () => {
    const runId = 'health-last';
    await store.append(
      ev(runId, 0, 'run.configured', { payload: { seed: 's', caps: validRunCaps } }),
    );
    await store.append(ev(runId, 1, 'generation.started', { generationId: 'gen_0' }));
    const app = makeApp();
    await app.ready();
    try {
      const rows = await store.readByRun(runId);
      const lastOccurred = (rows[rows.length - 1]?.occurredAt as Date).toISOString();
      const h = (await app.inject({ method: 'GET', url: `/runs/${runId}/health` })).json() as {
        lastEventAt: string;
      };
      expect(h.lastEventAt).toBe(lastOccurred);
    } finally {
      await app.close();
    }
  });

  // §11 — caps-consumed never exceeds the enforced ceiling (clamped).
  test('test_caps_consumed_never_exceeds_ceiling', async () => {
    const runId = 'health-caps';
    await store.append(
      ev(runId, 0, 'run.configured', { payload: { seed: 's', caps: validRunCaps } }),
    );
    let seq = 1;
    for (let g = 0; g < validRunCaps.maxGenerations + 3; g++) {
      await store.append(ev(runId, seq++, 'generation.started', { generationId: `gen_${g}` }));
    }
    const app = makeApp();
    await app.ready();
    try {
      const h = (await app.inject({ method: 'GET', url: `/runs/${runId}/health` })).json() as {
        capsConsumed: { generations: { consumed: number; ceiling: number } };
      };
      expect(h.capsConsumed.generations.consumed).toBe(validRunCaps.maxGenerations);
      expect(h.capsConsumed.generations.consumed).toBeLessThanOrEqual(
        h.capsConsumed.generations.ceiling,
      );
    } finally {
      await app.close();
    }
  });

  // rule #2 — health is read-only (no append from a GET).
  test('test_health_read_only', async () => {
    const runId = 'health-readonly';
    await store.append(
      ev(runId, 0, 'run.configured', { payload: { seed: 's', caps: validRunCaps } }),
    );
    const before = (await store.readByRun(runId)).length;
    const app = makeApp();
    await app.ready();
    try {
      await app.inject({ method: 'GET', url: `/runs/${runId}/health` });
      expect((await store.readByRun(runId)).length).toBe(before);
    } finally {
      await app.close();
    }
  });

  // §11 — unknown runId → clean 404.
  test('test_unknown_run_404', async () => {
    const app = makeApp();
    await app.ready();
    try {
      expect(
        (await app.inject({ method: 'GET', url: '/runs/no-such-run/health' })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
