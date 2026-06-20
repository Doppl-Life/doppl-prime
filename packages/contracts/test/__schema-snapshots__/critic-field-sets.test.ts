// P0.6 — §2.5 cross-track schema-snapshot gate for the critic contracts. SAFETY-relevant: the
// CriticReview field set IS the structural no-winner/no-policy pin (rule #6) and the sentinel value
// IS the injection-isolation delimiter (rule #5 / §14). spec(§7) spec(§14) spec(§2.5): CriticReview
// field-set(7), CriticMandate member-set(5), criticInput field-set + rubric sub-shape, and the
// sentinel value each equal a checked-in frozen snapshot — any drift fails HERE before the verifier/
// selection tracks consume these models (a shape change to a safety pin is a Step-9 Finding).
import { describe, it, expect } from 'vitest';
import {
  CriticReview,
  CriticMandate,
  criticInput,
  CRITIC_INPUT_SENTINEL,
  wrapUntrusted,
} from '@doppl/contracts';

const CRITIC_REVIEW_FIELD_SNAPSHOT = [
  'id',
  'candidateId',
  'mandate',
  'scores',
  'critique',
  'confidence',
  'evidenceRefs',
];

const CRITIC_MANDATE_SNAPSHOT = [
  'factual_grounding',
  'novelty_prior_art',
  'feasibility',
  'falsification',
  'subtype_specific',
];

const CRITIC_INPUT_FIELD_SNAPSHOT = ['rubric', 'candidate'];
const CRITIC_INPUT_RUBRIC_FIELD_SNAPSHOT = ['mandate', 'instructions'];
const CRITIC_INPUT_SENTINEL_SNAPSHOT = '<<<DOPPL_UNTRUSTED_CANDIDATE>>>';

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — CriticReview / CriticMandate / criticInput (spec §7 / §14 / §2.5)', () => {
  it('barrel_exports_critic_contracts', () => {
    // spec(§2.5): the public surface re-exports each schema + the safety primitives from one barrel.
    expect(typeof CriticReview.parse).toBe('function');
    expect(typeof CriticMandate.parse).toBe('function');
    expect(typeof criticInput.parse).toBe('function');
    expect(typeof CRITIC_INPUT_SENTINEL).toBe('string');
    expect(typeof wrapUntrusted).toBe('function');
  });

  it('schema_snapshot_critic_review_input_mandate', () => {
    expect(sorted(Object.keys(CriticReview.shape))).toEqual(sorted(CRITIC_REVIEW_FIELD_SNAPSHOT));
    expect(sorted(CriticMandate.options)).toEqual(sorted(CRITIC_MANDATE_SNAPSHOT));
    expect(sorted(Object.keys(criticInput.shape))).toEqual(sorted(CRITIC_INPUT_FIELD_SNAPSHOT));
    // the trusted rubric sub-shape is part of the isolation surface — pin it too.
    expect(sorted(Object.keys(criticInput.shape.rubric.shape))).toEqual(
      sorted(CRITIC_INPUT_RUBRIC_FIELD_SNAPSHOT),
    );
    expect(CRITIC_INPUT_SENTINEL).toBe(CRITIC_INPUT_SENTINEL_SNAPSHOT);

    expect(CRITIC_REVIEW_FIELD_SNAPSHOT).toHaveLength(7);
    expect(CRITIC_MANDATE_SNAPSHOT).toHaveLength(5);
    expect(CRITIC_INPUT_FIELD_SNAPSHOT).toHaveLength(2);
    expect(CRITIC_INPUT_RUBRIC_FIELD_SNAPSHOT).toHaveLength(2);
  });
});
