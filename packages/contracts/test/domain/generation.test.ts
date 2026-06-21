// P0.15(partial) — Generation: the per-run generation entity (ARCHITECTURE.md §3, Appendix A). Plain
// entity shape. spec(§3): strict 6-field object; `index` is a non-negative ordinal (monotonicity is a
// kernel rule, lesson §6, NOT a schema constraint); `completedAt?` omittable until the gen completes.
import { describe, it, expect } from 'vitest';
import { Generation, GenerationStatus } from '@doppl/contracts';

const validGeneration = {
  id: 'gen_1',
  runId: 'run_1',
  index: 0,
  status: 'pending',
  startedAt: '2026-06-20T12:00:00.000Z',
  completedAt: '2026-06-20T12:05:00.000Z',
};

const GEN_REQUIRED = ['id', 'runId', 'index', 'status', 'startedAt'] as const;

const GEN_STATUSES = [
  'pending',
  'running',
  'verifying',
  'scoring',
  'reproducing',
  'completed',
  'failed',
  'skipped',
] as const;

describe('Generation — per-run generation entity (spec §3)', () => {
  it('generation_accepts_valid_and_strict', () => {
    // spec(§3): positive-guard-first — full Generation round-trips (with + without completedAt);
    // unknown rejected; each required field mandatory.
    expect(Generation.parse(validGeneration)).toEqual(validGeneration);
    const noCompleted: Record<string, unknown> = { ...validGeneration };
    delete noCompleted.completedAt;
    expect(Generation.parse(noCompleted)).toEqual(noCompleted);
    expect(() => Generation.parse({ ...validGeneration, bogus: 1 })).toThrow();
    for (const k of GEN_REQUIRED) {
      const clone: Record<string, unknown> = { ...validGeneration };
      delete clone[k];
      expect(() => Generation.parse(clone), `missing ${k}`).toThrow();
    }
    // index is a NON-NEGATIVE INT (Q4) — a negative or fractional index is rejected; 0 is valid.
    expect(Generation.parse({ ...validGeneration, index: 0 }).index).toBe(0);
    expect(() => Generation.parse({ ...validGeneration, index: -1 })).toThrow();
    expect(() => Generation.parse({ ...validGeneration, index: 1.5 })).toThrow();
  });

  it('generation_status_closed_8_union', () => {
    // spec(§3): GenerationStatus is the closed 8-member union; any other value is rejected.
    for (const s of GEN_STATUSES) {
      expect(GenerationStatus.parse(s)).toBe(s);
      expect(Generation.parse({ ...validGeneration, status: s }).status).toBe(s);
    }
    expect(GEN_STATUSES).toHaveLength(8);
    expect(() => GenerationStatus.parse('aborted')).toThrow();
    expect(() => GenerationStatus.parse('')).toThrow();
    expect(() => Generation.parse({ ...validGeneration, status: 'aborted' })).toThrow();
  });
});
