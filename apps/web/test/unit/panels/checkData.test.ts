import { describe, expect, it } from 'vitest';
import type { CheckResult, RunEventEnvelope } from '@doppl/contracts';
import { deriveChecksByCandidate } from '../../../src/panels/checkData';
import { makeEvent } from '../../fixtures/events';

function checkEvent(
  sequence: number,
  candidateId: string,
  checkType: string,
  status: CheckResult['status'],
  overrides: Record<string, unknown> = {},
): RunEventEnvelope {
  return makeEvent(sequence, 'check.completed', {
    candidateId,
    payload: {
      id: `chk_${sequence}`,
      candidateId,
      checkType,
      status,
      evidenceRefs: [],
      ...overrides,
    },
  });
}

describe('checkData — deriveChecksByCandidate (emit-only, §6 events-derived)', () => {
  // spec(§7/§4): collect CheckResult per candidateId from check.completed, ordered by first-seen sequence.
  it('test_derive_checks_by_candidate', () => {
    const map = deriveChecksByCandidate([
      checkEvent(3, 'cand_0', 'math_check', 'passed'),
      checkEvent(1, 'cand_0', 'citation_check', 'failed', { output: 'no source' }),
      checkEvent(2, 'cand_1', 'exec_check', 'skipped', { skipReason: 'unregistered runner' }),
    ]);
    expect([...map.keys()]).toEqual(['cand_0', 'cand_1']); // first-seen seq: cand_0@1, cand_1@2
    const c0 = map.get('cand_0')!;
    expect(c0.map((c) => c.checkType)).toEqual(['citation_check', 'math_check']); // seq order 1,3
  });

  // spec(rule #3/#6 emit-only): status read VERBATIM — a 'failed' check with a high score stays 'failed'
  // (the panel/selector never re-derives pass/fail from output/score).
  it('test_emit_only_status_verbatim', () => {
    const c = deriveChecksByCandidate([
      checkEvent(1, 'cand_0', 'math_check', 'failed', { score: 0.95, output: 'looks great' }),
    ]).get('cand_0')![0]!;
    expect(c.status).toBe('failed'); // NOT re-judged to 'passed' from score 0.95
  });

  // partial-data: zero check.completed → empty map; a malformed payload is skipped (no throw). A non-
  // skipped result carrying a skipReason fails the frozen superRefine → also skipped defensively.
  it('test_zero_and_malformed', () => {
    expect(deriveChecksByCandidate([]).size).toBe(0);
    const bad = makeEvent(1, 'check.completed', {
      candidateId: 'cand_0',
      payload: { not: 'a-check' },
    });
    const invalidSkip = checkEvent(2, 'cand_0', 'm', 'passed', { skipReason: 'nope' }); // IFF-skipped violation
    expect(deriveChecksByCandidate([bad, invalidSkip]).size).toBe(0);
  });
});
