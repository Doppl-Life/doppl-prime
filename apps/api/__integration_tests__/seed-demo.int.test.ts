import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTRACTS_SCHEMA_VERSION, type RunEventEnvelope } from "@doppl/contracts";
import type { RunConfig } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { replayReader } from "../src/event-store/replay-reader.js";
import { type ReplayArtifact, dumpReplay } from "../src/event-store/scripts/dump-replay.js";
import {
  MigrationsMissingError,
  SchemaVersionMismatchError,
  SeedRefusedError,
  seedDemo,
} from "../src/event-store/scripts/seed-demo.js";
import { startRun } from "../src/runtime/start-run.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_CONFIG: RunConfig = {
  seed: "seed-demo-seed",
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

describe("spec(§17) seedDemo", () => {
  let handle: PgContainerHandle;
  let db: NodePgDatabase;
  let tmpDir: string;

  beforeAll(async () => {
    handle = await startPgContainer();
    db = drizzle(handle.pool);
    tmpDir = await mkdtemp(join(tmpdir(), "doppl-seed-demo-"));
  });
  afterAll(async () => {
    await handle?.cleanup();
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
  beforeEach(async () => {
    await handle.pool.query("TRUNCATE run_events");
    await handle.pool.query("DELETE FROM runs");
  });

  async function buildFixture(): Promise<string> {
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
    const result = await dumpReplay({ db, runId, outDir: tmpDir });
    return result.path;
  }

  test("happy path: fixture loads + replay produces same events as original", async () => {
    const fixturePath = await buildFixture();
    // Clear DB so seedDemo is loading from scratch.
    await handle.pool.query("TRUNCATE run_events");
    await handle.pool.query("DELETE FROM runs");

    const result = await seedDemo({ db, fixturePath });
    expect(result.eventsLoaded).toBe(3);
    expect(result.eventsSkipped).toBe(0);

    const events: RunEventEnvelope[] = [];
    for await (const e of replayReader(db).events(result.runId)) events.push(e);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.sequence)).toEqual([0, 1, 2]);

    const runRow = await handle.pool.query<{ mode: string; status: string }>(
      "SELECT mode, status FROM runs WHERE id = $1",
      [result.runId],
    );
    expect(runRow.rows[0]?.mode).toBe("replay");
    expect(runRow.rows[0]?.status).toBe("completed");
  });

  test("schemaVersion > current throws SchemaVersionMismatchError", async () => {
    const fixturePath = join(tmpDir, "forward-version.json");
    const artifact: ReplayArtifact = {
      runId: "00000000-0000-0000-0000-00000000abcd",
      schemaVersion: CONTRACTS_SCHEMA_VERSION + 99,
      exportedAt: new Date().toISOString(),
      events: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          runId: "00000000-0000-0000-0000-00000000abcd",
          sequence: 0,
          occurredAt: new Date().toISOString(),
          type: "run.configured",
          actor: "operator",
          payload: { config: VALID_CONFIG },
          schemaVersion: CONTRACTS_SCHEMA_VERSION + 99,
        } as RunEventEnvelope,
      ],
    };
    await writeFile(fixturePath, JSON.stringify(artifact));
    await expect(seedDemo({ db, fixturePath })).rejects.toThrow(SchemaVersionMismatchError);
  });

  test("idempotent: re-seeding produces no duplicate events", async () => {
    const fixturePath = await buildFixture();
    await handle.pool.query("TRUNCATE run_events");
    await handle.pool.query("DELETE FROM runs");

    const r1 = await seedDemo({ db, fixturePath });
    const r2 = await seedDemo({ db, fixturePath });
    expect(r1.eventsLoaded).toBe(3);
    expect(r2.eventsLoaded).toBe(0);
    expect(r2.eventsSkipped).toBe(3);

    const count = await handle.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM run_events WHERE run_id = $1",
      [r1.runId],
    );
    expect(count.rows[0]?.count).toBe("3");
  });

  test("missing fixture file → SeedRefusedError surfaces filesystem error", async () => {
    await expect(
      seedDemo({ db, fixturePath: join(tmpDir, "does-not-exist.json") }),
    ).rejects.toThrow(/ENOENT|no such file/i);
  });

  test("malformed fixture JSON → SeedRefusedError", async () => {
    const badPath = join(tmpDir, "bad.json");
    await writeFile(badPath, "{not valid json");
    await expect(seedDemo({ db, fixturePath: badPath })).rejects.toThrow(SeedRefusedError);
  });

  test("missing migrations → MigrationsMissingError", async () => {
    const ephemeral = await startPgContainer({ migrate: false });
    try {
      const freshDb = drizzle(ephemeral.pool);
      const fixturePath = join(tmpDir, "small.json");
      const artifact: ReplayArtifact = {
        runId: "00000000-0000-0000-0000-00000000aaaa",
        schemaVersion: CONTRACTS_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        events: [],
      };
      await writeFile(fixturePath, JSON.stringify(artifact));
      await expect(seedDemo({ db: freshDb, fixturePath })).rejects.toThrow(MigrationsMissingError);
    } finally {
      await ephemeral.cleanup();
    }
  });
});
