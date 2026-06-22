// P6.1 — ProjectionWatermark: the (runId, sequence) watermark every cached/materialized projection
// records the sequence it was built through (ARCHITECTURE.md §9 — a projection is derived/rebuildable
// and is discarded/rebuilt when newer events exist). spec(§9): demo-track-local read-shape (NOT a
// §2.5 cross-track seam) — so it carries a convention field-name snapshot (lesson §1), not the
// consolidated seam gate. `sequenceThrough` mirrors LineageGraphProjection's watermark naming.
import { describe, it, expect } from 'vitest';
import { ProjectionWatermark, objectFieldNames } from '@doppl/contracts';

const validWatermark = {
  runId: 'run_1',
  sequenceThrough: 42,
};

const WATERMARK_FIELD_SNAPSHOT = ['runId', 'sequenceThrough'];

const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('ProjectionWatermark — the (runId, sequence) projection watermark (spec §9)', () => {
  it('projection_watermark_accepts_valid_and_strict', () => {
    // spec(§9): positive-guard-first (lesson §10) — a full watermark round-trips; unknown rejected;
    // each required field mandatory; sequenceThrough is a non-negative int (a fresh projection
    // through sequence 0 parses).
    expect(ProjectionWatermark.parse(validWatermark)).toEqual(validWatermark);
    expect(() => ProjectionWatermark.parse({ ...validWatermark, bogus: 1 })).toThrow();
    for (const k of WATERMARK_FIELD_SNAPSHOT) {
      const clone: Record<string, unknown> = { ...validWatermark };
      delete clone[k];
      expect(() => ProjectionWatermark.parse(clone), `missing ${k}`).toThrow();
    }
    expect(
      ProjectionWatermark.parse({ ...validWatermark, sequenceThrough: 0 }).sequenceThrough,
    ).toBe(0);
    expect(() => ProjectionWatermark.parse({ ...validWatermark, sequenceThrough: -1 })).toThrow();
    expect(() => ProjectionWatermark.parse({ ...validWatermark, sequenceThrough: 1.5 })).toThrow();
    expect(() => ProjectionWatermark.parse({ ...validWatermark, runId: '' })).toThrow();
  });

  it('projection_watermark_field_snapshot', () => {
    // spec(§9): a genuine field-NAME-set snapshot via the shared `objectFieldNames` extractor (lesson
    // §1, FIELD_SET_SNAPSHOTS style) — an added/removed/renamed field is caught here. Positive guard
    // first (lesson §10) so a vanished export fails loudly, not silently.
    expect(typeof ProjectionWatermark.parse).toBe('function');
    expect(objectFieldNames(ProjectionWatermark)).toEqual(sorted(WATERMARK_FIELD_SNAPSHOT));
    expect(WATERMARK_FIELD_SNAPSHOT).toHaveLength(2);
  });
});
