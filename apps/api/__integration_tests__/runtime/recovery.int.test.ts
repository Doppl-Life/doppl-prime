import type { RunConfig } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../../src/event-store/append.js";
import { recoverIncompleteRuns } from "../../src/runtime/recovery.js";
import { startRun } from "../../src/runtime/start-run.js";
import { type PgContainerHandle, startPgContainer } from "../helpers/pg-container.js";

const validConfig: RunConfig = {
  seed: "operator-seed",
  enabledSubtypes: ["cross_domain_transfer"],
  caps: {
    maxPopulation: 4,
    maxGenerations: 3,
    energyBudget: 1_000,
    maxSpawnDepth: 2,
    maxToolCalls: 10,
    wallClockTimeoutMs: 60_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "rng-1",
};

describe("spec(§3, §15) recoverIncompleteRuns", () => {
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
    await handle.pool.query("TRUNCATE run_events");
    await handle.pool.query("DELETE FROM runs");
  });

  test("mode='resume' (default): non-terminal runs are NOT transitioned", async () => {
    const { runId } = await startRun(db, validConfig);
    await handle.pool.query("UPDATE runs SET status='running' WHERE id=$1", [runId]);

    const recovered = await recoverIncompleteRuns({ db, mode: "resume" });
    expect(recovered).toEqual([{ runId, action: "leave-for-resume" }]);

    const after = await handle.pool.query<{ status: string }>(
      "SELECT status FROM runs WHERE id=$1",
      [runId],
    );
    expect(after.rows[0]?.status).toBe("running");
  });

  test("mode='fail-on-startup': non-terminal runs are transitioned to failed + run.failed event", async () => {
    const { runId } = await startRun(db, validConfig);
    await handle.pool.query("UPDATE runs SET status='running' WHERE id=$1", [runId]);

    const recovered = await recoverIncompleteRuns({ db, mode: "fail-on-startup" });
    expect(recovered).toEqual([{ runId, action: "failed" }]);

    const after = await handle.pool.query<{ status: string }>(
      "SELECT status FROM runs WHERE id=$1",
      [runId],
    );
    expect(after.rows[0]?.status).toBe("failed");

    const failedEvent = await handle.pool.query<{ payload: { reason: string } }>(
      `SELECT payload FROM run_events
       WHERE run_id=$1 AND type='run.failed'`,
      [runId],
    );
    expect(failedEvent.rows).toHaveLength(1);
    expect(failedEvent.rows[0]?.payload.reason).toContain("process restart");
  });

  test("no incomplete runs → recovery is a no-op", async () => {
    const recovered = await recoverIncompleteRuns({ db, mode: "resume" });
    expect(recovered).toEqual([]);
  });

  test("terminal runs (completed) are skipped — no state mutation", async () => {
    const { runId } = await startRun(db, validConfig);
    await handle.pool.query("UPDATE runs SET status='completed' WHERE id=$1", [runId]);

    const recovered = await recoverIncompleteRuns({ db, mode: "fail-on-startup" });
    expect(recovered).toEqual([]);

    const after = await handle.pool.query<{ status: string }>(
      "SELECT status FROM runs WHERE id=$1",
      [runId],
    );
    expect(after.rows[0]?.status).toBe("completed");
  });

  test("idempotency: calling recovery twice produces the same DB state both times", async () => {
    const { runId } = await startRun(db, validConfig);
    await handle.pool.query("UPDATE runs SET status='running' WHERE id=$1", [runId]);

    await recoverIncompleteRuns({ db, mode: "fail-on-startup" });
    const first = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM run_events WHERE type='run.failed'",
    );

    await recoverIncompleteRuns({ db, mode: "fail-on-startup" });
    const second = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM run_events WHERE type='run.failed'",
    );

    expect(first.rows[0]?.count).toBe(second.rows[0]?.count);
  });

  test("completing + stopping runs are also recovered under fail-on-startup", async () => {
    const a = await startRun(db, validConfig);
    await handle.pool.query("UPDATE runs SET status='completing' WHERE id=$1", [a.runId]);

    // Make a "running" run so we can submit a second after that one transitions
    // to completing/stopping (single-active enforcement).
    await handle.pool.query("UPDATE runs SET status='completed' WHERE id=$1", [a.runId]);
    const b = await startRun(db, validConfig);
    await handle.pool.query("UPDATE runs SET status='stopping' WHERE id=$1", [b.runId]);
    // Restore a as completing for the test.
    await handle.pool.query("UPDATE runs SET status='completing' WHERE id=$1", [a.runId]);

    const recovered = await recoverIncompleteRuns({ db, mode: "fail-on-startup" });
    expect(recovered.map((r) => r.action).sort()).toEqual(["failed", "failed"]);

    const states = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM runs WHERE status='failed'",
    );
    expect(states.rows[0]?.count).toBe("2");
  });
});
