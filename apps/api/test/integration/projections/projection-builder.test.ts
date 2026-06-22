import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createEventStore, type AppendInput, type EventStore } from '../../../src/event-store';
import {
  buildProjection,
  isStale,
  latestSequence,
  type RunEventRow,
} from '../../../src/projections';

/**
 * P6.1 — projection-builder core (integration, testcontainers/real PG). The fold runs over the REAL
 * authoritative log (append -> readByRun), no mock on the truth path (§9). Staleness rebuilds against
 * the real max(sequence). runId is treated as untrusted opaque bytes (parameterized, IDs-opaque
 * carry-forward).
 */

interface FoldState {
  order: number[];
}
const initialState: FoldState = { order: [] };
const reducer = (s: FoldState, e: RunEventRow): FoldState => ({ order: [...s.order, e.sequence] });

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;
let idCounter = 0;

function makeInput(runId: string, overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    id: `evt-${runId}-${idCounter++}`,
    runId,
    type: 'run.started',
    actor: 'runtime',
    payload: {},
    schemaVersion: 2,
    ...overrides,
  };
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('projection-builder — fold over the real authoritative log (spec §9)', () => {
  // §9 — append N valid envelopes via the REAL writer, readByRun, fold -> sequenceThrough == N-1,
  // ordering correct (no mock on the truth-log path).
  test('test_fold_over_real_read_by_run', async () => {
    const runId = 'proj-fold-real';
    const N = 4;
    for (let i = 0; i < N; i++) await store.append(makeInput(runId));
    const events = await store.readByRun(runId);
    const result = buildProjection(events, reducer, initialState);
    expect(result.sequenceThrough).toBe(N - 1);
    expect(result.runId).toBe(runId);
    expect(result.state.order).toEqual([0, 1, 2, 3]);
  });

  // §9 — fold at watermark k; append more events; isStale(watermark, latestSequence) is true; the
  // rebuild reflects the new events (stale-discard-rebuild).
  test('test_stale_then_rebuild_reflects_new_events', async () => {
    const runId = 'proj-stale-rebuild';
    await store.append(makeInput(runId)); // seq 0
    await store.append(makeInput(runId)); // seq 1
    const first = buildProjection(await store.readByRun(runId), reducer, initialState);
    expect(first.sequenceThrough).toBe(1);
    expect(await latestSequence(db, runId)).toBe(1);
    expect(isStale(first, await latestSequence(db, runId))).toBe(false);

    await store.append(makeInput(runId)); // seq 2
    await store.append(makeInput(runId)); // seq 3
    expect(await latestSequence(db, runId)).toBe(3);
    expect(isStale(first, await latestSequence(db, runId))).toBe(true);

    const rebuilt = buildProjection(await store.readByRun(runId), reducer, initialState);
    expect(rebuilt.sequenceThrough).toBe(3);
    expect(rebuilt.state.order).toEqual([0, 1, 2, 3]);
  });

  // IDs-opaque carry-forward — a runId with SQL metacharacters flows through latestSequence(db, runId)
  // literally with no injection effect; the table survives and the max is correctly scoped.
  test('test_run_id_parameterized_opaque', async () => {
    const runId = `r'; DROP TABLE run_events; --`;
    await store.append(makeInput(runId)); // seq 0
    await store.append(makeInput(runId)); // seq 1
    expect(await latestSequence(db, runId)).toBe(1);
    // table intact (no injection) — a follow-up query against an unrelated run still works.
    expect(await latestSequence(db, 'nonexistent-run')).toBeNull();
  });
});
