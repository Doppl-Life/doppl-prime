import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CheckResult } from '@doppl/contracts';
import { createEventStore, type EventStore } from '../../../src/event-store';
import {
  CHECK_RUNNER_REGISTRY,
  PREPARED_TOY_ADAPTER_ID,
} from '../../../src/check-runners/registry';
import { runCheck } from '../../../src/check-runners/run-check';

/**
 * P4.5 check-runner harness — integration (testcontainers, real PG). Safety-invariant (rule #3 allowlist
 * + no arbitrary code execution). spec(§4) check.started→check.completed marker pairing through the real
 * P1.3 append path; spec(§7) the persisted completed payload is a validated CheckResult. Mirrors
 * append.test.ts (P1.4 schema/append-only trigger/sequence allocator).
 */

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

function runContext(runId: string, candidateId = 'cand_1') {
  return { runId, generationId: 'gen_1', candidateId };
}

function toyRequest(resultId: string) {
  return {
    adapterId: PREPARED_TOY_ADAPTER_ID,
    checkType: 'prepared_deterministic_toy',
    resultId,
    candidate: 'a candidate idea under check',
  };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('runCheck — events through the real append path', () => {
  // spec(§4) — one runCheck emits exactly two events: check.started (actor check_runner, generic
  // payload) at sequence N then check.completed at N+1 (operation-start marker pairing).
  test('test_started_then_completed_emitted_in_order', async () => {
    const runId = 'run-cr-order';
    await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: toyRequest('chk-order'),
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
    expect(rows.map((r) => r.sequence)).toEqual([0, 1]);
    expect(rows.map((r) => r.actor)).toEqual(['check_runner', 'check_runner']);
  });

  // spec(§7) — the persisted check.completed payload is a validated CheckResult and EQUALS the produced
  // result (producer-agreement, lesson 20; payload-map check.completed→CheckResult narrows on append).
  test('test_completed_payload_is_validated_checkresult', async () => {
    const runId = 'run-cr-payload';
    const produced = await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: toyRequest('chk-payload'),
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    const completed = rows.find((r) => r.type === 'check.completed');
    const parsed = CheckResult.safeParse(completed?.payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data : null).toEqual(produced);
  });

  // spec(§7) — the skip path (unregistered id) STILL emits started + completed carrying the skipped
  // CheckResult (a skip is recorded, never silent and never an error-free pass).
  test('test_skip_path_still_emits_completed_with_skipped_result', async () => {
    const runId = 'run-cr-skip';
    await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: {
        adapterId: 'no.such.adapter',
        checkType: 'unknown_check',
        resultId: 'chk-skip',
        candidate: 'idea',
      },
      runContext: runContext(runId),
    });
    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.type)).toEqual(['check.started', 'check.completed']);
    const completed = rows.find((r) => r.type === 'check.completed');
    const parsed = CheckResult.safeParse(completed?.payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.status : null).toBe('skipped');
  });

  // spec(§4) rule #8 — the operation-start marker debits NO energy: only check.started + check.completed
  // land for the invocation; no energy.spent / EnergyEvent is emitted.
  test('test_marker_debits_no_energy', async () => {
    const runId = 'run-cr-energy';
    await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: toyRequest('chk-energy'),
      runContext: runContext(runId),
    });
    const types = (await store.readByRun(runId)).map((r) => r.type);
    expect(types).toEqual(['check.started', 'check.completed']);
    expect(types).not.toContain('energy.spent');
  });
});
