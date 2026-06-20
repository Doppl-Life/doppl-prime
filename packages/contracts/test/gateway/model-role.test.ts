// P0.11 — ModelRole: the closed role union the gateway routes by (ARCHITECTURE.md §6). spec(§6): the
// 7 model roles; any other value rejected (closed union, lesson §1).
import { describe, it, expect } from 'vitest';
import { ModelRole } from '@doppl/contracts';

const ROLES = [
  'population_generator',
  'critic',
  'subtype_check',
  'embedding',
  'final_judge',
  'fusion_synthesis',
  'retrieval',
] as const;

describe('ModelRole — closed routing role union (spec §6)', () => {
  it('model_role_closed_7_union', () => {
    for (const r of ROLES) {
      expect(ModelRole.parse(r)).toBe(r);
    }
    expect(ROLES).toHaveLength(7);
    expect(() => ModelRole.parse('judge')).toThrow();
    expect(() => ModelRole.parse('')).toThrow();
  });
});
