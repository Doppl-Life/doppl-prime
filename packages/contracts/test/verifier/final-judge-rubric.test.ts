// P0.15 — FinalJudgeRubric: the held-out judge's fixed rubric (ARCHITECTURE.md §7/§8/§14). SAFETY
// slice (KEY SAFETY RULE #6 — the held-out judge/rubric/scoring policy is immutable to agents; the
// bedrock anti-reward-hacking anchor the organism cannot move). The anchor is pinned BY SHAPE: a
// closed axis set (no agent can add a judging axis), immutableToAgents:z.literal(true) (cannot be
// flipped/dropped), required policyVersion (immutability-via-versioning, lesson §12), and a strict
// object so no mutation/override/authority field is representable (lesson §9).
import { describe, it, expect } from 'vitest';
import { FinalJudgeRubric, FinalJudgeAxis } from '@doppl/contracts';

const validRubric = {
  axes: ['grounding', 'novelty', 'feasibility', 'falsification_survival', 'subtype_check_pass'],
  weights: {
    grounding: 1,
    novelty: 1,
    feasibility: 1,
    falsification_survival: 1,
    subtype_check_pass: 1,
    energy_efficiency_tiebreak: 0.1,
  },
  policyVersion: 'judge-v1',
  immutableToAgents: true,
};

const AXES = [
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
] as const;

const REQUIRED_KEYS = ['axes', 'weights', 'policyVersion', 'immutableToAgents'] as const;

describe('FinalJudgeRubric — held-out judge anchor (spec §7, rule #6)', () => {
  it('final_judge_rubric_accepts_valid_and_strict', () => {
    // spec(§7): positive-guard-first (lesson §10) — a full rubric (5 axes + weights + policyVersion +
    // immutableToAgents:true) round-trips; unknown rejected; each of the 4 fields required.
    expect(FinalJudgeRubric.parse(validRubric)).toEqual(validRubric);
    expect(() => FinalJudgeRubric.parse({ ...validRubric, bogus: 1 })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validRubric };
      delete clone[k];
      expect(() => FinalJudgeRubric.parse(clone), `missing ${k}`).toThrow();
    }
  });

  it('final_judge_axis_closed_5_union', () => {
    // spec(§7/§8): the judging axis set is FROZEN — an agent cannot introduce a judging axis (rule #6).
    for (const a of AXES) {
      expect(FinalJudgeAxis.parse(a)).toBe(a);
      expect(FinalJudgeRubric.parse({ ...validRubric, axes: [a] }).axes).toEqual([a]);
    }
    expect(AXES).toHaveLength(5);
    expect(() => FinalJudgeAxis.parse('vibes')).toThrow();
    expect(() => FinalJudgeAxis.parse('')).toThrow();
    expect(() => FinalJudgeAxis.parse('grounding ')).toThrow();
    // a non-member axis is rejected at the rubric boundary too.
    expect(() => FinalJudgeRubric.parse({ ...validRubric, axes: ['vibes'] })).toThrow();
  });

  it('final_judge_immutable_to_agents_literal_true', () => {
    // spec(§7/§14) rule #6: the anchor's immutability flag is asserted-true-by-shape — false OR
    // omitted is rejected; it cannot be flipped at the contract boundary.
    expect(FinalJudgeRubric.parse(validRubric).immutableToAgents).toBe(true);
    expect(() => FinalJudgeRubric.parse({ ...validRubric, immutableToAgents: false })).toThrow();
    const noFlag: Record<string, unknown> = { ...validRubric };
    delete noFlag.immutableToAgents;
    expect(() => FinalJudgeRubric.parse(noFlag)).toThrow();
  });

  it('final_judge_policy_version_required', () => {
    // spec(§7) rule #6 / lesson §12: immutability-via-versioning — policyVersion is REQUIRED and typed
    // identically to ScoringPolicy.version (z.string().min(1)); the rubric is never mutated in place.
    expect(
      FinalJudgeRubric.parse({ ...validRubric, policyVersion: 'judge-v2' }).policyVersion,
    ).toBe('judge-v2');
    const noVer: Record<string, unknown> = { ...validRubric };
    delete noVer.policyVersion;
    expect(() => FinalJudgeRubric.parse(noVer)).toThrow();
    expect(() => FinalJudgeRubric.parse({ ...validRubric, policyVersion: '' })).toThrow();
  });

  it('final_judge_no_authority_field', () => {
    // spec(§7) rule #6 / lesson §9: positive-guard-first — the valid rubric parses, but NO agent
    // mutation/override/authority field is representable (strict rejects each).
    expect(FinalJudgeRubric.parse(validRubric)).toEqual(validRubric);
    for (const bad of [
      { mutable: true },
      { editableBy: 'agent' },
      { scoreOverride: 10 },
      { weightOverride: {} },
      { agentWritable: true },
    ]) {
      expect(
        () => FinalJudgeRubric.parse({ ...validRubric, ...bad }),
        JSON.stringify(bad),
      ).toThrow();
    }
  });

  it('final_judge_weights_structure_frozen_values_open', () => {
    // spec(§7) lesson §6: structure frozen, numeric values deferred-open (the only deferred-open piece
    // of the scoring contract) — an arbitrary name→number map is accepted; a non-number weight rejected.
    expect(
      FinalJudgeRubric.parse({ ...validRubric, weights: { foo: 0.3, bar: -1.2 } }).weights,
    ).toEqual({
      foo: 0.3,
      bar: -1.2,
    });
    expect(FinalJudgeRubric.parse({ ...validRubric, weights: {} }).weights).toEqual({});
    expect(() =>
      FinalJudgeRubric.parse({ ...validRubric, weights: { grounding: 'high' } }),
    ).toThrow();
  });

  it('final_judge_no_scale_field', () => {
    // spec(§7): the 0–5 per-axis scale is how the judge SCORES (runtime detail), NOT a rubric field —
    // the frozen field-set is exactly the 4 Appendix-A fields. Positive-guard-first.
    expect(FinalJudgeRubric.parse(validRubric)).toEqual(validRubric);
    for (const field of [{ scale: '0-5' }, { min: 0 }, { max: 5 }]) {
      expect(
        () => FinalJudgeRubric.parse({ ...validRubric, ...field }),
        JSON.stringify(field),
      ).toThrow();
    }
  });
});
