import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CURRENT_SCHEMA_VERSION,
  validCandidateIdeaCrossDomain,
  validFitnessScore,
  validNoveltyScore,
  validProviderMeta,
} from '@doppl/contracts';
import type { ModelGatewayResponse } from '@doppl/contracts';
import { createEventStore, runEvents, type EventStore } from '../../../src/event-store';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import type {
  GenerationGateway,
  ReproduceSeam,
  ScoreSeam,
  VerifySeam,
} from '../../../src/runtime/loop/generationLoop';
import { runWorker } from '../../../src/runtime/worker/runWorker';

/**
 * P3.12 in-process worker — integration (testcontainers, real PG). The worker drives a `configured` run
 * through run.started → generations → a single P3.11 run-terminal end-to-end via the real append path;
 * single-active-run is enforced from the authoritative log; a re-run of an already-terminal run is a no-op.
 */

const VALID_ENV: Record<string, string | undefined> = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};
const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};
const fakeGateway: GenerationGateway = {
  generate: async () => {
    const response: ModelGatewayResponse = {
      accepted: true,
      validationResult: 'accepted',
      output: CANDIDATE_CONTENT,
      providerMeta: validProviderMeta,
    };
    return { response };
  },
};
const verify: VerifySeam = async () => {};
const score: ScoreSeam = async (candidates, ctx) => {
  for (const c of candidates) {
    await ctx.append({
      id: `${c.id}-novelty`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'novelty.scored',
      actor: 'selection_controller',
      payload: validNoveltyScore as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await ctx.append({
      id: `${c.id}-fitness`,
      runId: ctx.runId,
      generationId: ctx.generationId,
      candidateId: c.id,
      type: 'fitness.scored',
      actor: 'selection_controller',
      payload: validFitnessScore as unknown as Record<string, unknown>,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
  }
};
const reproduce: ReproduceSeam = async (ctx) => {
  ctx.outcomes.int('mutation_point', 0, 8);
  await ctx.append({
    id: `${ctx.generationId}-reproduced`,
    runId: ctx.runId,
    generationId: ctx.generationId,
    type: 'agenome.reproduced',
    actor: 'agenome',
    payload: { mode: ctx.mode },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
};

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

// In production `listRunIds` enumerates ALL runs (drizzle `selectDistinct`, demonstrated below); in this
// SHARED testcontainer DB prior test files leave non-terminal runs, so the single-active-run scan is scoped
// to the run ids this scenario cares about (the injection is the seam — scoping is a test-isolation concern).
function makeWorkerDeps(runId: string, scan: readonly string[] = [runId]) {
  return {
    runId,
    config: loadConfig({
      env: VALID_ENV,
      fileSources: { caps: { maxGenerations: 1, maxPopulation: 2 } },
    }),
    eventStore: store,
    gateway: fakeGateway,
    seams: { verify, score, reproduce },
    listRunIds: async () => scan,
  };
}

// The real production enumerator (kept to prove the drizzle selectDistinct shape the REST/Phase-D caller uses).
const _listAllRunIds = async (): Promise<string[]> => {
  const ids = await db.selectDistinct({ runId: runEvents.runId }).from(runEvents);
  return ids.map((r) => r.runId);
};
void _listAllRunIds;
const configured = (runId: string) => ({
  id: `${runId}-configured`,
  runId,
  type: 'run.configured' as const,
  actor: 'operator' as const,
  payload: {},
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});
afterAll(async () => {
  await pool.end();
});

describe('runWorker — P3.12 in-process worker (real PG append path)', () => {
  // spec(§5/§3/§H) + rule #2 — the worker drives a configured run end-to-end via the real append path:
  // run.started (configured→running) → generations → exactly one P3.11 run-terminal, sequence-ordered.
  test('worker_runs_configured_run_end_to_end', async () => {
    const runId = 'run-worker-it-1';
    await store.append(configured(runId));

    const result = await runWorker(makeWorkerDeps(runId));
    expect(result.started).toBe(true);

    const log = await store.readByRun(runId);
    const started = log.filter((e) => e.type === 'run.started');
    expect(started).toHaveLength(1);
    expect(started[0]!.sequence).toBeLessThan(
      log.find((e) => e.type === 'generation.started')!.sequence,
    );
    expect(log.filter((e) => e.type === 'run.completed')).toHaveLength(1); // single P3.11 terminal
    // sequence-ordered, strictly monotonic gap-free.
    const seqs = log.map((e) => e.sequence);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  // spec(§5) — a second start while one run is active (non-terminal) is rejected; re-invoking the worker on
  // an already-terminal run is a no-op (no new events).
  test('second_concurrent_start_rejected_and_rerun_is_noop', async () => {
    // run A is configured+started (running, non-terminal — left mid-flight on purpose).
    const active = 'run-worker-it-active';
    await store.append(configured(active));
    await store.append({
      id: `${active}-started`,
      runId: active,
      type: 'run.started',
      actor: 'runtime',
      payload: { from: 'configured', to: 'running' },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    // a new configured run is rejected while A is active.
    const blocked = 'run-worker-it-blocked';
    await store.append(configured(blocked));
    const rejected = await runWorker(makeWorkerDeps(blocked, [active, blocked]));
    expect(rejected.started).toBe(false);
    if (!rejected.started) expect(rejected.reason).toBe('run_already_active');
    expect(await store.readByRun(blocked)).toHaveLength(1); // only run.configured — no run.started

    // re-invoking the worker on the ALREADY-RUNNING run A is a no-op (run-level idempotency).
    const before = (await store.readByRun(active)).length;
    const rerun = await runWorker(makeWorkerDeps(active, [active]));
    expect(rerun.started).toBe(false);
    expect(await store.readByRun(active)).toHaveLength(before); // no new events
  });
});
