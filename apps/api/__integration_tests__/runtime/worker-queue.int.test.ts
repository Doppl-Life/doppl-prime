import type { RunConfig } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { RunAlreadyActiveError } from "../../src/runtime/errors.js";
import { startRun } from "../../src/runtime/start-run.js";
import { Worker } from "../../src/runtime/worker.js";
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

describe("spec(§3) worker + queue + startRun", () => {
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

  test("startRun inserts a runs row at status='configured' and emits run.configured", async () => {
    const { runId } = await startRun(db, validConfig);
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);

    const runRow = await handle.pool.query<{ status: string }>(
      "SELECT status FROM runs WHERE id = $1",
      [runId],
    );
    expect(runRow.rows[0]?.status).toBe("configured");

    const eventRow = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id = $1 AND type = 'run.configured'`,
      [runId],
    );
    expect(eventRow.rows[0]?.count).toBe("1");
  });

  test("second startRun while a run is non-terminal throws RunAlreadyActiveError", async () => {
    const first = await startRun(db, validConfig);
    let caught: unknown;
    try {
      await startRun(db, validConfig);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RunAlreadyActiveError);
    expect((caught as RunAlreadyActiveError).activeRunId).toBe(first.runId);
  });

  test("invalid config (missing rngSeed) throws at startRun without inserting", async () => {
    const { rngSeed, ...bad } = validConfig;
    void rngSeed;
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
      startRun(db, bad as any),
    ).rejects.toThrow();
    const rowCount = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM runs",
    );
    expect(rowCount.rows[0]?.count).toBe("0");
  });

  test("Worker.peekNextConfigured returns the oldest configured run", async () => {
    const a = await startRun(db, validConfig);
    // Advance time slightly so configured_at differs.
    await new Promise((r) => setTimeout(r, 50));
    // Mark first as running so we can submit a second.
    await handle.pool.query("UPDATE runs SET status='completed' WHERE id=$1", [a.runId]);
    const b = await startRun(db, validConfig);

    const worker = new Worker({
      db,
      pollMs: 1000,
      processRun: async () => {},
    });
    const next = await worker.peekNextConfigured();
    expect(next).toBe(b.runId);
  });

  test("Worker.start() picks up a configured run and calls processRun", async () => {
    const { runId } = await startRun(db, validConfig);
    const processRun = vi.fn(async (id: string) => {
      // Simulate processing: transition to completed so the next poll
      // sees nothing and we can stop.
      await handle.pool.query("UPDATE runs SET status='completed' WHERE id=$1", [id]);
    });
    const worker = new Worker({ db, pollMs: 50, processRun });
    const runPromise = worker.start();
    // Wait for the worker to pick up the run.
    await new Promise((r) => setTimeout(r, 250));
    await worker.stop();
    await runPromise;
    expect(processRun).toHaveBeenCalledWith(runId);
  });

  test("Worker waits when no configured run exists", async () => {
    const processRun = vi.fn(async () => {});
    const worker = new Worker({ db, pollMs: 50, processRun });
    const runPromise = worker.start();
    await new Promise((r) => setTimeout(r, 200));
    await worker.stop();
    await runPromise;
    expect(processRun).toHaveBeenCalledTimes(0);
  });
});
