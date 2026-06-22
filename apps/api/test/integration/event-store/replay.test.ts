import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  canonicalSerialize,
  createEventStore,
  replayRun,
  type AppendInput,
  type EventStore,
  type RunEventRow,
} from '../../../src/event-store';

/**
 * P1.8 replay reader — integration (testcontainers, real PG; lesson 25). Replay-determinism (rule #7):
 * append an ordered log, read it, replay-fold it, and assert the canonical serialization equals the
 * state captured at run-end. No mocks on the load-bearing path (real PG round-trip); no provider call.
 */

interface FoldState {
  total: number;
  types: string[];
  ids: string[];
}

const fold = (state: FoldState, row: RunEventRow): FoldState => ({
  total: state.total + 1,
  types: [...state.types, row.type],
  ids: [...state.ids, row.id],
});

const init: FoldState = { total: 0, types: [], ids: [] };

let pool: pg.Pool;
let db: NodePgDatabase;
let store: EventStore;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject('pgConnectionUri') });
  db = drizzle(pool);
  store = createEventStore({ db, secretValues: [] });
});

afterAll(async () => {
  await pool.end();
});

describe('replayRun — state-equivalence from the persisted log (real PG)', () => {
  // spec(§4) rule #7 — append an ordered log, read it, replay-fold it; the canonical serialization
  // equals the run-end captured state. Ordered by sequence; reconstructed with no provider call.
  test('replay_round_trip_state_equivalence_real_pg', async () => {
    const runId = 'run-replay-equiv';
    // Non-high-traffic types → generic payload (no per-type narrowing); deterministic ids/order.
    const inputs: AppendInput[] = [
      {
        id: 'evt-re-0',
        runId,
        type: 'run.started',
        actor: 'runtime',
        payload: {},
        schemaVersion: 2,
      },
      {
        id: 'evt-re-1',
        runId,
        type: 'generation.started',
        actor: 'runtime',
        payload: { index: 0 },
        schemaVersion: 2,
      },
      {
        id: 'evt-re-2',
        runId,
        type: 'generation.completed',
        actor: 'runtime',
        payload: { index: 0 },
        schemaVersion: 2,
      },
    ];
    for (const input of inputs) {
      await store.append(input);
    }

    const rows = await store.readByRun(runId);
    expect(rows.map((r) => r.sequence)).toEqual([0, 1, 2]); // ordered by sequence (the sole key)

    const rebuilt = replayRun(rows, fold, init);

    // The state captured at run-end (fold over the events in production order).
    const captured: FoldState = {
      total: 3,
      types: ['run.started', 'generation.started', 'generation.completed'],
      ids: ['evt-re-0', 'evt-re-1', 'evt-re-2'],
    };
    expect(canonicalSerialize(rebuilt)).toBe(canonicalSerialize(captured));
  });
});
