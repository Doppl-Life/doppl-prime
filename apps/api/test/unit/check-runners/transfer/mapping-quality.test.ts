import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import type { CheckRunnerInput } from '../../../../src/check-runners/registry';
import {
  MAPPING_QUALITY_ADAPTER_ID,
  mappingQualityCheck,
} from '../../../../src/check-runners/transfer/mapping-quality';

/**
 * P4.9 transfer check adapter — mapping-quality (ARCHITECTURE.md §7, rule #3 pure adapter). Passes iff
 * BOTH transferMapping and expectedMechanism are substantive by a fixed deterministic heuristic (each ≥
 * a fixed minimum word count). A degenerate one-word mapping fails. (MVP signal; real quality = judge.)
 */

const BASE: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start ranking',
  transferMapping: 'map antibody refinement to iterative candidate ranking',
  expectedMechanism: 'progressive selection improves ranking quality over rounds',
};

function input(payload: unknown, candidateOverride?: string): CheckRunnerInput {
  return {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'transfer.mapping_quality',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
}

describe('mappingQualityCheck — substantive mapping + mechanism (rule #3 pure adapter)', () => {
  // spec(§7) — positive guard first (lesson 10): both fields substantive → passed.
  test('mapping_quality_passes_substantive', () => {
    const result = mappingQualityCheck(input(BASE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — a degenerate one-word transferMapping → failed.
  test('mapping_quality_fails_degenerate', () => {
    const result = mappingQualityCheck(input({ ...BASE, transferMapping: 'mapping' }));
    expect(result.status).toBe('failed');
  });

  // spec(§7) rule #3 — unparseable candidate fails, never throws.
  test('mapping_quality_invalid_payload_fails_not_throws', () => {
    expect(() => mappingQualityCheck(input(null, 'xx'))).not.toThrow();
    expect(mappingQualityCheck(input(null, 'xx')).status).toBe('failed');
  });

  // lesson 28 — deterministic.
  test('mapping_quality_is_deterministic', () => {
    expect(mappingQualityCheck(input(BASE))).toEqual(mappingQualityCheck(input(BASE)));
  });

  test('mapping_quality_adapter_id_is_stable', () => {
    expect(MAPPING_QUALITY_ADAPTER_ID).toBe('transfer.mapping_quality');
  });
});
