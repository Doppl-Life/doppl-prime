import { CURRENT_SCHEMA_VERSION, type ProjectionWatermark } from '@doppl/contracts';
import type { RunEventRow } from '../event-store';

/**
 * Projection-builder core (ARCHITECTURE.md §9, key safety rules #2 + #7). A projection is a PURE
 * ordered fold over a run's `run_events`, strictly by `(runId, sequence)` — `occurredAt` is never
 * consulted for ordering (§4: `sequence` is the sole ordering key). The fold produces a watermark-
 * tagged result (`sequenceThrough` = the highest sequence folded) and is byte-stable: replaying the
 * same events yields a byte-identical canonical serialization, with NO model/web/embedding calls
 * (rule #7 — this module imports no provider/gateway). It is the reusable core P6.2 (current-state),
 * P6.3 (lineage), and P6.4 (replay-summary) inject a reducer into; it ships no concrete projection.
 *
 * Posture (Q4): the builder is defensive but does NOT silently re-sort — `readByRun` already returns
 * `asc(sequence)`, so the builder ASSERTS strict consecutive monotonic ordering and surfaces a
 * gap / non-monotonic sequence as a typed error rather than masking a producer/reader bug (lesson §6
 * spirit). It also rejects an envelope whose `schemaVersion > CURRENT_SCHEMA_VERSION` (§4 — readers
 * accept all `schemaVersion ≤ current`).
 */

/** Re-exported so consumers fold over the event-store row shape without reaching into event-store. */
export type { RunEventRow };

export type ProjectionErrorReason =
  | 'empty'
  | 'mixed_run'
  | 'schema_version_unsupported'
  | 'sequence_gap'
  | 'sequence_non_monotonic';

/**
 * A surfaced projection-fold violation — the builder is a pure mechanism, so it THROWS rather than
 * silently producing a partial projection (acceptance: gap/non-monotonic surfaced, schemaVersion
 * gate). The caller decides how to react. Mirrors the event-store `AppendError` shape.
 */
export class ProjectionError extends Error {
  constructor(
    public readonly reason: ProjectionErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectionError';
  }
}

/** A reducer folds one event into the accumulating projection state — pure, injected by the caller. */
export type ProjectionReducer<S> = (state: S, event: RunEventRow) => S;

/**
 * A watermark-tagged projection record: the folded `state` plus the `(runId, sequenceThrough)`
 * watermark it was built through. The `{ runId, sequenceThrough }` portion conforms to the frozen
 * `ProjectionWatermark` contract, so staleness logic operates on it uniformly.
 */
export interface WatermarkedProjection<S> extends ProjectionWatermark {
  state: S;
}

/**
 * Fold a run's ordered events into a watermark-tagged projection. `events` MUST be a single run's
 * events in ascending `sequence` order (as `readByRun` returns them). Throws `ProjectionError` on an
 * empty list, cross-run contamination, an unsupported schemaVersion, or a sequence gap / non-
 * monotonicity. The gap baseline is the FIRST observed sequence (a full-run fold naturally starts at
 * 0); a windowed/resume fold from a non-zero cursor (P6.7 events / P6.9 SSE resume) is a future
 * concern and supportable without forcing a 0 start now (Q5).
 */
export function buildProjection<S>(
  events: readonly RunEventRow[],
  reducer: ProjectionReducer<S>,
  initialState: S,
): WatermarkedProjection<S> {
  const firstEvent = events[0];
  if (firstEvent === undefined) {
    throw new ProjectionError('empty', 'cannot build a projection from zero events');
  }

  const runId = firstEvent.runId;
  let state = initialState;
  let prevSequence = firstEvent.sequence;
  let isFirst = true;

  for (const event of events) {
    // §4 schemaVersion gate — accept ≤ current, reject (typed) a higher version; never silently fold.
    if (event.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new ProjectionError(
        'schema_version_unsupported',
        `event schemaVersion ${event.schemaVersion} exceeds current ${CURRENT_SCHEMA_VERSION}`,
      );
    }
    // A projection is a PER-RUN fold (acceptance #1) — reject cross-run contamination.
    if (event.runId !== runId) {
      throw new ProjectionError(
        'mixed_run',
        'events span more than one runId; a projection is a per-run fold',
      );
    }
    // §9 — assert strict consecutive monotonic ordering (skip the comparison on the first event).
    if (!isFirst) {
      if (event.sequence <= prevSequence) {
        throw new ProjectionError(
          'sequence_non_monotonic',
          `non-monotonic sequence: ${event.sequence} does not advance past ${prevSequence}`,
        );
      }
      if (event.sequence > prevSequence + 1) {
        throw new ProjectionError(
          'sequence_gap',
          `sequence gap: ${event.sequence} follows ${prevSequence} (expected ${prevSequence + 1})`,
        );
      }
    }

    state = reducer(state, event);
    prevSequence = event.sequence;
    isFirst = false;
  }

  return { runId, sequenceThrough: prevSequence, state };
}

/**
 * canonicalize — the canonical serialization used for projection state-equivalence (§9): deterministic
 * JSON with recursively SORTED object keys, so two equal projection states serialize byte-identically
 * regardless of key-insertion order. P6.4 (replay-summary) reuses this for the replay-determinism
 * (state-equivalence) comparison. Pure — no IO, no clock, no provider. `Date` values normalize to ISO
 * strings (so a stray timestamp can't collapse to `{}`).
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortKeysDeep(source[key]);
    }
    return out;
  }
  return value;
}
