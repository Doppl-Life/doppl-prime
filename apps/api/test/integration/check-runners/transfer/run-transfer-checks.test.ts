import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../../src/event-store';
import { CHECK_RUNNER_REGISTRY } from '../../../../src/check-runners/registry';
import { runCheck } from '../../../../src/check-runners/run-check';
import { SOURCE_VALIDITY_ADAPTER_ID } from '../../../../src/check-runners/transfer/source-validity';
import { TARGET_FIT_ADAPTER_ID } from '../../../../src/check-runners/transfer/target-fit';
import { MAPPING_QUALITY_ADAPTER_ID } from '../../../../src/check-runners/transfer/mapping-quality';
import { ALLOWLISTED_EXECUTABLE_ADAPTER_ID } from '../../../../src/check-runners/transfer/allowlisted-executable';

/**
 * P4.9 transfer check adapters — integration (testcontainers, real PG). Each registered adapter runs
 * end-to-end through the UNCHANGED P4.5 runCheck harness: check.started + one validated check.completed
 * via the real append path. spec(§7/§4); lesson 28 (the harness path). Mirrors append.test.ts.
 */

const PAYLOAD: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start ranking',
  transferMapping: 'map antibody refinement to iterative candidate ranking for cold-start',
  expectedMechanism: 'progressive selection improves ranking quality',
};

const TRANSFER_ADAPTER_IDS = [
  SOURCE_VALIDITY_ADAPTER_ID,
  TARGET_FIT_ADAPTER_ID,
  MAPPING_QUALITY_ADAPTER_ID,
  ALLOWLISTED_EXECUTABLE_ADAPTER_ID,
];

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function request(adapterId: string, resultId: string) {
  return { adapterId, checkType: adapterId, resultId, candidate: JSON.stringify(PAYLOAD) };
}

function runContext(runId: string) {
  return { runId, generationId: 'gen_1', candidateId: 'cand_1' };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('transfer adapters through the real runCheck harness', () => {
  // spec(§7/§4) — a registered transfer adapter runs through the harness: check.started + one validated
  // check.completed land in order via the real append path.
  test('registered_transfer_adapter_runs_through_harness', async () => {
    const runId = 'run-transfer-harness';
    await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: request(SOURCE_VALIDITY_ADAPTER_ID, 'chk-sv'),
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
    const completed = rows.find((r) => r.type === 'check.completed');
    const parsed = CheckResult.safeParse(completed?.payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.status : null).not.toBe('skipped');
  });

  // spec(§7) — all four transfer ids resolve to their impl (not skipped-unregistered) and complete.
  test('all_four_transfer_adapters_resolve_and_complete', async () => {
    for (const [i, adapterId] of TRANSFER_ADAPTER_IDS.entries()) {
      const runId = `run-transfer-all-${i}`;
      const result = await runCheck({
        store,
        registry: CHECK_RUNNER_REGISTRY,
        request: request(adapterId, `chk-${i}`),
        runContext: runContext(runId),
      });
      // allowlisted_executable skips on a non-prepared problem — but it RESOLVED (ran its impl), not the
      // frozen-gate 'unregistered_adapter' skip; the others pass/fail. Either way: not unregistered.
      expect(result.skipReason).not.toBe('unregistered_adapter');
      const rows = await store.readByRun(runId);
      expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
    }
  });
});
