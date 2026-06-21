import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CheckResult } from '@doppl/contracts';
import type { ZeitgeistSynthesisPayload } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../../src/event-store';
import { CHECK_RUNNER_REGISTRY } from '../../../../src/check-runners/registry';
import { runCheck } from '../../../../src/check-runners/run-check';
import { ZEITGEIST_NOVELTY_ADAPTER_ID } from '../../../../src/check-runners/zeitgeist/novelty';
import { ZEITGEIST_TIMING_ADAPTER_ID } from '../../../../src/check-runners/zeitgeist/timing';
import { ZEITGEIST_COHERENCE_ADAPTER_ID } from '../../../../src/check-runners/zeitgeist/coherence';

/**
 * P4.10 zeitgeist check adapters — integration (testcontainers, real PG). Each registered adapter runs
 * end-to-end through the UNCHANGED P4.5 runCheck harness: check.started + one validated check.completed
 * via the real append path. spec(§7/§4); lesson 28/32. Mirrors append.test.ts / the P4.9 integration.
 */

const PAYLOAD: ZeitgeistSynthesisPayload = {
  thesis: 'on-device language models replace cloud inference for privacy-sensitive consumer apps',
  audience: 'mobile product teams',
  currentSignals: ['neural processing units shipping in consumer phones'],
  whyNow: 'on-device neural inference is now viable for consumer apps',
  falsifiablePredictions: ['flagship phones run a local language model assistant by 2027'],
  comparablePriorArt: ['federated learning research'],
};

const ZEITGEIST_ADAPTER_IDS = [
  ZEITGEIST_NOVELTY_ADAPTER_ID,
  ZEITGEIST_TIMING_ADAPTER_ID,
  ZEITGEIST_COHERENCE_ADAPTER_ID,
];

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function request(adapterId: string, resultId: string) {
  return { adapterId, checkType: adapterId, resultId, candidate: JSON.stringify(PAYLOAD) };
}

function runContext(runId: string) {
  return { runId, generationId: 'gen_1', candidateId: 'cand_z' };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('zeitgeist adapters through the real runCheck harness', () => {
  // spec(§7/§4) — a registered zeitgeist adapter runs through the harness: check.started + one validated
  // check.completed land in order via the real append path.
  test('registered_zeitgeist_adapter_runs_through_harness', async () => {
    const runId = 'run-zeitgeist-harness';
    await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: request(ZEITGEIST_NOVELTY_ADAPTER_ID, 'chk-nov'),
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
    const completed = rows.find((r) => r.type === 'check.completed');
    const parsed = CheckResult.safeParse(completed?.payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.status : null).not.toBe('skipped');
  });

  // spec(§7) — all three zeitgeist ids resolve to their impl (not skipped-unregistered) and complete.
  test('all_three_zeitgeist_adapters_resolve_and_complete', async () => {
    for (const [i, adapterId] of ZEITGEIST_ADAPTER_IDS.entries()) {
      const runId = `run-zeitgeist-all-${i}`;
      const result = await runCheck({
        store,
        registry: CHECK_RUNNER_REGISTRY,
        request: request(adapterId, `chk-z-${i}`),
        runContext: runContext(runId),
      });
      expect(result.skipReason).not.toBe('unregistered_adapter');
      const rows = await store.readByRun(runId);
      expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
    }
  });
});
