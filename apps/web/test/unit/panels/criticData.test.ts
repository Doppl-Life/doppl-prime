import { describe, expect, it } from 'vitest';
import type { CriticMandate, RunEventEnvelope } from '@doppl/contracts';
import { deriveReviewsByCandidate } from '../../../src/panels/criticData';
import { makeEvent } from '../../fixtures/events';

function reviewEvent(
  sequence: number,
  candidateId: string,
  mandate: CriticMandate,
  confidence: number,
  overrides: Record<string, unknown> = {},
): RunEventEnvelope {
  return makeEvent(sequence, 'critic.reviewed', {
    candidateId,
    payload: {
      id: `crev_${sequence}`,
      candidateId,
      mandate,
      scores: { rigor: 0.8 },
      critique: `critique ${sequence}`,
      confidence,
      evidenceRefs: [],
      ...overrides,
    },
  });
}

describe('criticData — deriveReviewsByCandidate (emit-only, §6 events-derived)', () => {
  // spec(§7/§4): collect CriticReview per candidateId from critic.reviewed, ordered by first-seen sequence.
  it('test_derive_reviews_by_candidate', () => {
    const map = deriveReviewsByCandidate([
      reviewEvent(3, 'cand_0', 'feasibility', 0.6),
      reviewEvent(1, 'cand_0', 'factual_grounding', 0.9),
      reviewEvent(2, 'cand_1', 'novelty_prior_art', 0.7),
    ]);
    // candidate key order = first-seen sequence: cand_0 (seq 1) before cand_1 (seq 2).
    expect([...map.keys()]).toEqual(['cand_0', 'cand_1']);
    const c0 = map.get('cand_0')!;
    expect(c0.map((r) => r.mandate)).toEqual(['factual_grounding', 'feasibility']); // ordered by seq (1,3)
    expect(c0[0]!.confidence).toBe(0.9);
  });

  // spec(rule #6 emit-only): the selector returns each CriticReview VERBATIM — exactly the 7 frozen
  // fields, NO derived winner/verdict/selection/scoreOverride.
  it('test_emit_only_verbatim_no_verdict', () => {
    const r = deriveReviewsByCandidate([reviewEvent(1, 'cand_0', 'falsification', 0.5)]).get(
      'cand_0',
    )![0]!;
    expect(Object.keys(r).sort()).toEqual(
      ['candidateId', 'confidence', 'critique', 'evidenceRefs', 'id', 'mandate', 'scores'].sort(),
    );
    expect(r).toMatchObject({ candidateId: 'cand_0', mandate: 'falsification', confidence: 0.5 });
  });

  // partial-data: zero critic.reviewed → empty map; a malformed payload is skipped (no throw).
  it('test_zero_and_malformed', () => {
    expect(deriveReviewsByCandidate([]).size).toBe(0);
    const bad = makeEvent(1, 'critic.reviewed', {
      candidateId: 'cand_0',
      payload: { not: 'a-review' },
    });
    expect(deriveReviewsByCandidate([bad]).size).toBe(0);
  });
});
