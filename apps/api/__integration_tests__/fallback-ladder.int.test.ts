import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTRACTS_SCHEMA_VERSION, type RunConfig } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { ReplayArtifact } from "../src/event-store/scripts/dump-replay.js";
import { MAX_CAPS, applyDemoOverride } from "../src/runtime/demo/demo-cap-override.js";
import {
  activateLowCapLive,
  activatePreparedRun,
  activateReplay,
  readRunMode,
} from "../src/runtime/demo/fallback-ladder.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const BASE_CONFIG: RunConfig = {
  seed: "fallback-ladder-seed",
  enabledSubtypes: ["cross_domain_transfer"],
  caps: {
    maxPopulation: 10,
    maxGenerations: 8,
    energyBudget: 20_000,
    maxSpawnDepth: 4,
    maxToolCalls: 80,
    wallClockTimeoutMs: 10 * 60 * 1000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "rng-1",
};

describe("spec(§16) fallback ladder", () => {
  let handle: PgContainerHandle;
  let db: NodePgDatabase;
  let tmpDir: string;

  beforeAll(async () => {
    handle = await startPgContainer();
    db = drizzle(handle.pool);
    tmpDir = await mkdtemp(join(tmpdir(), "doppl-fallback-"));
  });
  afterAll(async () => {
    await handle?.cleanup();
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
  beforeEach(async () => {
    await handle.pool.query("TRUNCATE run_events");
    await handle.pool.query("DELETE FROM runs");
  });

  describe("applyDemoOverride", () => {
    test("lowers maxPopulation: 10 → 4", () => {
      const { config, warnings } = applyDemoOverride(BASE_CONFIG, { maxPopulation: 4 });
      expect(config.caps.maxPopulation).toBe(4);
      expect(warnings).toHaveLength(0);
    });

    test("above-ceiling override clamps to MAX_CAPS and warns", () => {
      const high = MAX_CAPS.maxPopulation + 100;
      const { config, warnings } = applyDemoOverride(BASE_CONFIG, { maxPopulation: high });
      // base config (10) is below the ceiling, override would clamp to ceiling
      // and then the rule "override only lowers" keeps base value.
      expect(config.caps.maxPopulation).toBe(BASE_CONFIG.caps.maxPopulation);
      expect(warnings.some((w) => w.includes("exceeds ceiling"))).toBe(true);
    });

    test("override above current but below ceiling is ignored with warning", () => {
      const above = BASE_CONFIG.caps.maxPopulation + 1;
      const { config, warnings } = applyDemoOverride(BASE_CONFIG, { maxPopulation: above });
      expect(config.caps.maxPopulation).toBe(BASE_CONFIG.caps.maxPopulation);
      expect(warnings.some((w) => w.includes("override only lowers"))).toBe(true);
    });

    test("empty override returns config unchanged", () => {
      const { config, warnings } = applyDemoOverride(BASE_CONFIG, {});
      expect(config.caps).toEqual(BASE_CONFIG.caps);
      expect(warnings).toEqual([]);
    });
  });

  describe("activateLowCapLive", () => {
    test("produces a run row with mode='live' and lowered caps", async () => {
      const result = await activateLowCapLive({
        db,
        baseConfig: BASE_CONFIG,
        override: { maxPopulation: 4 },
      });
      expect(result.mode).toBe("live");
      const row = await readRunMode(db, result.runId);
      expect(row?.mode).toBe("live");
      const configRow = await handle.pool.query<{ config: { caps: { maxPopulation: number } } }>(
        "SELECT config FROM runs WHERE id = $1",
        [result.runId],
      );
      expect(configRow.rows[0]?.config.caps.maxPopulation).toBe(4);
    });
  });

  describe("activateReplay", () => {
    test("produces a run row with mode='replay' and fixture events loaded", async () => {
      const fixturePath = join(tmpDir, "replay-fixture.json");
      const runId = "00000000-0000-0000-0000-00000000bbbb";
      const artifact: ReplayArtifact = {
        runId,
        schemaVersion: CONTRACTS_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        events: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            runId,
            sequence: 0,
            occurredAt: new Date().toISOString(),
            type: "run.configured",
            actor: "operator",
            payload: { config: BASE_CONFIG },
            schemaVersion: CONTRACTS_SCHEMA_VERSION,
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            runId,
            sequence: 1,
            occurredAt: new Date().toISOString(),
            type: "run.completed",
            actor: "runtime",
            payload: { completedAt: new Date().toISOString() },
            schemaVersion: CONTRACTS_SCHEMA_VERSION,
          },
        ],
      };
      await writeFile(fixturePath, JSON.stringify(artifact));

      const result = await activateReplay({ db, fixturePath });
      expect(result.runId).toBe(runId);
      expect(result.mode).toBe("replay");
      expect(result.eventsLoaded).toBe(2);

      const row = await readRunMode(db, runId);
      expect(row?.mode).toBe("replay");
      expect(row?.status).toBe("completed");
    });
  });

  describe("rung transitions preserve prior runs", () => {
    test("rung-1 run remains terminal/inspectable after rung-2 starts", async () => {
      // Rung 1 live run
      const rung1 = await activateLowCapLive({ db, baseConfig: BASE_CONFIG });
      // Operator transitions: rung-1 run completes/cancels first.
      await handle.pool.query("UPDATE runs SET status = 'completed' WHERE id = $1", [rung1.runId]);

      // Rung 2 prepared (curated) live run
      const rung2 = await activatePreparedRun({ db, preparedConfig: BASE_CONFIG });
      expect(rung2.runId).not.toBe(rung1.runId);

      // Rung-1 still readable, still terminal
      const rung1After = await readRunMode(db, rung1.runId);
      expect(rung1After?.mode).toBe("live");
      expect(rung1After?.status).toBe("completed");
    });
  });
});
