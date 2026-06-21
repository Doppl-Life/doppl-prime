// P0.15(partial) — CullingEvent: the persisted shape behind the `lineage.culled` event (ARCHITECTURE.md
// §3/§8, Appendix A). spec(§8): a cull decision must be explainable from persisted events — so the
// event carries the `scoreSnapshot` of the scores that justified it. The schema encodes SHAPE only;
// targetIds COUNT (≥1) is a kernel rule (lesson §6), not a contract constraint.
import { describe, it, expect } from 'vitest';
import { CullingEvent } from '@doppl/contracts';

const validCulling = {
  id: 'cull_1',
  runId: 'run_1',
  generationId: 'gen_1',
  targetIds: ['cand_3', 'cand_4'],
  reason: 'lost_generation_tournament',
  scoreSnapshot: { cand_3: 0.42, cand_4: 0.31 },
};

const CULL_REQUIRED = [
  'id',
  'runId',
  'generationId',
  'targetIds',
  'reason',
  'scoreSnapshot',
] as const;

describe('CullingEvent — persisted cull-decision shape (spec §8)', () => {
  it('culling_event_accepts_valid_and_strict', () => {
    // spec(§8): positive-guard-first — a full CullingEvent round-trips; unknown rejected; each
    // required field mandatory.
    expect(CullingEvent.parse(validCulling)).toEqual(validCulling);
    expect(() => CullingEvent.parse({ ...validCulling, bogus: 1 })).toThrow();
    for (const k of CULL_REQUIRED) {
      const clone: Record<string, unknown> = { ...validCulling };
      delete clone[k];
      expect(() => CullingEvent.parse(clone), `missing ${k}`).toThrow();
    }
    // targetIds entries are .min(1) ids — an empty-string element is rejected; the EMPTY ARRAY parses
    // (≥1-target is a kernel COUNT rule, lesson §6, same class as candidate claims[]).
    expect(() => CullingEvent.parse({ ...validCulling, targetIds: [''] })).toThrow();
    expect(CullingEvent.parse({ ...validCulling, targetIds: [] }).targetIds).toEqual([]);
    // reason is a non-empty string.
    expect(() => CullingEvent.parse({ ...validCulling, reason: '' })).toThrow();
    // scoreSnapshot (Q2) is an inspectable record<string, number> — a non-numeric score is rejected.
    expect(() =>
      CullingEvent.parse({ ...validCulling, scoreSnapshot: { cand_3: 'high' } }),
    ).toThrow();
    // an empty scoreSnapshot record parses (shape-only; population is the selection track's concern).
    expect(CullingEvent.parse({ ...validCulling, scoreSnapshot: {} }).scoreSnapshot).toEqual({});
  });
});
