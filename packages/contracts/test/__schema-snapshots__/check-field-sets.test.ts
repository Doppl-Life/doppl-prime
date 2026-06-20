// P0.7 — §2.5 cross-track schema-snapshot gate for the check contracts. SAFETY-relevant: the
// CheckRunnerAdapter field set IS the non-executing pin (rule #3) — a code-carrying field appearing
// here is a Step-9 Finding. spec(§7) spec(§2.5): CheckResult field-set(9), CheckStatus(3), and
// CheckRunnerAdapter field-set(4) each equal a checked-in frozen snapshot — drift fails HERE before
// the check-runners/selection tracks consume these models.
import { describe, it, expect } from 'vitest';
import {
  CheckResult,
  CheckStatus,
  CheckRunnerAdapter,
  resolveCheckAdapter,
} from '@doppl/contracts';

const CHECK_RESULT_FIELD_SNAPSHOT = [
  'id',
  'candidateId',
  'checkType',
  'status',
  'score',
  'output',
  'skipReason',
  'evidenceRefs',
  'error',
];

const CHECK_STATUS_SNAPSHOT = ['passed', 'failed', 'skipped'];

const CHECK_RUNNER_ADAPTER_FIELD_SNAPSHOT = ['id', 'checkType', 'subtype', 'label'];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — CheckResult / CheckStatus / CheckRunnerAdapter (spec §7 / §2.5)', () => {
  it('barrel_exports_check_contracts', () => {
    // spec(§2.5): the public surface re-exports each schema + the allowlist gate from one barrel.
    expect(typeof CheckResult.parse).toBe('function');
    expect(typeof CheckStatus.parse).toBe('function');
    expect(typeof CheckRunnerAdapter.parse).toBe('function');
    expect(typeof resolveCheckAdapter).toBe('function');
  });

  it('schema_snapshot_check_result_adapter', () => {
    // CheckResult is a strictObject + superRefine; in zod v4 the refinement preserves `.shape`.
    expect(sorted(Object.keys(CheckResult.shape))).toEqual(sorted(CHECK_RESULT_FIELD_SNAPSHOT));
    expect(sorted(CheckStatus.options)).toEqual(sorted(CHECK_STATUS_SNAPSHOT));
    expect(sorted(Object.keys(CheckRunnerAdapter.shape))).toEqual(
      sorted(CHECK_RUNNER_ADAPTER_FIELD_SNAPSHOT),
    );
    expect(CHECK_RESULT_FIELD_SNAPSHOT).toHaveLength(9);
    expect(CHECK_STATUS_SNAPSHOT).toHaveLength(3);
    expect(CHECK_RUNNER_ADAPTER_FIELD_SNAPSHOT).toHaveLength(4);
  });
});
