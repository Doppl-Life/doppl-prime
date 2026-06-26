import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  RunEventEnvelope,
  validCandidateIdeaCrossDomain,
  validCriticReview,
  validFitnessScore,
  validModelRoute,
  validNoveltyScore,
} from '@doppl/contracts';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import { buildServer, DEFAULT_RUN_CONFIG } from '../../../src/server';

/**
 * P6.7 — REST read surface (integration, testcontainers/real PG + Fastify inject). spec(§11) GET
 * read endpoints + resume cursor; spec(§9) freshly-rebuilt projections (P6.2/6.3/6.4 fold over
 * readByRun); rule #2 reads are read-only (no append, no projection write); unknown id → clean 404.
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

async function seedRun(runId: string): Promise<void> {
  await store.append(
    ev(runId, 0, 'run.configured', { payload: { seed: `scn-${runId}`, rngSeed: 1 } }),
  );
  await store.append(ev(runId, 1, 'generation.started', { generationId: 'gen_1' }));
  await store.append(
    ev(runId, 2, 'agenome.spawned', { generationId: 'gen_1', agenomeId: 'agn_1' }),
  );
  await store.append(ev(runId, 3, 'candidate.created', { payload: validCandidateIdeaCrossDomain }));
  await store.append(ev(runId, 4, 'critic.reviewed', { payload: validCriticReview }));
  await store.append(ev(runId, 5, 'novelty.scored', { payload: validNoveltyScore }));
  await store.append(ev(runId, 6, 'fitness.scored', { payload: validFitnessScore }));
  await store.append(ev(runId, 7, 'run.completed'));
}

function makeApp() {
  return buildServer({
    store,
    db,
    defaultConfig: DEFAULT_RUN_CONFIG,
    newId: () => `id-${Math.floor(performance.now())}`,
    modelRoutes: [validModelRoute],
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

describe('GET /runs* + /model-routes — read surface (spec §11/§9)', () => {
  // §11 — GET /runs lists appended runs (id + current-state summary). Positive guard.
  test('test_get_runs_lists_runs', async () => {
    await seedRun('read-list-a');
    await seedRun('read-list-b');
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/runs' });
      expect(res.statusCode).toBe(200);
      const ids = (res.json() as { runs: { runId: string }[] }).runs.map((r) => r.runId);
      expect(ids).toContain('read-list-a');
      expect(ids).toContain('read-list-b');
    } finally {
      await app.close();
    }
  });

  // §11 — GET /runs/:id returns the current-state projection.
  test('test_get_run_by_id_current_state', async () => {
    await seedRun('read-one');
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/runs/read-one' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        runId: string;
        state: { runs: Record<string, { status: string }> };
      };
      expect(body.runId).toBe('read-one');
      expect(body.state.runs['read-one']?.status).toBe('completed');
    } finally {
      await app.close();
    }
  });

  // §11 — GET /runs/:id/events ordered by sequence; ?since=N returns sequence > N (numeric-guarded).
  test('test_get_events_ordered_and_resume_cursor', async () => {
    await seedRun('read-events');
    const app = makeApp();
    await app.ready();
    try {
      const all = await app.inject({ method: 'GET', url: '/runs/read-events/events' });
      expect(all.statusCode).toBe(200);
      const seqs = (all.json() as { events: { sequence: number }[] }).events.map((e) => e.sequence);
      expect(seqs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); // ordered

      const since = await app.inject({ method: 'GET', url: '/runs/read-events/events?since=5' });
      const sinceSeqs = (since.json() as { events: { sequence: number }[] }).events.map(
        (e) => e.sequence,
      );
      expect(sinceSeqs).toEqual([6, 7]); // sequence > since

      const bad = await app.inject({ method: 'GET', url: '/runs/read-events/events?since=abc' });
      expect(bad.statusCode).toBe(400); // numeric-guarded
    } finally {
      await app.close();
    }
  });

  // PD.15 (§4/§11) — GET /runs/:id/events omits null/undefined optionals on the wire (the shared
  // serializer) so the frozen RunEventEnvelope re-parses on the consumer (the web getEvents no longer
  // PayloadValidationErrors on DB-null optionals). Pre-fix: nulls present → parse throws (the Finding).
  test('test_get_events_omit_null_optionals_reparse', async () => {
    await seedRun('read-omit-null');
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/runs/read-omit-null/events' });
      expect(res.statusCode).toBe(200);
      const events = (res.json() as { events: Record<string, unknown>[] }).events;
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        for (const key of [
          'generationId',
          'agenomeId',
          'candidateId',
          'correlationId',
          'langfuseTraceId',
          'langfuseObservationId',
        ]) {
          expect(event[key]).not.toBeNull(); // ABSENT (undefined), never `null`
        }
        expect(() => RunEventEnvelope.parse(event)).not.toThrow(); // the frozen consumer re-parses
      }
    } finally {
      await app.close();
    }
  });

  // §11/§9 — /lineage returns the LineageGraphProjection (sequenceThrough); /replay the replay summary.
  test('test_get_lineage_and_replay', async () => {
    await seedRun('read-proj');
    const app = makeApp();
    await app.ready();
    try {
      const lineage = await app.inject({ method: 'GET', url: '/runs/read-proj/lineage' });
      expect(lineage.statusCode).toBe(200);
      const lg = lineage.json() as { runId: string; nodes: unknown[]; sequenceThrough: number };
      expect(lg.runId).toBe('read-proj');
      expect(lg.sequenceThrough).toBe(7);
      expect(lg.nodes.length).toBeGreaterThan(0);

      const replay = await app.inject({ method: 'GET', url: '/runs/read-proj/replay' });
      expect(replay.statusCode).toBe(200);
      const rs = replay.json() as { digest: { seed: string } };
      expect(rs.digest.seed).toBe('scn-read-proj');
    } finally {
      await app.close();
    }
  });

  // KB slice 1 (§9/§11) — /knowledge returns the ResearchNote graph folded from tool_call.finished:
  // notes (tool/query/snippet/urls) + agenome→note "researched" edges, rebuilt on read.
  test('test_get_knowledge_research_notes', async () => {
    const runId = 'read-knowledge';
    await store.append(ev(runId, 0, 'run.configured', { payload: { seed: 'scn-kb', rngSeed: 1 } }));
    await store.append(ev(runId, 1, 'generation.started', { generationId: 'gen_1' }));
    await store.append(
      ev(runId, 2, 'agenome.spawned', { generationId: 'gen_1', agenomeId: 'agn_1' }),
    );
    await store.append(
      ev(runId, 3, 'tool_call.finished', {
        generationId: 'gen_1',
        agenomeId: 'agn_1',
        payload: {
          toolName: 'web_search',
          query: '{"query": "patient flow"}',
          result: 'Findings. Sources:\n- https://example.com/a',
        },
      }),
    );
    await store.append(
      ev(runId, 4, 'tool_call.finished', {
        generationId: 'gen_1',
        agenomeId: 'agn_1',
        payload: { toolName: 'x_search', result: 'chatter' },
      }),
    );
    await store.append(ev(runId, 5, 'run.completed'));
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/knowledge` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        runId: string;
        sequenceThrough: number;
        state: {
          notes: Record<string, { toolName: string; query?: string; sourceUrls: string[] }>;
          edges: Record<string, { type: string; source: string }>;
        };
      };
      expect(body.runId).toBe(runId);
      expect(body.sequenceThrough).toBe(5);
      const notes = Object.values(body.state.notes);
      expect(notes).toHaveLength(2);
      const web = notes.find((n) => n.toolName === 'web_search');
      expect(web?.query).toBe('patient flow'); // raw JSON args normalized
      expect(web?.sourceUrls).toContain('https://example.com/a');
      // both notes carry an agenome→note "researched" edge
      const researched = Object.values(body.state.edges).filter((e) => e.type === 'researched');
      expect(researched).toHaveLength(2);
      expect(researched.every((e) => e.source === 'agn_1')).toBe(true);
    } finally {
      await app.close();
    }
  });

  // §11 — /candidates/:cid returns the candidate projection including its evidenceRefs (within-tier).
  test('test_get_candidate_with_evidence_refs', async () => {
    await seedRun('read-cand');
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/runs/read-cand/candidates/cand_1' });
      expect(res.statusCode).toBe(200);
      const cand = res.json() as { id: string; evidenceRefs: unknown[] };
      expect(cand.id).toBe('cand_1');
      expect(cand.evidenceRefs).toEqual(validCandidateIdeaCrossDomain.evidenceRefs);
    } finally {
      await app.close();
    }
  });

  // §11 — /model-routes returns the configured ModelRoute set.
  test('test_get_model_routes', async () => {
    const app = makeApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/model-routes' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { modelRoutes: { role: string }[] };
      expect(body.modelRoutes).toEqual([validModelRoute]);
    } finally {
      await app.close();
    }
  });

  // §11 — an unknown runId / candidateId yields a clean 404 (not a partial/empty 200).
  test('test_unknown_id_clean_404', async () => {
    await seedRun('read-404');
    const app = makeApp();
    await app.ready();
    try {
      expect((await app.inject({ method: 'GET', url: '/runs/does-not-exist' })).statusCode).toBe(
        404,
      );
      expect(
        (await app.inject({ method: 'GET', url: '/runs/does-not-exist/lineage' })).statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: '/runs/read-404/candidates/no-such-cand' }))
          .statusCode,
      ).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: '/runs/does-not-exist/knowledge' })).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  // rule #2 — a read appends no event + writes no projection (read-only).
  test('test_reads_never_mutate', async () => {
    await seedRun('read-immutable');
    const before = (await store.readByRun('read-immutable')).length;
    const app = makeApp();
    await app.ready();
    try {
      await app.inject({ method: 'GET', url: '/runs/read-immutable' });
      await app.inject({ method: 'GET', url: '/runs/read-immutable/lineage' });
      await app.inject({ method: 'GET', url: '/runs/read-immutable/replay' });
      expect((await store.readByRun('read-immutable')).length).toBe(before); // no append from reads
    } finally {
      await app.close();
    }
  });

  // PD.5a (§11/§17) — buildServer REGISTERS GET /problem-sets (closes the unit-tested-but-unregistered
  // gap: the route is served through the production server builder, not just in isolation), returning the
  // injected boot catalog. main.ts wires `problemSets: config.problemSets` into this same buildServer.
  test('test_buildServer_serves_problem_sets', async () => {
    const catalog = [
      { id: 'p1', title: 'Demo problem', prompt: 'Solve a hard, well-scoped problem.' },
    ];
    const app = buildServer({
      store,
      db,
      defaultConfig: DEFAULT_RUN_CONFIG,
      newId: () => 'id-ps',
      problemSets: catalog,
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/problem-sets' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ problemSets: catalog });
    } finally {
      await app.close();
    }
  });

  // PD.18 (§11/§5) — GET /config/caps serves the boot defaultConfig.caps (the SAME maxima overCapField
  // enforces) so the RunConfigPanel clamps to the real ceiling (fixing the cap-default 422). Read-only.
  test('test_config_caps_returns_configured_maxima', async () => {
    const caps = {
      maxPopulation: 12,
      maxGenerations: 6,
      energyBudget: 1000,
      maxSpawnDepth: 4,
      maxToolCalls: 80,
      wallClockTimeoutMs: 480_000,
    };
    const app = buildServer({
      store,
      db,
      defaultConfig: { ...DEFAULT_RUN_CONFIG, caps },
      newId: () => 'id-caps',
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/config/caps' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ caps });
    } finally {
      await app.close();
    }
  });
});
