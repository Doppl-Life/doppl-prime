import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { AppendInput, AppendResult, EventStore, RunEventRow } from '../../../src/event-store';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import {
  runCheck,
  type CheckRequest,
  type CheckRunContext,
} from '../../../src/check-runners/run-check';
import {
  LIVE_NO_FALLBACK_REASON,
  liveRerun,
  type LiveAttempt,
} from '../../../src/check-runners/live-rerun';

/**
 * P4.11 live allowlisted-check re-run + replay-backed fallback (ARCHITECTURE.md §7/§9/§17, KEY SAFETY
 * RULE #7). liveRerun tries the live re-run through the SAME runCheck registry path; on stall/fail (throw
 * or skipped) it serves the most-recent recorded usable check.completed CheckResult from the authoritative
 * store (readByRun) — no provider re-sample, no new append, never fabricated.
 */

const RUN_CONTEXT: CheckRunContext = {
  runId: 'run_1',
  generationId: 'gen_1',
  candidateId: 'cand_1',
};
const REQUEST: CheckRequest = {
  adapterId: 'transfer.source_validity',
  checkType: 'transfer.source_validity',
  resultId: 'live_1',
  candidate: JSON.stringify({ sourceDomain: 'a', targetDomain: 'b' }),
};

function result(status: 'passed' | 'failed' | 'skipped', id: string, output: string): CheckResult {
  const base = {
    id,
    candidateId: 'cand_1',
    checkType: 'transfer.source_validity',
    evidenceRefs: [],
  };
  return status === 'skipped'
    ? { ...base, status, skipReason: 'some_reason' }
    : { ...base, status, score: status === 'passed' ? 1 : 0, output };
}

function recordedRow(checkResult: CheckResult, sequence: number): RunEventRow {
  return {
    id: `evt-${sequence}`,
    runId: 'run_1',
    type: 'check.completed',
    sequence,
    actor: 'check_runner',
    payload: checkResult,
    schemaVersion: 2,
  } as unknown as RunEventRow;
}

function makeFakeStore(recorded: RunEventRow[] = []) {
  const appended: AppendInput[] = [];
  let readByRunCalls = 0;
  const store: EventStore = {
    append(input: AppendInput): Promise<AppendResult> {
      appended.push(input);
      return Promise.resolve({ id: input.id, runId: input.runId, sequence: appended.length - 1 });
    },
    readByRun(): Promise<RunEventRow[]> {
      readByRunCalls += 1;
      return Promise.resolve(recorded);
    },
  };
  return { store, appended, calls: () => readByRunCalls };
}

const liveReturns =
  (r: CheckResult): LiveAttempt =>
  () =>
    Promise.resolve(r);
const liveThrows: LiveAttempt = () => Promise.reject(new Error('live stall'));

describe('liveRerun — live re-run else replay-backed fallback (rule #7)', () => {
  // spec(§7) — positive guard first (lesson 10): a usable live result (passed/failed) is returned; the
  // recorded fallback is NOT consulted (readByRun not called).
  test('live_usable_result_returned', async () => {
    const fake = makeFakeStore([recordedRow(result('failed', 'rec_1', 'old'), 0)]);
    const fresh = result('passed', 'live_1', 'fresh live pass');
    const served = await liveRerun({
      store: fake.store,
      registry: CHECK_RUNNER_REGISTRY,
      request: REQUEST,
      runContext: RUN_CONTEXT,
      liveAttempt: liveReturns(fresh),
    });
    expect(served).toEqual(fresh);
    expect(fake.calls()).toBe(0);
  });

  // spec(§7/§9) — a live attempt that THROWS → the most-recent recorded usable check.completed is served.
  test('live_fail_serves_recorded_fallback', async () => {
    const recorded = result('passed', 'rec_1', 'recorded pass');
    const fake = makeFakeStore([recordedRow(recorded, 0)]);
    const served = await liveRerun({
      store: fake.store,
      registry: CHECK_RUNNER_REGISTRY,
      request: REQUEST,
      runContext: RUN_CONTEXT,
      liveAttempt: liveThrows,
    });
    expect(served).toEqual(recorded);
  });

  // spec(rule #7) — on the fallback path no append occurs (only readByRun) — the recorded result is served
  // verbatim, never re-sampled, never re-persisted.
  test('fallback_reads_no_resample_no_append', async () => {
    const fake = makeFakeStore([recordedRow(result('failed', 'rec_1', 'rec'), 0)]);
    await liveRerun({
      store: fake.store,
      registry: CHECK_RUNNER_REGISTRY,
      request: REQUEST,
      runContext: RUN_CONTEXT,
      liveAttempt: liveThrows,
    });
    expect(fake.appended).toHaveLength(0);
    expect(fake.calls()).toBe(1);
  });

  // spec(§7) — live fails AND no recorded result → a non-fabricated skipped signal, never an invented pass.
  test('no_recorded_result_non_fabricated', async () => {
    const fake = makeFakeStore([]);
    const served = await liveRerun({
      store: fake.store,
      registry: CHECK_RUNNER_REGISTRY,
      request: REQUEST,
      runContext: RUN_CONTEXT,
      liveAttempt: liveThrows,
    });
    expect(CheckResult.safeParse(served).success).toBe(true);
    expect(served.status).toBe('skipped');
    expect(served.skipReason).toBe(LIVE_NO_FALLBACK_REASON);
  });

  // spec(§7) — a recorded SKIP is not a usable verdict: a live skip + only a recorded skip → non-fabricated
  // signal (the live attempt's own skip never becomes the fallback either).
  test('recorded_skip_is_not_a_usable_fallback', async () => {
    const fake = makeFakeStore([recordedRow(result('skipped', 'rec_skip', ''), 0)]);
    const served = await liveRerun({
      store: fake.store,
      registry: CHECK_RUNNER_REGISTRY,
      request: REQUEST,
      runContext: RUN_CONTEXT,
      liveAttempt: liveReturns(result('skipped', 'live_1', '')),
    });
    expect(served.status).toBe('skipped');
    expect(served.skipReason).toBe(LIVE_NO_FALLBACK_REASON);
  });

  // spec(§7) rule #3 — gated to allowlisted: an unregistered adapter id through the REAL runCheck resolves
  // to skipped (the frozen gate; the impl is NEVER executed) → not a usable live result → fallback/surfaced.
  test('unregistered_adapter_not_live_run', async () => {
    const fake = makeFakeStore([]);
    const served = await liveRerun({
      store: fake.store,
      registry: CHECK_RUNNER_REGISTRY,
      request: { ...REQUEST, adapterId: 'no.such.adapter', checkType: 'no.such.adapter' },
      runContext: RUN_CONTEXT,
      liveAttempt: runCheck,
    });
    // the live runCheck emitted check.started + a skipped check.completed (unregistered) — never executed
    // an impl; liveRerun then has no usable verdict + no recorded fallback → non-fabricated skip.
    expect(served.status).toBe('skipped');
    expect(served.skipReason).toBe(LIVE_NO_FALLBACK_REASON);
  });

  // spec(§9) — with multiple recorded usable check.completed, the latest (highest sequence) is served.
  test('most_recent_recorded_result_selected', async () => {
    const older = result('failed', 'rec_old', 'older verdict');
    const newer = result('passed', 'rec_new', 'newer verdict');
    const fake = makeFakeStore([recordedRow(older, 0), recordedRow(newer, 2)]);
    const served = await liveRerun({
      store: fake.store,
      registry: CHECK_RUNNER_REGISTRY,
      request: REQUEST,
      runContext: RUN_CONTEXT,
      liveAttempt: liveThrows,
    });
    expect(served).toEqual(newer);
  });
});
