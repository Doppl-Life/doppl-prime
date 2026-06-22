import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION, ProjectionWatermark } from '@doppl/contracts';
import {
  buildProjection,
  canonicalize,
  isStale,
  ProjectionError,
  type RunEventRow,
} from '../../../src/projections';

/**
 * P6.1 — projection-builder core (pure unit). spec(§9)/spec(§4): a projection is a PURE ordered fold
 * over (runId, sequence) producing a watermark-tagged, byte-stable result; the builder asserts strict
 * consecutive monotonic ordering (assert-not-resort, Q4), rejects schemaVersion > current, surfaces
 * gap/non-monotonic as a typed error (never a silent partial), and the rebuild path imports no
 * provider (rule #7). occurredAt is never consulted for ordering (§4 — sequence is the sole order key).
 */

// A reducer whose state records BOTH the fold order (so we can assert sequence-ordering) and a
// per-type count (so we can assert byte-stability over a structured result).
interface FoldState {
  order: number[];
  types: Record<string, number>;
}
const initialState: FoldState = { order: [], types: {} };
const reducer = (s: FoldState, e: RunEventRow): FoldState => ({
  order: [...s.order, e.sequence],
  types: { ...s.types, [e.type]: (s.types[e.type] ?? 0) + 1 },
});

let idCounter = 0;
function makeRow(
  runId: string,
  sequence: number,
  overrides: Partial<RunEventRow> = {},
): RunEventRow {
  return {
    id: `evt-${runId}-${idCounter++}`,
    runId,
    generationId: null,
    agenomeId: null,
    candidateId: null,
    type: 'run.started',
    sequence,
    occurredAt: new Date('2026-06-21T00:00:00.000Z'),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...overrides,
  };
}

describe('buildProjection — pure ordered fold over (runId, sequence) (spec §9/§4)', () => {
  // §9/§4 — sequence is the sole ordering key; occurredAt is never consulted (shuffling it does not
  // change the projection). Events are presented in sequence order (as readByRun returns) but with
  // occurredAt in NON-monotonic order; two different occurredAt orderings yield the identical result.
  test('test_fold_orders_by_sequence_not_occurred_at', () => {
    const runId = 'run-order';
    const shuffledA = [
      makeRow(runId, 0, { type: 'run.started', occurredAt: new Date('2026-06-21T03:00:00Z') }),
      makeRow(runId, 1, {
        type: 'generation.started',
        occurredAt: new Date('2026-06-21T01:00:00Z'),
      }),
      makeRow(runId, 2, { type: 'run.completed', occurredAt: new Date('2026-06-21T02:00:00Z') }),
    ];
    const shuffledB = [
      makeRow(runId, 0, { type: 'run.started', occurredAt: new Date('2026-06-21T09:00:00Z') }),
      makeRow(runId, 1, {
        type: 'generation.started',
        occurredAt: new Date('2026-06-21T05:00:00Z'),
      }),
      makeRow(runId, 2, { type: 'run.completed', occurredAt: new Date('2026-06-21T07:00:00Z') }),
    ];
    const a = buildProjection(shuffledA, reducer, initialState);
    const b = buildProjection(shuffledB, reducer, initialState);
    expect(a.state.order).toEqual([0, 1, 2]);
    // occurredAt-independence: differing occurredAt orderings produce a byte-identical projection.
    expect(canonicalize(a.state)).toBe(canonicalize(b.state));
  });

  // §9 — folding the same events twice yields a byte-identical canonical serialization (state-
  // equivalence over a canonical form: deterministic JSON with recursively sorted object keys, Q3).
  test('test_fold_is_pure_byte_stable', () => {
    const runId = 'run-stable';
    const events = [
      makeRow(runId, 0, { type: 'run.started' }),
      makeRow(runId, 1, { type: 'candidate.created' }),
      makeRow(runId, 2, { type: 'candidate.created' }),
    ];
    const first = buildProjection(events, reducer, initialState);
    const second = buildProjection(events, reducer, initialState);
    expect(canonicalize(first.state)).toBe(canonicalize(second.state));
    // canonicalize sorts object keys recursively, so insertion order can't perturb the bytes.
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  // §9 — the result carries the (runId, sequence) watermark; sequenceThrough == the highest sequence
  // folded, and the {runId, sequenceThrough} portion is a valid ProjectionWatermark.
  test('test_watermark_equals_highest_sequence', () => {
    const runId = 'run-watermark';
    const events = [makeRow(runId, 0), makeRow(runId, 1), makeRow(runId, 2)];
    const result = buildProjection(events, reducer, initialState);
    expect(result.sequenceThrough).toBe(2);
    expect(result.runId).toBe(runId);
    expect(
      ProjectionWatermark.parse({ runId: result.runId, sequenceThrough: result.sequenceThrough }),
    ).toEqual({ runId, sequenceThrough: 2 });
  });

  // §4 — readers accept every envelope whose schemaVersion <= current and reject (typed error, do
  // not silently fold) any envelope with a higher schemaVersion.
  test('test_reject_higher_schema_version', () => {
    const runId = 'run-schema';
    // <= current accepted (mixed v1 + v(current)).
    const ok = buildProjection(
      [
        makeRow(runId, 0, { schemaVersion: 1 }),
        makeRow(runId, 1, { schemaVersion: CURRENT_SCHEMA_VERSION }),
      ],
      reducer,
      initialState,
    );
    expect(ok.sequenceThrough).toBe(1);
    // > current rejected with a typed error; nothing silently folded.
    const higher = [
      makeRow(runId, 0, { schemaVersion: CURRENT_SCHEMA_VERSION }),
      makeRow(runId, 1, { schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
    ];
    expect(() => buildProjection(higher, reducer, initialState)).toThrow(ProjectionError);
    try {
      buildProjection(higher, reducer, initialState);
    } catch (e) {
      expect((e as ProjectionError).reason).toBe('schema_version_unsupported');
    }
  });

  // §9 — a gap in sequence (0,1,3) is surfaced as a typed error, never a partial projection.
  test('test_sequence_gap_errors', () => {
    const runId = 'run-gap';
    const events = [makeRow(runId, 0), makeRow(runId, 1), makeRow(runId, 3)];
    expect(() => buildProjection(events, reducer, initialState)).toThrow(ProjectionError);
    try {
      buildProjection(events, reducer, initialState);
    } catch (e) {
      expect((e as ProjectionError).reason).toBe('sequence_gap');
    }
  });

  // §9 — a backwards/duplicate sequence is surfaced as a typed error (non-monotonic).
  test('test_non_monotonic_sequence_errors', () => {
    const runId = 'run-nonmono';
    for (const seqs of [
      [0, 1, 1], // duplicate
      [0, 1, 0], // backwards
    ]) {
      const events = seqs.map((s) => makeRow(runId, s));
      expect(() => buildProjection(events, reducer, initialState)).toThrow(ProjectionError);
      try {
        buildProjection(events, reducer, initialState);
      } catch (e) {
        expect((e as ProjectionError).reason).toBe('sequence_non_monotonic');
      }
    }
  });

  // Defensive (beyond the 8 outlined, flagged at Step 2.5): an empty event list can't yield a
  // watermark (no runId, no sequence) — surface it as a typed error rather than return a partial.
  test('test_empty_events_errors', () => {
    expect(() => buildProjection([], reducer, initialState)).toThrow(ProjectionError);
    try {
      buildProjection([], reducer, initialState);
    } catch (e) {
      expect((e as ProjectionError).reason).toBe('empty');
    }
  });

  // Defensive (beyond the 8 outlined, flagged at Step 2.5): a per-run fold rejects cross-run
  // contamination rather than silently tagging the result with the first event's runId.
  test('test_mixed_run_errors', () => {
    const events = [makeRow('run-a', 0), makeRow('run-b', 1)];
    expect(() => buildProjection(events, reducer, initialState)).toThrow(ProjectionError);
    try {
      buildProjection(events, reducer, initialState);
    } catch (e) {
      expect((e as ProjectionError).reason).toBe('mixed_run');
    }
  });

  // §9 — staleness is a pure predicate over (watermark, latestSequence): a cached projection is stale
  // (discard/rebuild) exactly when events exist with a sequence greater than its watermark.
  test('test_is_stale_true_when_newer_events', () => {
    const watermark: ProjectionWatermark = { runId: 'run-stale', sequenceThrough: 5 };
    expect(isStale(watermark, 7)).toBe(true); // newer events exist -> stale
    expect(isStale(watermark, 5)).toBe(false); // up to date
    expect(isStale(watermark, 3)).toBe(false); // nothing newer (append-only: can't happen, not stale)
    expect(isStale(watermark, null)).toBe(false); // no events -> not stale
  });

  // rule #7 — the rebuild path calls no model/web/embedding provider: the projection module imports
  // no ModelGateway/provider/embedding symbol (structural, positive-guard-first so RED isn't vacuous).
  test('test_builder_imports_no_provider', () => {
    const dir = fileURLToPath(new URL('../../../src/projections/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const forbidden =
      /from\s+['"][^'"]*(model-gateway|gateway|openai|@anthropic|openrouter|embedding)/i;
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(forbidden.test(src), `${f} must not import a provider/gateway/embedding module`).toBe(
        false,
      );
    }
  });
});
