import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import type { CheckRunnerInput } from '../../../../src/check-runners/registry';
import {
  ALLOWLISTED_EXECUTABLE_ADAPTER_ID,
  PREPARED_PROBLEM_ALLOWLIST,
  allowlistedExecutableCheck,
} from '../../../../src/check-runners/transfer/allowlisted-executable';

/**
 * P4.9 transfer check adapter — allowlisted-executable (ARCHITECTURE.md §7/§14, KEY SAFETY RULE #3). Runs
 * ONLY when `executableCheckIdea` is present AND the (normalized) targetProblem is in the fixed prepared
 * allowlist; otherwise `skipped` with a reason. It NEVER executes candidate-supplied code — it is a
 * deterministic prepared check, not an evaluator.
 */

// A prepared problem (membership is by normalized targetProblem against the fixed allowlist). A literal,
// guarded below to be in the allowlist — so a future allowlist change fails the guard loudly.
const PREPARED_PROBLEM = 'toy sorting problem';

const BASE: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: PREPARED_PROBLEM,
  transferMapping: 'map antibody refinement to iterative candidate ranking',
  expectedMechanism: 'progressive selection improves ranking quality',
  executableCheckIdea: 'a prepared deterministic verification harness',
};

function input(payload: unknown, candidateOverride?: string): CheckRunnerInput {
  return {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'transfer.allowlisted_executable',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
}

describe('allowlistedExecutableCheck — prepared-only, never executes candidate code (rule #3)', () => {
  // guard: the test fixture problem really is in the fixed allowlist (else the pass test is vacuous).
  test('prepared_problem_fixture_is_in_allowlist', () => {
    expect(PREPARED_PROBLEM_ALLOWLIST.has(PREPARED_PROBLEM)).toBe(true);
  });

  // spec(§7) — positive guard first (lesson 10): a prepared problem WITH an executableCheckIdea runs.
  test('allowlisted_executable_runs_for_prepared', () => {
    const result = allowlistedExecutableCheck(input(BASE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — no executableCheckIdea → skipped with a reason (the adapter is not applicable).
  test('allowlisted_executable_skips_without_executable_idea', () => {
    const { executableCheckIdea: _omit, ...noIdea } = BASE;
    void _omit;
    const result = allowlistedExecutableCheck(input(noIdea));
    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBeDefined();
  });

  // spec(§7)/§14 — an UNPREPARED problem (not in the allowlist) → skipped with a reason; never runs.
  test('allowlisted_executable_skips_unprepared_problem', () => {
    const result = allowlistedExecutableCheck(
      input({ ...BASE, targetProblem: 'an arbitrary unprepared problem' }),
    );
    expect(result.status).toBe('skipped');
    expect(result.skipReason).toBeDefined();
  });

  // spec(§14) rule #3 — candidate-supplied code is NEVER executed: a malicious executableCheckIdea has
  // no side effect (no global mutation, no throw) — the adapter only reads it as DATA.
  test('allowlisted_executable_never_executes_candidate_code', () => {
    const sentinel = '__doppl_p4_9_pwned__';
    const malicious = {
      ...BASE,
      executableCheckIdea: `globalThis['${sentinel}'] = true; throw new Error('pwned')`,
    };
    expect(() => allowlistedExecutableCheck(input(malicious))).not.toThrow();
    expect((globalThis as Record<string, unknown>)[sentinel]).toBeUndefined();
  });

  // spec(§7) rule #3 — unparseable candidate fails, never throws.
  test('allowlisted_executable_invalid_payload_fails_not_throws', () => {
    expect(() => allowlistedExecutableCheck(input(null, 'nope'))).not.toThrow();
    expect(allowlistedExecutableCheck(input(null, 'nope')).status).toBe('failed');
  });

  // lesson 28 — deterministic.
  test('allowlisted_executable_is_deterministic', () => {
    expect(allowlistedExecutableCheck(input(BASE))).toEqual(
      allowlistedExecutableCheck(input(BASE)),
    );
  });

  test('allowlisted_executable_adapter_id_is_stable', () => {
    expect(ALLOWLISTED_EXECUTABLE_ADAPTER_ID).toBe('transfer.allowlisted_executable');
  });
});
