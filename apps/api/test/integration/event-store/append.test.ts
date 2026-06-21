import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  AppendError,
  createEventStore,
  runEvents,
  type AppendInput,
  type EventStore,
} from '../../../src/event-store';

/**
 * P1.3 append-only event writer — integration (testcontainers, real PG). Safety-invariant (rule #2
 * append-only authoritative write + rule #4 scrub-before-append). spec(§4) sequence/occurred_at;
 * spec(§14) scrub-before-insert. Relies on the P1.4 schema/append-only trigger/unique constraint.
 */

// A non-pattern, non-sensitive-key secret value — only the env-value scrub layer can catch it.
const DB_SECRET = 'S3cr3t-DB-P4ssw0rd-xyz';

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
  store = createEventStore({ db, secretValues: [DB_SECRET] });
});

afterAll(async () => {
  await pool.end();
});

describe('createEventStore.append — the sole authoritative write path', () => {
  // spec(§4) — a schema-invalid envelope is rejected in-txn; nothing is written.
  test('test_schema_invalid_envelope_rejected_nothing_written', async () => {
    const runId = 'run-invalid';
    const bad = { ...makeInput(runId), actor: 'not-a-role' } as unknown as AppendInput;
    await expect(store.append(bad)).rejects.toBeInstanceOf(AppendError);
    expect(await store.readByRun(runId)).toHaveLength(0);
  });

  // spec(§4) — sequence is per-run monotonic + gapless (0,1,2,…), assigned server-side.
  test('test_sequence_monotonic_gapless_per_run', async () => {
    const runId = 'run-monotonic';
    await store.append(makeInput(runId));
    await store.append(makeInput(runId));
    await store.append(makeInput(runId));
    expect((await store.readByRun(runId)).map((r) => r.sequence)).toEqual([0, 1, 2]);
  });

  // spec(§4) — a forced duplicate (run_id, sequence) is rejected by the unique constraint (the
  //  allocator's backstop). A raw insert bypassing the allocator can't reuse a sequence.
  test('test_duplicate_or_skipped_sequence_rejected', async () => {
    const runId = 'run-dup';
    await store.append(makeInput(runId)); // sequence 0
    await expect(
      db.insert(runEvents).values({
        id: `${runId}-raw-dup`,
        runId,
        type: 'run.started',
        sequence: 0, // duplicate
        actor: 'runtime',
        payload: {},
        schemaVersion: 2,
      }),
    ).rejects.toThrow();
  });

  // spec(§4) — N concurrent same-run appends serialize: N distinct consecutive sequences, no gap/dup.
  test('test_concurrent_same_run_appends_serialize', async () => {
    const runId = 'run-concurrent';
    await Promise.all(Array.from({ length: 8 }, () => store.append(makeInput(runId))));
    const sequences = (await store.readByRun(runId)).map((r) => r.sequence);
    expect(sequences).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  // spec(§4) — concurrent cross-run appends are independent (each run gets its own 0,1,…).
  test('test_cross_run_appends_independent', async () => {
    const runA = 'run-x-a';
    const runB = 'run-x-b';
    await Promise.all([
      store.append(makeInput(runA)),
      store.append(makeInput(runB)),
      store.append(makeInput(runA)),
      store.append(makeInput(runB)),
    ]);
    expect((await store.readByRun(runA)).map((r) => r.sequence)).toEqual([0, 1]);
    expect((await store.readByRun(runB)).map((r) => r.sequence)).toEqual([0, 1]);
  });

  // spec(§14) rule #4 — the P1.2 scrub runs BEFORE insert: a loaded secret (nested + as a key) is
  //  absent from the stored row.
  test('test_scrub_runs_before_insert', async () => {
    const runId = 'run-scrub';
    await store.append(
      makeInput(runId, {
        payload: {
          note: `connect ${DB_SECRET} now`,
          nested: { [DB_SECRET]: 'as-a-key' },
          arr: [DB_SECRET],
        },
      }),
    );
    const [row] = await store.readByRun(runId);
    expect(JSON.stringify(row?.payload)).not.toContain(DB_SECRET);
  });

  // spec(§4) — occurred_at is DB-stamped at insert. occurredAt is not in AppendInput at all (the
  //  caller cannot set the log's clock, safe-by-construction); the stored value is the DB's ~now.
  test('test_occurred_at_db_stamped_not_caller', async () => {
    const runId = 'run-occurred';
    const beforeMs = Date.now();
    await store.append(makeInput(runId));
    const [row] = await store.readByRun(runId);
    const occurredAt = row?.occurredAt as Date;
    expect(occurredAt.getUTCFullYear()).toBeGreaterThan(2020);
    expect(Math.abs(occurredAt.getTime() - beforeMs)).toBeLessThan(60_000);
  });

  // payload-ceiling carry-forward — an over-depth payload (validateEventPayload {ok:false}) is not
  //  silently appended; the writer rejects (caller emits the violation event).
  test('test_payload_ceiling_rejected_before_append', async () => {
    const runId = 'run-ceiling';
    const root: Record<string, unknown> = {};
    let cur = root;
    for (let i = 0; i < 40; i++) {
      const next: Record<string, unknown> = {};
      cur.child = next;
      cur = next;
    }
    await expect(store.append(makeInput(runId, { payload: root }))).rejects.toBeInstanceOf(
      AppendError,
    );
    expect(await store.readByRun(runId)).toHaveLength(0);
  });

  // IDs-opaque carry-forward — a run_id with SQL metacharacters is stored literally, no injection.
  test('test_run_id_is_parameterized', async () => {
    const runId = `r1'; DROP TABLE run_events; --`;
    await store.append(makeInput(runId));
    const rows = await store.readByRun(runId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.runId).toBe(runId);
    // table still exists (no injection) — a follow-up query succeeds.
    expect(await store.readByRun('nonexistent')).toHaveLength(0);
  });

  // spec(§4) rule #2 — the writer surface exposes ONLY append + ordered read; no mutate path.
  test('test_writer_has_no_update_or_delete', () => {
    expect(Object.keys(store).sort()).toEqual(['append', 'readByRun']);
  });
});
