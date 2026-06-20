// P0.6 — CriticReview: the structured-evidence-only output of a critic (ARCHITECTURE.md §7).
// SAFETY slice. spec(§7): critics emit EVIDENCE ONLY — the strict 7-field set + snapshot make a
// winner-selection / scoring-policy-mutation field structurally unrepresentable (rule #6,
// anti-reward-hacking). The schema encodes SHAPE only; ≥1-evidence is a kernel rule (lesson §6).
import { describe, it, expect } from 'vitest';
import { CriticReview, CriticMandate } from '@doppl/contracts';

const validReview = {
  id: 'rev_1',
  candidateId: 'cand_1',
  mandate: 'factual_grounding',
  scores: { grounding: 4, citations: 3 },
  critique: 'Claims are well-grounded but two citations are weak.',
  confidence: 0.8,
  evidenceRefs: [{ kind: 'check_output', eventId: 'evt_9' }],
};

const MANDATES = [
  'factual_grounding',
  'novelty_prior_art',
  'feasibility',
  'falsification',
  'subtype_specific',
] as const;

const REQUIRED_KEYS = [
  'id',
  'candidateId',
  'mandate',
  'scores',
  'critique',
  'confidence',
  'evidenceRefs',
] as const;

describe('CriticReview — structured evidence only (spec §7)', () => {
  it('critic_mandate_closed_5_union', () => {
    // spec(§7): all 5 mandates parse; any other value is rejected (closed union).
    for (const m of MANDATES) {
      expect(CriticMandate.parse(m)).toBe(m);
      expect(CriticReview.parse({ ...validReview, mandate: m }).mandate).toBe(m);
    }
    expect(MANDATES).toHaveLength(5);
    expect(() => CriticMandate.parse('style')).toThrow();
    expect(() => CriticMandate.parse('')).toThrow();
    expect(() => CriticReview.parse({ ...validReview, mandate: 'style' })).toThrow();
  });

  it('critic_review_accepts_valid_and_strict', () => {
    // spec(§7): a full 7-field review round-trips; unknown top-level field rejected; each required
    // field mandatory.
    expect(CriticReview.parse(validReview)).toEqual(validReview);
    expect(() => CriticReview.parse({ ...validReview, bogus: 1 })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validReview };
      delete clone[k];
      expect(() => CriticReview.parse(clone), `missing ${k}`).toThrow();
    }
    expect(REQUIRED_KEYS).toHaveLength(7);
  });

  it('critic_review_rejects_winner_or_policy_field', () => {
    // spec(§7/§14, safety rule #6): critics CANNOT select winners or mutate scoring policy — those
    // fields are structurally unrepresentable. A strictObject rejects each as an unknown field, so
    // the no-winner/no-policy invariant is pinned by SHAPE, not by a runtime check.
    // Positive guard first: the schema EXISTS and accepts the valid review — so the rejections below
    // fire because the strictObject rejects the extra field, not because the export is missing.
    expect(CriticReview.parse(validReview)).toEqual(validReview);
    expect(() => CriticReview.parse({ ...validReview, winner: true })).toThrow();
    expect(() => CriticReview.parse({ ...validReview, selected: true })).toThrow();
    expect(() => CriticReview.parse({ ...validReview, scoreOverride: 10 })).toThrow();
    expect(() => CriticReview.parse({ ...validReview, policyVersion: 'x' })).toThrow();
  });

  it('critic_review_scores_confidence_evidence', () => {
    // spec(§7): scores is an open string→number record (axis set is the §8 ScoringPolicy's concern);
    // confidence is a [0,1] probability bound; evidenceRefs compose EvidenceRef (a bad kind rejected).
    expect(CriticReview.parse({ ...validReview, scores: {} }).scores).toEqual({});
    expect(() => CriticReview.parse({ ...validReview, scores: { a: 'x' } })).toThrow();
    expect(() => CriticReview.parse({ ...validReview, critique: '' })).toThrow();
    for (const c of [0, 0.5, 1]) {
      expect(CriticReview.parse({ ...validReview, confidence: c }).confidence).toBe(c);
    }
    expect(() => CriticReview.parse({ ...validReview, confidence: 1.5 })).toThrow();
    expect(() => CriticReview.parse({ ...validReview, confidence: -0.1 })).toThrow();
    expect(() =>
      CriticReview.parse({ ...validReview, evidenceRefs: [{ kind: 'rumor' }] }),
    ).toThrow();
  });

  it('critic_review_evidenceRefs_empty_ok', () => {
    // spec(§7): evidenceRefs:[] parses — ≥1-evidence is a kernel explainability rule, NOT a contract
    // constraint (lesson §6, mirrors P0.5 claims:[]/evidenceRefs:[]).
    expect(CriticReview.parse({ ...validReview, evidenceRefs: [] }).evidenceRefs).toEqual([]);
  });
});
