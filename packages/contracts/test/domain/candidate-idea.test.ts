// P0.5 — CandidateIdea: the canonical unit of work (ARCHITECTURE.md §3). Modeled as a
// z.discriminatedUnion on `subtype` so the subtype⟺subtypePayload correlation is structurally
// unrepresentable-when-wrong (a mismatched pair cannot parse). spec(§3): one 9-state lifecycle
// [P0.5-amend: +repairing] shared by both subtypes; the schema encodes SHAPE only (transitions are
// the kernel's, P3).
import { describe, it, expect } from 'vitest';
import { CandidateIdea, CandidateStatus } from '@doppl/contracts';

const cdtPayload = {
  sourceDomain: 'immunology',
  sourceTechnique: 'clonal selection',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start personalization',
  transferMapping: 'antigens→items, antibodies→user-affinity vectors',
  expectedMechanism: 'affinity maturation surfaces niche items faster than CF',
  executableCheckIdea: 'A/B vs CF baseline on held-out cold-start users',
};

const zeitPayload = {
  thesis: 'On-device LLM inference reshapes privacy-first consumer apps',
  audience: 'mobile product teams',
  currentSignals: ['NPU ubiquity', 'sub-3B models matching GPT-3.5 on narrow tasks'],
  whyNow: 'silicon + small-model quality crossed the usability threshold in 2026',
  falsifiablePredictions: ['>30% of new note apps ship on-device inference within 18mo'],
  comparablePriorArt: ['spell-check moving on-device'],
};

const baseShared = {
  id: 'cand_1',
  runId: 'run_1',
  generationId: 'gen_1',
  agenomeId: 'agn_1',
  title: 'Immune-inspired cold-start recommender',
  summary: 'Apply affinity maturation to surface niche items for new users.',
  claims: ['CF underperforms on cold-start', 'affinity maturation adapts faster'],
  evidenceRefs: [{ kind: 'prior_art', label: 'AIRS 2003' }],
  status: 'created',
};

const validCdtCandidate = {
  ...baseShared,
  subtype: 'cross_domain_transfer',
  subtypePayload: cdtPayload,
};

const validZeitCandidate = {
  ...baseShared,
  id: 'cand_2',
  subtype: 'zeitgeist_synthesis',
  subtypePayload: zeitPayload,
};

const SHARED_REQUIRED = [
  'id',
  'runId',
  'generationId',
  'agenomeId',
  'subtype',
  'title',
  'summary',
  'claims',
  'evidenceRefs',
  'status',
  'subtypePayload',
] as const;

const STATUS_STATES = [
  'created',
  'repairing', // [P0.5-amend] §3 structured-output repair state
  'under_review',
  'checked',
  'scored',
  'selected',
  'rejected',
  'culled',
  'invalid',
] as const;

describe('CandidateIdea — the canonical unit of work (spec §3)', () => {
  it('candidate_accepts_valid_cdt', () => {
    // spec(§3): a cross_domain_transfer candidate + its matching CDT payload parses + round-trips.
    expect(CandidateIdea.parse(validCdtCandidate)).toEqual(validCdtCandidate);
  });

  it('candidate_accepts_valid_zeit', () => {
    // spec(§3): a zeitgeist_synthesis candidate + its matching Zeit payload parses (second subtype).
    expect(CandidateIdea.parse(validZeitCandidate)).toEqual(validZeitCandidate);
  });

  it('candidate_subtype_payload_correlation_enforced', () => {
    // spec(§3): the discriminated correlation — a subtype paired with the WRONG payload is rejected,
    // in both directions. A mismatched pair is structurally malformed, not merely semantically off.
    expect(() =>
      CandidateIdea.parse({ ...validCdtCandidate, subtypePayload: zeitPayload }),
    ).toThrow();
    expect(() =>
      CandidateIdea.parse({ ...validZeitCandidate, subtypePayload: cdtPayload }),
    ).toThrow();
  });

  it('candidate_status_closed_9_state', () => {
    // spec(§3): status is the closed 9-state lifecycle union [P0.5-amend: +repairing]; any other value
    // is rejected (closure preserved — the amendment is additive, not a loosening, lesson §1).
    for (const s of STATUS_STATES) {
      expect(CandidateStatus.parse(s)).toBe(s);
      expect(CandidateIdea.parse({ ...validCdtCandidate, status: s }).status).toBe(s);
    }
    expect(STATUS_STATES).toHaveLength(9);
    expect(() => CandidateStatus.parse('archived')).toThrow();
    expect(() => CandidateStatus.parse('')).toThrow();
    expect(() => CandidateIdea.parse({ ...validCdtCandidate, status: 'archived' })).toThrow();
  });

  it('candidate_status_includes_repairing', () => {
    // spec(§3) [P0.5-amend]: `repairing` is a first-class candidate state (created→repairing→
    // under_review / repairing→invalid); positive guard `created` still parses; `bogus` still rejected.
    expect(CandidateStatus.parse('created')).toBe('created');
    expect(CandidateStatus.parse('repairing')).toBe('repairing');
    expect(CandidateIdea.parse({ ...validCdtCandidate, status: 'repairing' }).status).toBe(
      'repairing',
    );
    expect(() => CandidateStatus.parse('bogus')).toThrow();
  });

  it('candidate_evidenceRefs_empty_ok_and_claims_nonempty', () => {
    // spec(§3): a fresh candidate has no evidence yet — evidenceRefs:[] parses; claims are
    // non-empty strings, so an empty-string claim is rejected.
    expect(CandidateIdea.parse({ ...validCdtCandidate, evidenceRefs: [] }).evidenceRefs).toEqual(
      [],
    );
    // claims:[] (the EMPTY ARRAY) parses — ≥1-claim is a COUNT invariant the kernel enforces WITH
    // AN EVENT (lesson §6, same class as Agenome parentIds 0–2), NOT a contract constraint. All 4
    // downstream tracks assume a zero-claim candidate is structurally valid.
    expect(CandidateIdea.parse({ ...validCdtCandidate, claims: [] }).claims).toEqual([]);
    expect(() => CandidateIdea.parse({ ...validCdtCandidate, claims: [''] })).toThrow();
    // evidenceRefs entries are validated as EvidenceRef (a bad kind is rejected).
    expect(() =>
      CandidateIdea.parse({ ...validCdtCandidate, evidenceRefs: [{ kind: 'rumor' }] }),
    ).toThrow();
  });

  it('candidate_strict_unknown_and_missing', () => {
    // spec(§3): strict contract within each variant — unknown top-level field rejected; each
    // required field mandatory; candidate-level required strings are non-empty (z.string().min(1)).
    expect(() => CandidateIdea.parse({ ...validCdtCandidate, bogus: 1 })).toThrow();
    expect(() => CandidateIdea.parse({ ...validZeitCandidate, bogus: 1 })).toThrow();
    for (const k of SHARED_REQUIRED) {
      const clone: Record<string, unknown> = { ...validCdtCandidate };
      delete clone[k];
      expect(() => CandidateIdea.parse(clone), `missing ${k}`).toThrow();
    }
    // candidate-level string fields reject empty strings (id/runId/generationId/agenomeId + Q5
    // title/summary). Payload/evidence empty-string rejection is pinned in their own tests.
    for (const k of ['id', 'runId', 'generationId', 'agenomeId', 'title', 'summary'] as const) {
      expect(() => CandidateIdea.parse({ ...validCdtCandidate, [k]: '' }), `empty ${k}`).toThrow();
    }
  });
});
