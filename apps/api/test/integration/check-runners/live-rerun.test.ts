import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import { runCheck, type CheckRequest } from '../../../src/check-runners/run-check';
import { liveRerun, type LiveAttempt } from '../../../src/check-runners/live-rerun';
import { SOURCE_VALIDITY_ADAPTER_ID } from '../../../src/check-runners/transfer/source-validity';

/**
 * P4.11 live re-run + replay-backed fallback — integration (testcontainers, real PG). A succeeding live
 * re-run goes through the normal runCheck path (check.started + check.completed, same shape). A failing
 * live attempt serves the persisted check.completed CheckResult via readByRun — NO new append, no
 * re-sample (rule #7/§9). Mirrors append.test.ts.
 */

const PAYLOAD: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start ranking',
  transferMapping: 'map antibody affinity maturation to iterative candidate ranking',
  expectedMechanism: 'progressive selection sharpens ranking quality',
};

const liveThrows: LiveAttempt = () => Promise.reject(new Error('live stall'));

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function request(resultId: string): CheckRequest {
  return {
    adapterId: SOURCE_VALIDITY_ADAPTER_ID,
    checkType: SOURCE_VALIDITY_ADAPTER_ID,
    resultId,
    candidate: JSON.stringify(PAYLOAD),
  };
}

function runContext(runId: string) {
  return { runId, generationId: 'gen_1', candidateId: 'cand_lr' };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('liveRerun — through the real event store', () => {
  // spec(§7) — a succeeding live re-run via runCheck emits the NORMAL check.started + check.completed (same
  // shape, no special-case) and returns the fresh result.
  test('live_success_emits_normal_events', async () => {
    const runId = 'run-lr-success';
    const served = await liveRerun({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: request('lr-success'),
      runContext: runContext(runId),
    });
    expect(served.status).toBe('passed');
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
  });

  // spec(§7/§9, rule #7) — seed a recorded check.completed; a failing live attempt serves the persisted
  // CheckResult and does NOT grow the event count (no re-sample, no fabricated append).
  test('live_fail_serves_persisted_result_no_new_append', async () => {
    const runId = 'run-lr-fallback';
    // Seed: a real check.completed via runCheck (check.started + check.completed).
    const seeded = await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: request('lr-seed'),
      runContext: runContext(runId),
    });
    const countAfterSeed = (await store.readByRun(runId)).length;

    const served = await liveRerun({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: request('lr-live'),
      runContext: runContext(runId),
      liveAttempt: liveThrows,
    });

    expect(CheckResult.safeParse(served).success).toBe(true);
    expect(served.status).toBe('passed');
    expect(served.id).toBe(seeded.id); // the persisted recorded result, served verbatim
    // No new append on the fallback path — the event count is unchanged.
    expect((await store.readByRun(runId)).length).toBe(countAfterSeed);
  });
});
