// P0.15 — §2.5 cross-track schema-snapshot gate for the held-out judge anchor. SAFETY-relevant (rule
// #6): the field-set + the closed axis set + the immutableToAgents literal-`true` pin ARE the
// anti-reward-hacking anchor — a weakening (an added authority/scale field, a dropped axis, or the
// literal relaxed to a plain boolean) is caught here as a §2.5 regression / Step-9 Finding.
// spec(§7) spec(§2.5): field-set + FinalJudgeAxis(5) + the literal pin == frozen snapshots.
import { describe, it, expect } from 'vitest';
import { FinalJudgeRubric, FinalJudgeAxis } from '@doppl/contracts';

const RUBRIC_FIELD_SNAPSHOT = ['axes', 'weights', 'policyVersion', 'immutableToAgents'];

const AXIS_SNAPSHOT = [
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('schema snapshot — FinalJudgeRubric (spec §7 / §2.5)', () => {
  it('barrel_exports_final_judge_rubric', () => {
    // spec(§2.5): the public surface re-exports the rubric schema + the FinalJudgeAxis enum.
    expect(typeof FinalJudgeRubric.parse).toBe('function');
    expect(typeof FinalJudgeAxis.parse).toBe('function');
  });

  it('schema_snapshot_final_judge_rubric', () => {
    expect(sorted(Object.keys(FinalJudgeRubric.shape))).toEqual(sorted(RUBRIC_FIELD_SNAPSHOT));
    expect(sorted(FinalJudgeAxis.options)).toEqual(sorted(AXIS_SNAPSHOT));
    expect(RUBRIC_FIELD_SNAPSHOT).toHaveLength(4);
    expect(AXIS_SNAPSHOT).toHaveLength(5);

    // the immutableToAgents literal-`true` pin is mechanically frozen: the field accepts true, rejects
    // false — so relaxing it to a plain boolean (or flipping the literal) breaks this snapshot.
    expect(FinalJudgeRubric.shape.immutableToAgents.parse(true)).toBe(true);
    expect(() => FinalJudgeRubric.shape.immutableToAgents.parse(false)).toThrow();

    // no mutation/override/authority field and no scale field lives in the frozen set (rule #6).
    for (const forbidden of [
      'mutable',
      'editableBy',
      'scoreOverride',
      'weightOverride',
      'agentWritable',
      'scale',
      'min',
      'max',
    ]) {
      expect(RUBRIC_FIELD_SNAPSHOT).not.toContain(forbidden);
    }
  });
});
