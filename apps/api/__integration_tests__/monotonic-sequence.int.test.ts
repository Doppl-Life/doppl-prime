import { sql } from "drizzle-orm";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { nextSequence } from "../src/event-store/sequence.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

describe("spec(§4) nextSequence — monotonic, gapless, per-run", () => {
  let handle: PgContainerHandle;
  let db: NodePgDatabase;

  beforeAll(async () => {
    handle = await startPgContainer();
    db = drizzle(handle.pool);
  });

  afterAll(async () => {
    await handle?.cleanup();
  });

  beforeEach(async () => {
    await handle.pool.query("DELETE FROM run_events");
  });

  async function insertEvent(runId: string, sequence: number): Promise<void> {
    await handle.pool.query(
      `INSERT INTO run_events
       (id, run_id, sequence, type, actor, payload, schema_version)
       VALUES ($1, $2, $3, 'run.started', 'runtime', '{}'::jsonb, 1)`,
      [`evt_${runId}_${sequence}`, runId, sequence],
    );
  }

  test("empty run returns 0", async () => {
    const next = await db.transaction(async (tx) => nextSequence(tx, "run_empty"));
    expect(next).toBe(0);
  });

  test("after sequences [0, 1, 2] returns 3", async () => {
    await insertEvent("run_a", 0);
    await insertEvent("run_a", 1);
    await insertEvent("run_a", 2);
    const next = await db.transaction(async (tx) => nextSequence(tx, "run_a"));
    expect(next).toBe(3);
  });

  test("returns 0 when other runs have events (per-run scoping)", async () => {
    await insertEvent("run_other", 0);
    await insertEvent("run_other", 1);
    const next = await db.transaction(async (tx) => nextSequence(tx, "run_fresh"));
    expect(next).toBe(0);
  });

  test("rolled-back TX does not consume the sequence", async () => {
    let observedInsideRolledBackTx: number | undefined;
    await expect(
      db.transaction(async (tx) => {
        observedInsideRolledBackTx = await nextSequence(tx, "run_rollback");
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    expect(observedInsideRolledBackTx).toBe(0);
    const nextAfterRollback = await db.transaction(async (tx) => nextSequence(tx, "run_rollback"));
    expect(nextAfterRollback).toBe(0);
  });

  test("concurrent TXs on the SAME runId serialize to distinct sequences 0 and 1", async () => {
    const runId = "run_concurrent_same";
    const observed: number[] = [];

    async function txWithInsert(): Promise<void> {
      await db.transaction(async (tx) => {
        const seq = await nextSequence(tx, runId);
        observed.push(seq);
        // Sleep inside the TX so the second caller would race if the lock
        // were not held. The advisory lock makes it wait.
        await tx.execute(sql`SELECT pg_sleep(0.1)`);
        await tx.execute(
          sql`INSERT INTO run_events (id, run_id, sequence, type, actor, payload, schema_version)
              VALUES (${`evt_same_${seq}`}, ${runId}, ${seq}, 'run.started', 'runtime', '{}'::jsonb, 1)`,
        );
      });
    }

    const start = Date.now();
    await Promise.all([txWithInsert(), txWithInsert()]);
    const elapsed = Date.now() - start;

    expect(new Set(observed)).toEqual(new Set([0, 1]));
    // Two 100ms sleeps serialized — total must be > 180ms (some slack).
    expect(elapsed).toBeGreaterThan(180);
  });

  test("concurrent TXs on DIFFERENT runIds run in parallel (no cross-run lock contention)", async () => {
    async function tx(runId: string): Promise<void> {
      await db.transaction(async (txn) => {
        await nextSequence(txn, runId);
        await txn.execute(sql`SELECT pg_sleep(0.2)`);
      });
    }

    const start = Date.now();
    await Promise.all([tx("run_a"), tx("run_b")]);
    const elapsed = Date.now() - start;

    // Two 200ms sleeps running in parallel — total should be ~200ms, not
    // 400ms. Loose upper bound to absorb test machine jitter.
    expect(elapsed).toBeLessThan(380);
  });
});
