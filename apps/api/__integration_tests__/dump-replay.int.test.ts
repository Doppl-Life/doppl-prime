import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import {
  DumpRefusedError,
  type ReplayArtifact,
  dumpReplay,
} from "../src/event-store/scripts/dump-replay.js";
import { startRun } from "../src/runtime/start-run.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_CONFIG = {
  seed: "dump-replay-seed",
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

describe("spec(§17) dumpReplay", () => {
  let handle: PgContainerHandle;
  let db: NodePgDatabase;
  let outDir: string;

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
    outDir = await mkdtemp(join(tmpdir(), "doppl-replay-"));
  });

  test("happy path: completed run dumps to JSON with sequence + schemaVersion", async () => {
    const { runId } = await startRun(db, VALID_CONFIG);
    await appendEvent(db, {
      runId,
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: new Date().toISOString() },
    });
    await appendEvent(db, {
      runId,
      type: "run.completed",
      actor: "runtime",
      payload: { completedAt: new Date().toISOString() },
    });
    await handle.pool.query("UPDATE runs SET status = 'completed' WHERE id = $1", [runId]);

    const result = await dumpReplay({ db, runId, outDir });
    expect(result.eventsExported).toBe(3);
    expect(result.path).toContain(runId);

    const json = JSON.parse(await readFile(result.path, "utf-8")) as ReplayArtifact;
    expect(json.runId).toBe(runId);
    expect(json.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(json.events).toHaveLength(3);
    const sequences = json.events.map((e) => e.sequence);
    expect(sequences).toEqual([0, 1, 2]);
  });

  test("non-terminal run is rejected with DumpRefusedError", async () => {
    const { runId } = await startRun(db, VALID_CONFIG);
    // Status stays "configured" — not terminal.
    await expect(dumpReplay({ db, runId, outDir })).rejects.toThrow(DumpRefusedError);
  });

  test("unknown runId is rejected", async () => {
    await expect(
      dumpReplay({ db, runId: "00000000-0000-0000-0000-000000000000", outDir }),
    ).rejects.toThrow(DumpRefusedError);
  });

  test("written file path matches <outDir>/<runId>.json", async () => {
    const { runId } = await startRun(db, VALID_CONFIG);
    await appendEvent(db, {
      runId,
      type: "run.completed",
      actor: "runtime",
      payload: { completedAt: new Date().toISOString() },
    });
    await handle.pool.query("UPDATE runs SET status = 'completed' WHERE id = $1", [runId]);
    const result = await dumpReplay({ db, runId, outDir });
    expect(result.path).toBe(join(outDir, `${runId}.json`));
  });

  test("cancelled run without a terminal event is still accepted", async () => {
    const { runId } = await startRun(db, VALID_CONFIG);
    // Force cancelled status without a terminal event row (operator path).
    await handle.pool.query("UPDATE runs SET status = 'cancelled' WHERE id = $1", [runId]);
    const result = await dumpReplay({ db, runId, outDir });
    expect(result.eventsExported).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true }).catch(() => {});
  });
});
