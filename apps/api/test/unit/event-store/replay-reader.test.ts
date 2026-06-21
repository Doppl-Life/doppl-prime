import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { RunEventRow } from '../../../src/event-store/append';
import { canonicalSerialize } from '../../../src/event-store/canonical-serialization';
import {
  ReplayIntegrityError,
  createReplayReader,
  replayEvents,
  replayRun,
} from '../../../src/event-store/replay-reader';

/**
 * P1.8 replay reader (ARCHITECTURE.md §9/§4/§14, KEY SAFETY RULE #7 — replay-determinism). Reconstruct
 * a run's state from the persisted log, STRICTLY ordered by sequence (the sole key, never occurredAt),
 * accepting schemaVersion ≤ current. It VALIDATES (throws ReplayIntegrityError on gap/out_of_order/
 * schema_too_new) — never silently re-sorts/skips a corrupted authoritative log. Replay-safety is
 * STRUCTURAL: the module imports no provider/gateway/embedding/web seam (lesson 30).
 */

function makeRow(sequence: number, overrides: Partial<RunEventRow> = {}): RunEventRow {
  return {
    id: `evt-${sequence}`,
    runId: 'run-1',
    generationId: null,
    agenomeId: null,
    candidateId: null,
    type: 'run.started',
    sequence,
    occurredAt: new Date(1_700_000_000_000 + sequence * 1000),
    actor: 'runtime',
    correlationId: null,
    langfuseTraceId: null,
    langfuseObservationId: null,
    payload: {},
    schemaVersion: 2,
    ...overrides,
  };
}

const validLog: RunEventRow[] = [makeRow(0), makeRow(1), makeRow(2)];

describe('replayEvents — ordered by sequence, validate-not-sort (§4/§9)', () => {
  // spec(§4/§9) — sequence is the SOLE ordering key: rows whose occurredAt order differs from sequence
  // order still yield in sequence order (occurredAt is display-only, never used to order).
  test('replay_yields_events_ordered_by_sequence', () => {
    // sequence 0,1,2 but occurredAt descending (0 newest) — sorting by occurredAt would give 2,1,0.
    const rows = [
      makeRow(0, { occurredAt: new Date(3000) }),
      makeRow(1, { occurredAt: new Date(1000) }),
      makeRow(2, { occurredAt: new Date(2000) }),
    ];
    expect(replayEvents(rows).map((r) => r.sequence)).toEqual([0, 1, 2]);
  });

  // spec(integrity) — a gap in the stored sequence (0,1,3) throws ReplayIntegrityError{gap}; never a
  // silent skip/re-sort (a corrupted authoritative log fails LOUD).
  test('replay_detects_gap_throws', () => {
    expect(replayEvents(validLog).map((r) => r.sequence)).toEqual([0, 1, 2]); // positive guard
    const gapped = [makeRow(0), makeRow(1), makeRow(3)];
    expect(() => replayEvents(gapped)).toThrow(ReplayIntegrityError);
    try {
      replayEvents(gapped);
    } catch (e) {
      expect((e as ReplayIntegrityError).reason).toBe('gap');
    }
  });

  // spec(integrity) — an out-of-order sequence (0,2,1) throws ReplayIntegrityError{out_of_order}; the
  // reader asserts strictly-increasing order rather than re-sorting.
  test('replay_detects_out_of_order_throws', () => {
    expect(replayEvents(validLog)).toHaveLength(3); // positive guard
    const outOfOrder = [makeRow(0), makeRow(2), makeRow(1)];
    try {
      replayEvents(outOfOrder);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ReplayIntegrityError);
      expect((e as ReplayIntegrityError).reason).toBe('out_of_order');
    }
  });
});

describe('replayEvents — schemaVersion acceptance window (§4)', () => {
  // spec(§4) — an older-schemaVersion fixture (1 < current 2) replays fine, with no upcaster invoked.
  test('replay_accepts_schema_version_le_current', () => {
    const olderLog = [makeRow(0, { schemaVersion: 1 }), makeRow(1, { schemaVersion: 1 })];
    expect(replayEvents(olderLog).map((r) => r.schemaVersion)).toEqual([1, 1]);
  });

  // spec(§4) — an envelope newer than the reader understands (CURRENT+1) throws
  // ReplayIntegrityError{schema_too_new} — fail loud, never misread.
  test('replay_rejects_schema_version_gt_current', () => {
    expect(replayEvents(validLog)).toHaveLength(3); // positive guard
    const tooNew = [makeRow(0), makeRow(1, { schemaVersion: CURRENT_SCHEMA_VERSION + 1 })];
    try {
      replayEvents(tooNew);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ReplayIntegrityError);
      expect((e as ReplayIntegrityError).reason).toBe('schema_too_new');
    }
  });
});

describe('replayRun — generic fold + state-equivalence (§4)', () => {
  interface FoldState {
    total: number;
    ids: string[];
  }
  const fold = (state: FoldState, row: RunEventRow): FoldState => ({
    total: state.total + 1,
    ids: [...state.ids, row.id],
  });
  const init: FoldState = { total: 0, ids: [] };

  // spec(§4) — replayRun folds the validated ordered stream into a state whose canonical serialization
  // equals the state captured by folding the same log (rebuilt == captured), key-order independent.
  test('replay_run_state_equivalence', () => {
    const rebuilt = replayRun(validLog, fold, init);
    const captured = { ids: ['evt-0', 'evt-1', 'evt-2'], total: 3 }; // different key order on purpose
    expect(canonicalSerialize(rebuilt)).toBe(canonicalSerialize(captured));
  });

  // spec(rule #7) — replay is deterministic: the same log twice yields the same state; (structural) the
  // module imports NO provider/gateway/embedding/web seam — replay-safety by construction (lesson 30).
  test('replay_deterministic_no_external_seam', () => {
    expect(canonicalSerialize(replayRun(validLog, fold, init))).toBe(
      canonicalSerialize(replayRun(validLog, fold, init)),
    );
    const source = readFileSync(
      fileURLToPath(new URL('../../../src/event-store/replay-reader.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/model-gateway|adapters\/|openai|fetch\(|node:https?|undici/);
  });

  // spec(rule #7) — replay is READ-ONLY: frozen input rows are not mutated; no insert/append/update path.
  test('replay_is_read_only', () => {
    const frozen = Object.freeze([makeRow(0), makeRow(1)]) as readonly RunEventRow[];
    const result = replayRun(frozen, fold, init);
    expect(result.total).toBe(2);
    expect(frozen.length).toBe(2); // not mutated
  });

  // spec(§9) — an empty log is VALID: replayEvents([]) → [] and replayRun([], fold, init) → init
  // (no missing-sequence-0 error; an empty run reconstructs to the initial state).
  test('replay_empty_log_yields_initial_state', () => {
    expect(replayEvents([])).toEqual([]);
    expect(replayRun([], fold, init)).toEqual(init);
  });

  // spec(§9) — createReplayReader is a thin async wrapper: readByRun(runId) then replayRun over the
  // pure core (lesson 20 explicit-deferral; first consumers P6 folds + PD replay).
  test('create_replay_reader_reads_by_run_then_folds', async () => {
    let readCount = 0;
    const fakeStore = {
      readByRun(runId: string): Promise<RunEventRow[]> {
        readCount += 1;
        void runId;
        return Promise.resolve(validLog);
      },
    };
    const reader = createReplayReader(fakeStore);
    const state = await reader.replayRun('run-1', fold, init);
    expect(readCount).toBe(1);
    expect(state.total).toBe(3);
    expect(state.ids).toEqual(['evt-0', 'evt-1', 'evt-2']);
  });
});
