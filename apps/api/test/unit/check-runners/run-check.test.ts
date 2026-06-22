import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { AppendInput, AppendResult, EventStore, RunEventRow } from '../../../src/event-store';
import {
  CHECK_RUNNER_REGISTRY,
  EXECUTION_REQUIRING_ADAPTER_ID,
  PREPARED_TOY_ADAPTER_ID,
} from '../../../src/check-runners/registry';
import { EXECUTION_REQUIRED_REASON, runCheck } from '../../../src/check-runners/run-check';

/**
 * P4.5 runCheck harness (KEY SAFETY RULE #3). resolve (frozen gate) → emit check.started marker →
 * run-or-skip the non-executing impl → emit exactly one check.completed carrying the validated
 * CheckResult. Unit slice uses a fake EventStore (the real append-path producer-agreement is the
 * integration slice).
 */

function makeFakeStore() {
  const appended: AppendInput[] = [];
  const store: EventStore = {
    append(input: AppendInput): Promise<AppendResult> {
      appended.push(input);
      return Promise.resolve({ id: input.id, runId: input.runId, sequence: appended.length - 1 });
    },
    readByRun(): Promise<RunEventRow[]> {
      return Promise.resolve([]);
    },
  };
  return { store, appended };
}

const RUN_CONTEXT = { runId: 'run_1', generationId: 'gen_1', candidateId: 'cand_1' };

describe('runCheck — resolve → started → run-or-skip → completed (rule #3)', () => {
  // spec(§7) acceptance #4 — a registered non-executing adapter runs deterministically: the same input
  // twice yields identical schema-valid CheckResults.
  test('test_registered_adapter_runs_deterministically', async () => {
    const request = {
      adapterId: PREPARED_TOY_ADAPTER_ID,
      checkType: 'prepared_deterministic_toy',
      resultId: 'chk_det',
      candidate: 'a candidate idea under check',
    };
    const a = await runCheck({
      store: makeFakeStore().store,
      registry: CHECK_RUNNER_REGISTRY,
      request,
      runContext: RUN_CONTEXT,
    });
    const b = await runCheck({
      store: makeFakeStore().store,
      registry: CHECK_RUNNER_REGISTRY,
      request,
      runContext: RUN_CONTEXT,
    });
    expect(CheckResult.safeParse(a).success).toBe(true);
    expect(a).toEqual(b);
    expect(a.status).not.toBe('skipped');
  });

  // spec(§7) / §14 rule #3 — a registered descriptor with NO non-executing impl is recorded `skipped`
  // with a fixed reason (no code path executes); the skip still emits started + completed (never silent).
  test('test_execution_requiring_adapter_skipped_with_reason', async () => {
    const { store, appended } = makeFakeStore();
    const result = await runCheck({
      store,
      registry: CHECK_RUNNER_REGISTRY,
      request: {
        adapterId: EXECUTION_REQUIRING_ADAPTER_ID,
        checkType: 'prepared_execution_requiring',
        resultId: 'chk_exec',
        candidate: 'x',
      },
      runContext: RUN_CONTEXT,
    });
    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBe(EXECUTION_REQUIRED_REASON);
    expect(appended.map((e) => e.type)).toEqual(['check.started', 'check.completed']);
    expect(appended[1]?.payload ?? {}).toMatchObject({
      status: 'skipped',
      skipReason: EXECUTION_REQUIRED_REASON,
    });
  });
});
