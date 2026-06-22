import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../../src/event-store';
import {
  CHECK_RUNNER_REGISTRY,
  type RetrievalResult,
} from '../../../../src/check-runners/registry';
import { runCheck } from '../../../../src/check-runners/run-check';
import { PRIOR_ART_ADAPTER_ID } from '../../../../src/check-runners/transfer/prior-art';
import { SOURCE_VALIDITY_ADAPTER_ID } from '../../../../src/check-runners/transfer/source-validity';

/**
 * P4.9b/P4.10b grounding adapters — integration (testcontainers, real PG). A grounding adapter runs
 * through the UNCHANGED-shape runCheck with injected retrievalResults (DATA): check.started + one
 * validated check.completed carrying the grounding evidence (§7/§4/§9). Absent results → skipped (no
 * false grounding). The harness extension is additive — a deterministic adapter still runs identically.
 */

const PAYLOAD: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start ranking',
  transferMapping: 'map antibody affinity maturation to iterative candidate ranking refinement',
  expectedMechanism: 'progressive selection sharpens ranking quality',
};

const RESULTS: RetrievalResult[] = [
  {
    text: 'blockchain consensus and distributed ledger throughput',
    source: 'corpus-x',
    fallbackSourced: true,
  },
];

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function runContext(runId: string) {
  return { runId, generationId: 'gen_1', candidateId: 'cand_g' };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('grounding adapters through the real runCheck harness', () => {
  // spec(§7/§4/§9) — a grounding adapter with injected retrievalResults runs through the harness and the
  // persisted check.completed carries the grounding evidence (evidenceRefs).
  test('grounding_adapter_runs_through_harness_with_injected_results', async () => {
    const runId = 'run-grounding-results';
    const result = await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: {
        adapterId: PRIOR_ART_ADAPTER_ID,
        checkType: PRIOR_ART_ADAPTER_ID,
        resultId: 'chk-pa',
        candidate: JSON.stringify(PAYLOAD),
        retrievalResults: RESULTS,
      },
      runContext: runContext(runId),
    });
    expect(result.status).not.toBe('skipped');
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
    const completed = rows.find((r) => r.type === 'check.completed');
    const parsed = CheckResult.safeParse(completed?.payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.evidenceRefs.length : 0).toBeGreaterThan(0);
  });

  // spec(§7) — no retrievalResults → check.completed status skipped{retrieval_unavailable} (no false
  // grounding, never re-fetches).
  test('grounding_adapter_skips_when_no_results', async () => {
    const runId = 'run-grounding-skip';
    const result = await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: {
        adapterId: PRIOR_ART_ADAPTER_ID,
        checkType: PRIOR_ART_ADAPTER_ID,
        resultId: 'chk-pa-skip',
        candidate: JSON.stringify(PAYLOAD),
      },
      runContext: runContext(runId),
    });
    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBe('retrieval_unavailable');
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
  });

  // backward-compat — a P4.9 deterministic adapter still runs identically through the extended runCheck
  // (retrievalResults absent; the additive harness field doesn't change its behavior).
  test('existing_deterministic_adapters_unaffected', async () => {
    const runId = 'run-grounding-detbackcompat';
    const result = await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: {
        adapterId: SOURCE_VALIDITY_ADAPTER_ID,
        checkType: SOURCE_VALIDITY_ADAPTER_ID,
        resultId: 'chk-sv-bc',
        candidate: JSON.stringify(PAYLOAD),
      },
      runContext: runContext(runId),
    });
    expect(result.status).toBe('passed');
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
  });
});
