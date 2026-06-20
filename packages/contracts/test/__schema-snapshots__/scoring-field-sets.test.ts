// P0.8 — §2.5 cross-track schema-snapshot gate for the scoring family. SAFETY-relevant: the field
// sets ARE the rule-#6 / rule-#7 pins — `policyVersion` in FitnessScore (immutability-via-versioning)
// and `vector`/`embeddingModelId`/`dimension` in NoveltyScore (replay never re-embeds) must stay
// REQUIRED members of their frozen sets; a weakening fails here as a §2.5 regression (Step-9 Finding).
import { describe, it, expect } from 'vitest';
import { NoveltyScore, FitnessScore, ScoringPolicy } from '@doppl/contracts';

const NOVELTY_FIELD_SNAPSHOT = [
  'id',
  'candidateId',
  'vector',
  'embeddingModelId',
  'dimension',
  'comparisonSet',
  'method',
  'score',
  'explanation',
];

const FITNESS_FIELD_SNAPSHOT = [
  'id',
  'candidateId',
  'total',
  'components',
  'policyVersion',
  'explanation',
];

const SCORING_POLICY_FIELD_SNAPSHOT = ['version', 'weights', 'normalization'];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — NoveltyScore / FitnessScore / ScoringPolicy (spec §8 / §2.5)', () => {
  it('barrel_exports_scoring_contracts', () => {
    // spec(§2.5): the public surface re-exports each scoring schema from one barrel.
    expect(typeof NoveltyScore.parse).toBe('function');
    expect(typeof FitnessScore.parse).toBe('function');
    expect(typeof ScoringPolicy.parse).toBe('function');
  });

  it('schema_snapshot_scoring', () => {
    expect(sorted(Object.keys(NoveltyScore.shape))).toEqual(sorted(NOVELTY_FIELD_SNAPSHOT));
    expect(sorted(Object.keys(FitnessScore.shape))).toEqual(sorted(FITNESS_FIELD_SNAPSHOT));
    expect(sorted(Object.keys(ScoringPolicy.shape))).toEqual(sorted(SCORING_POLICY_FIELD_SNAPSHOT));
    expect(NOVELTY_FIELD_SNAPSHOT).toHaveLength(9);
    expect(FITNESS_FIELD_SNAPSHOT).toHaveLength(6);
    expect(SCORING_POLICY_FIELD_SNAPSHOT).toHaveLength(3);
    // the two safety-pin fields are MEMBERS of their frozen sets (rule #6 + rule #7).
    expect(FITNESS_FIELD_SNAPSHOT).toContain('policyVersion');
    expect(NOVELTY_FIELD_SNAPSHOT).toContain('vector');
  });
});
