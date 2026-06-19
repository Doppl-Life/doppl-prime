import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../../src/event-store/append.js";
import { classifyTerminal } from "../../src/runtime/terminal-classifier.js";
import { type PgContainerHandle, startPgContainer } from "../helpers/pg-container.js";

const validConfig = {
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

describe("spec(§3) classifyTerminal — reads event log, classifies the run", () => {
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
  });

  test("run with run.completed event → status 'completed'", async () => {
    const runId = "run_completed";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: validConfig },
    });
    await appendEvent(db, {
      runId,
      type: "generation.completed",
      actor: "runtime",
      payload: {
        completedAt: "2026-06-19T12:00:00.000Z",
        candidateCount: 2,
      },
    });
    await appendEvent(db, {
      runId,
      type: "run.completed",
      actor: "runtime",
      payload: {
        completedAt: "2026-06-19T13:00:00.000Z",
        terminalSummary: "all good",
      },
    });
    const result = await classifyTerminal(runId, db);
    expect(result.status).toBe("completed");
    expect(result.summary.generationsCompleted).toBe(1);
  });

  test("run with run.stopped event → status 'stopped'", async () => {
    const runId = "run_stopped";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: validConfig },
    });
    await appendEvent(db, {
      runId,
      type: "run.stopped",
      actor: "operator",
      payload: {
        completedAt: "2026-06-19T13:00:00.000Z",
        reason: "operator kill switch",
      },
    });
    const result = await classifyTerminal(runId, db);
    expect(result.status).toBe("stopped");
    expect(result.summary.terminalReason).toContain("kill switch");
  });

  test("run with energy_exhausted but no run.completed → status 'failed'", async () => {
    const runId = "run_energy_failed";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: validConfig },
    });
    await appendEvent(db, {
      runId,
      type: "energy_exhausted",
      actor: "runtime",
      payload: { reason: "budget hit", spent: 1000, budget: 1000 },
    });
    const result = await classifyTerminal(runId, db);
    expect(result.status).toBe("failed");
    expect(result.summary.terminalReason).toContain("budget");
  });

  test("provider_call_failed events alone do NOT terminate the run", async () => {
    const runId = "run_just_failures";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: validConfig },
    });
    await appendEvent(db, {
      runId,
      type: "provider_call_failed",
      actor: "runtime",
      payload: { reason: "transient 503" },
    });
    await appendEvent(db, {
      runId,
      type: "run.completed",
      actor: "runtime",
      payload: {
        completedAt: "2026-06-19T13:00:00.000Z",
        terminalSummary: "ok",
      },
    });
    const result = await classifyTerminal(runId, db);
    expect(result.status).toBe("completed");
  });

  test("run with no terminal event yet returns status 'running'", async () => {
    const runId = "run_in_progress";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: validConfig },
    });
    await appendEvent(db, {
      runId,
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: "2026-06-19T12:00:00.000Z" },
    });
    const result = await classifyTerminal(runId, db);
    expect(result.status).toBe("running");
  });

  test("summary counts generations + candidates + cullings", async () => {
    const runId = "run_counts";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: validConfig },
    });
    for (let i = 0; i < 3; i += 1) {
      await appendEvent(db, {
        runId,
        type: "generation.completed",
        actor: "runtime",
        payload: {
          completedAt: "2026-06-19T12:00:00.000Z",
          candidateCount: 4,
        },
      });
    }
    for (let i = 0; i < 5; i += 1) {
      await appendEvent(db, {
        runId,
        type: "lineage.culled",
        actor: "selection_controller",
        payload: {
          culling: {
            id: `cull_${i}`,
            runId,
            generationId: "g_1",
            targetIds: ["ag_x"],
            reason: "weak",
            scoreSnapshot: { ag_x: 0.05 },
          },
        },
      });
    }
    await appendEvent(db, {
      runId,
      type: "run.completed",
      actor: "runtime",
      payload: {
        completedAt: "2026-06-19T14:00:00.000Z",
        terminalSummary: "ok",
      },
    });
    const result = await classifyTerminal(runId, db);
    expect(result.summary.generationsCompleted).toBe(3);
    expect(result.summary.cullingsCount).toBe(5);
  });
});
