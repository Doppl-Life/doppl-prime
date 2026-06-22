import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import type { CheckRunnerInput } from '../../../../src/check-runners/registry';
import {
  TARGET_FIT_ADAPTER_ID,
  targetFitCheck,
} from '../../../../src/check-runners/transfer/target-fit';

/**
 * P4.9 transfer check adapter — target-fit (ARCHITECTURE.md §7, rule #3 pure adapter). Passes iff the
 * transferMapping/expectedMechanism reference the target (deterministic token overlap with
 * targetDomain/targetProblem ≥ a fixed threshold).
 */

const BASE: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start ranking',
  transferMapping: 'map antibody refinement to iterative ranking for cold-start users',
  expectedMechanism: 'progressive selection improves ranking quality',
};

function input(payload: unknown, candidateOverride?: string): CheckRunnerInput {
  return {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'transfer.target_fit',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
}

describe('targetFitCheck — mapping references the target (rule #3 pure adapter)', () => {
  // spec(§7) — positive guard first (lesson 10): mapping/mechanism share tokens with target → passed.
  test('target_fit_passes_when_mapping_references_target', () => {
    const result = targetFitCheck(input(BASE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — mapping/mechanism unrelated to the target (no token overlap) → failed.
  test('target_fit_fails_when_unrelated', () => {
    const result = targetFitCheck(
      input({
        ...BASE,
        targetDomain: 'horticulture',
        targetProblem: 'orchard irrigation',
        transferMapping: 'apply antibody refinement to antibody refinement steps',
        expectedMechanism: 'selection improves selection outcomes',
      }),
    );
    expect(result.status).toBe('failed');
  });

  // spec(§7) rule #3 — unparseable candidate fails, never throws.
  test('target_fit_invalid_payload_fails_not_throws', () => {
    expect(() => targetFitCheck(input(null, '{bad'))).not.toThrow();
    expect(targetFitCheck(input(null, '{bad')).status).toBe('failed');
  });

  // lesson 28 — deterministic.
  test('target_fit_is_deterministic', () => {
    expect(targetFitCheck(input(BASE))).toEqual(targetFitCheck(input(BASE)));
  });

  test('target_fit_adapter_id_is_stable', () => {
    expect(TARGET_FIT_ADAPTER_ID).toBe('transfer.target_fit');
  });
});
