import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../../../src/event-store/migrate';

/**
 * P1.4 event-store migration chain — schema + DB-level constraint assertions against a real
 * (testcontainers) Postgres. Safety-invariant (rule #2): run_events is append-only at the DB and the
 * per-run (run_id, sequence) is unique. spec(§9) canonical table set + boot migrator; spec(§4)
 * run_events ordering/occurred_at.
 */

const CANONICAL_TABLES = [
  'runs',
  'run_events',
  'generations',
  'agenomes',
  'candidate_ideas',
  'critic_reviews',
  'check_results',
  'fitness_scores',
  'novelty_scores',
  'lineage_edges',
  'embeddings',
  'dashboard_snapshots',
];

describe('event-store migration chain (testcontainers PG)', () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: inject('pgConnectionUri') });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  // run_events stands alone — run_id is an opaque indexed string, NO FK to the `runs` projection
  // (the authoritative log never depends on a derived/rebuildable projection). So an event inserts
  // directly, with no need to seed a `runs` row first.
  async function insertEvent(
    runId: string,
    sequence: number,
    id = `${runId}-ev-${sequence}`,
  ): Promise<void> {
    await client.query(
      `INSERT INTO run_events (id, run_id, type, sequence, actor, payload, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [id, runId, 'run.started', sequence, 'runtime', JSON.stringify({ k: 'v' }), 2],
    );
  }

  async function columnsOf(table: string): Promise<Set<string>> {
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table],
    );
    return new Set(rows.map((r) => r.column_name));
  }

  // spec(§9) — the full canonical 12-table set exists after migrate.
  test('test_migration_chain_creates_canonical_table_set', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    for (const table of CANONICAL_TABLES) {
      expect(present.has(table), table).toBe(true);
    }
  });

  // spec(§4) rule #2 — run_events is append-only at the DB: UPDATE and DELETE both raise.
  test('test_run_events_rejects_update_and_delete', async () => {
    const runId = 'run-append-only';
    await insertEvent(runId, 0);
    await expect(
      client.query(`UPDATE run_events SET type='tampered' WHERE run_id=$1`, [runId]),
    ).rejects.toThrow();
    await expect(client.query(`DELETE FROM run_events WHERE run_id=$1`, [runId])).rejects.toThrow();
  });

  // spec(§4) rule #2 — append-only also blocks TRUNCATE: a row-level trigger can't catch it, so a
  // statement-level BEFORE TRUNCATE trigger guards the log from wholesale destruction.
  test('test_run_events_rejects_truncate', async () => {
    await insertEvent('run-truncate', 0);
    await expect(client.query(`TRUNCATE TABLE run_events`)).rejects.toThrow();
  });

  // spec(§4) — per-run sequence is the sole ordering key: a duplicate (run_id, sequence) is rejected.
  test('test_run_events_unique_run_id_sequence', async () => {
    const runId = 'run-unique-seq';
    await insertEvent(runId, 0, `${runId}-a`);
    await expect(insertEvent(runId, 0, `${runId}-b`)).rejects.toThrow();
  });

  // spec(§4) — occurred_at is DB-stamped at insert when the caller omits it (never caller-driven, so
  // it can't be used to forge ordering — sequence is the sole order key). timestamptz stores the
  // instant in UTC; we pin that the DB set it to ~now (proving it is not caller-supplied).
  test('test_occurred_at_db_stamped_utc', async () => {
    const runId = 'run-occurred-at';
    const beforeMs = Date.now();
    await insertEvent(runId, 0); // caller omits occurred_at
    const { rows } = await client.query<{ occurred_at: Date }>(
      `SELECT occurred_at FROM run_events WHERE run_id=$1`,
      [runId],
    );
    const occurredAt = rows[0]?.occurred_at;
    expect(occurredAt).toBeInstanceOf(Date);
    expect(Math.abs((occurredAt as Date).getTime() - beforeMs)).toBeLessThan(60_000);
  });

  // spec(§9) — the same chain is idempotent: re-running migrate is a clean no-op.
  test('test_migrate_is_idempotent', async () => {
    const before = (
      await client.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
      )
    ).rows[0] as { n: number };
    await expect(runMigrations(inject('pgConnectionUri'))).resolves.not.toThrow();
    const after = (
      await client.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`,
      )
    ).rows[0] as { n: number };
    expect(after.n).toBe(before.n);
  });

  // spec(§9) — embeddings is an index over the authoritative novelty.scored vector.
  test('test_embeddings_table_shape', async () => {
    const cols = await columnsOf('embeddings');
    expect(cols.has('vector')).toBe(true);
    expect(cols.has('embedding_model_id')).toBe(true);
    expect(cols.has('dimension')).toBe(true);
  });

  // spec(§9) — cached projections carry the (run_id, sequence) watermark they were built through.
  test('test_cached_projection_carries_watermark', async () => {
    const cols = await columnsOf('dashboard_snapshots');
    expect(cols.has('run_id')).toBe(true);
    expect(cols.has('sequence')).toBe(true);
  });
});
