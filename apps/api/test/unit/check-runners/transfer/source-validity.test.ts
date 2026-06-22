import { describe, expect, test } from 'vitest';
import { CheckResult } from '@doppl/contracts';
import type { CrossDomainTransferPayload } from '@doppl/contracts';
import type { CheckRunnerInput } from '../../../../src/check-runners/registry';
import {
  SOURCE_VALIDITY_ADAPTER_ID,
  sourceValidityCheck,
} from '../../../../src/check-runners/transfer/source-validity';

/**
 * P4.9 cross-domain-transfer check adapter — source-domain-validity (ARCHITECTURE.md §7, rule #3 — a
 * pure non-executing CheckRunner). Parses the candidate as a CrossDomainTransferPayload (DATA, never
 * executed) and passes iff the transfer crosses domains (sourceDomain ≠ targetDomain, normalized).
 */

const BASE: CrossDomainTransferPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'affinity maturation',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start ranking',
  transferMapping: 'map antibody refinement to iterative candidate ranking',
  expectedMechanism: 'progressive selection improves ranking quality',
};

function input(payload: unknown, candidateOverride?: string): CheckRunnerInput {
  return {
    resultId: 'chk_1',
    candidateId: 'cand_1',
    checkType: 'transfer.source_validity',
    candidate: candidateOverride ?? JSON.stringify(payload),
  };
}

describe('sourceValidityCheck — transfer must cross domains (rule #3 pure adapter)', () => {
  // spec(§7) — positive guard first (lesson 10): a genuine cross-domain transfer passes.
  test('source_validity_passes_cross_domain', () => {
    const result = sourceValidityCheck(input(BASE));
    expect(CheckResult.safeParse(result).success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // spec(§7) — a same-domain "transfer" (case/whitespace-normalized equal) fails.
  test('source_validity_fails_same_domain', () => {
    const result = sourceValidityCheck(
      input({
        ...BASE,
        sourceDomain: 'Recommender Systems',
        targetDomain: '  recommender systems ',
      }),
    );
    expect(result.status).toBe('failed');
  });

  // spec(§7) rule #3 — an unparseable candidate fails, never throws, never executes.
  test('source_validity_invalid_payload_fails_not_throws', () => {
    expect(() => sourceValidityCheck(input(null, 'not-json{'))).not.toThrow();
    const result = sourceValidityCheck(input(null, 'not-json{'));
    expect(result.status).toBe('failed');
    expect(CheckResult.safeParse(result).success).toBe(true);
  });

  // lesson 28 — pure/deterministic: same input → identical CheckResult.
  test('source_validity_is_deterministic', () => {
    expect(sourceValidityCheck(input(BASE))).toEqual(sourceValidityCheck(input(BASE)));
  });

  test('source_validity_adapter_id_is_stable', () => {
    expect(SOURCE_VALIDITY_ADAPTER_ID).toBe('transfer.source_validity');
  });
});
