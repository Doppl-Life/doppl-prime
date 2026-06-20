import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runMigrations } from "../src/event-store/migrate.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

describe("spec(§9) migrations are idempotent and materialize the full table set", () => {
  let handle: PgContainerHandle;

  beforeAll(async () => {
    // Skip the helper's auto-migrate — this test exercises the migrator.
    handle = await startPgContainer({ migrate: false });
  });

  afterAll(async () => {
    await handle?.cleanup();
  });

  test("fresh container → migrations create the 12 canonical tables", async () => {
    await runMigrations(handle.pool);
    const result = await handle.pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       AND table_name NOT IN ('__drizzle_migrations')
       ORDER BY table_name`,
    );
    const tables = result.rows.map((r) => r.table_name);
    expect(tables.sort()).toMatchInlineSnapshot(`
      [
        "agenomes",
        "candidate_ideas",
        "check_results",
        "critic_reviews",
        "dashboard_snapshots",
        "embeddings",
        "fitness_scores",
        "generations",
        "idempotency_keys",
        "lineage_edges",
        "novelty_scores",
        "run_events",
        "runs",
        "worker_heartbeats",
      ]
    `);
    expect(tables).toHaveLength(14);
  });

  test("run_events has the (run_id, sequence) unique index", async () => {
    const result = await handle.pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'run_events'
       ORDER BY indexname`,
    );
    const indexes = result.rows.map((r) => r.indexname);
    expect(indexes).toContain("run_events_run_id_sequence_uq");
    expect(indexes).toContain("run_events_run_id_idx");
  });

  test("run_events.occurred_at column has a NOT NULL DEFAULT NOW()", async () => {
    const result = await handle.pool.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'run_events' AND column_name = 'occurred_at'`,
    );
    const col = result.rows[0];
    expect(col?.is_nullable).toBe("NO");
    expect(col?.column_default ?? "").toMatch(/now\(\)/i);
  });

  test("running migrations again is a no-op (idempotent)", async () => {
    const before = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    await runMigrations(handle.pool);
    const after = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
