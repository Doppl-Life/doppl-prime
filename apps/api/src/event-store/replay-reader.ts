import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { EventStore, RunEventRow } from './append';

/**
 * Replay reader (P1.8, ARCHITECTURE.md §9/§4/§14, KEY SAFETY RULE #7 — replay-determinism).
 *
 * Reconstruct a run's state from the persisted log, STRICTLY ordered by `sequence` (the sole ordering
 * key — never `occurredAt`), accepting `schemaVersion ≤ CURRENT_SCHEMA_VERSION`. It VALIDATES (throws
 * `ReplayIntegrityError` on a gap / out-of-order / too-new schemaVersion) — it never silently re-sorts
 * or skips a corrupted authoritative log. Replay-safety is STRUCTURAL: this module imports NO provider /
 * embedding / web seam (lesson 30), so "replay calls no provider" holds by construction. The functions
 * are PURE + read-only; `replayRun` is generic over the fold (the P6 projection builders inject their
 * real reducers). The append path (P1.3) is the envelope-validation boundary — every stored row was
 * validated + scrubbed pre-insert — so the reader folds over `RunEventRow` and re-checks only the
 * read-time invariants (order + the schema-version window).
 */

export type ReplayIntegrityReason = 'gap' | 'out_of_order' | 'schema_too_new';

export class ReplayIntegrityError extends Error {
  constructor(
    public readonly reason: ReplayIntegrityReason,
    message: string,
  ) {
    super(message);
    this.name = 'ReplayIntegrityError';
  }
}

/**
 * Validate a run's rows and return them in persisted (sequence) order. Two ordering passes: first
 * assert the sequence is STRICTLY INCREASING (a decrease → `out_of_order`, classified BEFORE the gap
 * pass so `0,2,1` is out_of_order not gap), then assert it is CONTIGUOUS FROM 0 (a hole → `gap`).
 * Finally reject any `schemaVersion > current` (`schema_too_new`). Never re-sorts. An empty log is
 * valid → `[]`.
 */
export function replayEvents(rows: readonly RunEventRow[]): readonly RunEventRow[] {
  // Pass 1 — strictly increasing (full scan, so a later decrease is caught as out_of_order, not gap).
  for (let i = 1; i < rows.length; i += 1) {
    const cur = rows[i];
    const prev = rows[i - 1];
    if (cur !== undefined && prev !== undefined && cur.sequence <= prev.sequence) {
      throw new ReplayIntegrityError(
        'out_of_order',
        `sequence not strictly increasing at index ${i}: ${prev.sequence} then ${cur.sequence}`,
      );
    }
  }
  // Pass 2 — contiguous from 0 (the run's first event is sequence 0; a hole is a corrupted log).
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row !== undefined && row.sequence !== i) {
      throw new ReplayIntegrityError('gap', `expected sequence ${i}, got ${row.sequence}`);
    }
  }
  // Pass 3 — the reader accepts schemaVersion ≤ current; a newer envelope is unreadable (fail loud).
  for (const row of rows) {
    if (row.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new ReplayIntegrityError(
        'schema_too_new',
        `schemaVersion ${row.schemaVersion} exceeds current ${CURRENT_SCHEMA_VERSION}`,
      );
    }
  }
  return rows;
}

/**
 * Fold the validated ordered stream into a state. Generic over the reducer — the P6 projection builders
 * inject their real current-state / lineage folds; the reader supplies the ordered/validated stream.
 */
export function replayRun<S>(
  rows: readonly RunEventRow[],
  fold: (state: S, row: RunEventRow) => S,
  initial: S,
): S {
  return replayEvents(rows).reduce((state, row) => fold(state, row), initial);
}

export interface ReplayReader {
  replayRun<S>(runId: string, fold: (state: S, row: RunEventRow) => S, initial: S): Promise<S>;
}

/**
 * Thin async convenience over the pure core: `readByRun(runId)` then `replayRun`. No cache — replay is
 * one-shot per run (unlike the P1.7 resolver's many dereferences). Wraps the pure core, never duplicates
 * the logic.
 */
export function createReplayReader(store: Pick<EventStore, 'readByRun'>): ReplayReader {
  return {
    async replayRun(runId, fold, initial) {
      const rows = await store.readByRun(runId);
      return replayRun(rows, fold, initial);
    },
  };
}
