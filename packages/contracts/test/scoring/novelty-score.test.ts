// P0.8 — NoveltyScore: the authoritative novelty measurement (ARCHITECTURE.md §8). SAFETY-relevant
// (rule #7 replay-determinism). spec(§4/§9): `vector` is the authoritative-ONCE-COMPUTED persisted
// float array (+ embeddingModelId + dimension provenance) so replay reads the stored vector and
// NEVER re-embeds. The schema encodes SHAPE only — vector.length===dimension is a kernel relation
// (lesson §6), not a schema constraint.
import { describe, it, expect } from 'vitest';
import { NoveltyScore } from '@doppl/contracts';

const validNovelty = {
  id: 'nov_1',
  candidateId: 'cand_1',
  vector: [0.12, -0.4, 0.91],
  embeddingModelId: 'text-embedding-3-small',
  dimension: 3,
  comparisonSet: ['cand_2', 'cand_3'],
  method: 'cosine',
  score: 0.72,
  explanation: 'Distinct from the 2 nearest prior candidates.',
};

const REQUIRED_KEYS = [
  'id',
  'candidateId',
  'vector',
  'embeddingModelId',
  'dimension',
  'comparisonSet',
  'method',
  'score',
  'explanation',
] as const;

describe('NoveltyScore — authoritative novelty measurement (spec §8)', () => {
  it('novelty_score_accepts_valid_and_strict', () => {
    // spec(§8): positive guard first (lesson §10) — full 9-field score round-trips; unknown rejected;
    // each required field mandatory (ALL 9 are required — no optionals on this model).
    expect(NoveltyScore.parse(validNovelty)).toEqual(validNovelty);
    expect(() => NoveltyScore.parse({ ...validNovelty, bogus: 1 })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validNovelty };
      delete clone[k];
      expect(() => NoveltyScore.parse(clone), `missing ${k}`).toThrow();
    }
    expect(REQUIRED_KEYS).toHaveLength(9);
  });

  it('novelty_vector_persisted_for_replay', () => {
    // spec(§4/§9, rule #7): vector is a REQUIRED array of numbers; its provenance (embeddingModelId,
    // dimension) is required too — so replay reconstructs from the persisted vector and never
    // re-embeds. vector is NOT optional; a non-number element is rejected.
    expect(NoveltyScore.parse({ ...validNovelty, vector: [] }).vector).toEqual([]); // length is a kernel concern
    expect(() => NoveltyScore.parse({ ...validNovelty, vector: [0.1, 'x'] })).toThrow();
    expect(() => NoveltyScore.parse({ ...validNovelty, vector: 'notarray' })).toThrow();
    for (const k of ['vector', 'embeddingModelId', 'dimension'] as const) {
      const clone: Record<string, unknown> = { ...validNovelty };
      delete clone[k];
      expect(() => NoveltyScore.parse(clone), `rule #7 requires ${k}`).toThrow();
    }
    // dimension is a positive integer (provenance of the embedding space).
    expect(() => NoveltyScore.parse({ ...validNovelty, dimension: 0 })).toThrow();
    expect(() => NoveltyScore.parse({ ...validNovelty, dimension: 1.5 })).toThrow();
    expect(() => NoveltyScore.parse({ ...validNovelty, dimension: -3 })).toThrow();
  });

  it('novelty_method_and_comparisonSet', () => {
    // spec(§8): method is an open non-empty string (MVP-evolving — cosine day-one, pgvector later,
    // lesson §6); comparisonSet is an array of opaque candidate ids; score is a permissive number.
    expect(() => NoveltyScore.parse({ ...validNovelty, method: '' })).toThrow();
    expect(NoveltyScore.parse({ ...validNovelty, comparisonSet: [] }).comparisonSet).toEqual([]);
    expect(() => NoveltyScore.parse({ ...validNovelty, comparisonSet: [''] })).toThrow();
    expect(() => NoveltyScore.parse({ ...validNovelty, comparisonSet: [1, 2] })).toThrow();
    expect(NoveltyScore.parse({ ...validNovelty, score: -2.5 }).score).toBe(-2.5);
    expect(() => NoveltyScore.parse({ ...validNovelty, score: 'high' })).toThrow();
  });
});
