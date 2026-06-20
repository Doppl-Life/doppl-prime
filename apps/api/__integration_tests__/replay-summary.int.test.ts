import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { buildReplaySummary } from "../src/projections/replay-summary.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_RUN_CONFIG = {
  seed: "operator-seed-summary",
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

async function emitFitness(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  candidateId: string,
  total: number,
): Promise<void> {
  await appendEvent(db, {
    runId,
    type: "fitness.scored",
    actor: "selection_controller",
    payload: {
      fitness: {
        id: `fit_${randomUUID()}`,
        candidateId,
        total,
        components: {},
        policyVersion: "v1",
        explanation: "t",
      },
    },
    candidateId,
  });
}

describe("spec(§9) buildReplaySummary", () => {
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

  test("empty event log → status='unknown', zero counts", async () => {
    const out = await buildReplaySummary({ db, runId: "run_empty" });
    expect(out.summary.status).toBe("unknown");
    expect(out.summary.candidatesProduced).toBe(0);
    expect(out.summary.candidatesScored).toBe(0);
    expect(out.summary.topCandidates).toEqual([]);
  });

  test("completed run with 6 candidates → topCandidates capped at 5 in descending fitness order", async () => {
    const runId = "run_top";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId,
      type: "run.completed",
      actor: "runtime",
      payload: { completedAt: new Date().toISOString() },
    });
    const totals = [1.0, 3.5, 2.0, 4.5, 0.5, 5.0];
    for (let i = 0; i < totals.length; i += 1) {
      await emitFitness(db, runId, `cand_${i}`, totals[i] ?? 0);
    }
    const out = await buildReplaySummary({ db, runId });
    expect(out.summary.status).toBe("completed");
    expect(out.summary.topCandidates).toHaveLength(5);
    expect(out.summary.topCandidates.map((t) => t.total)).toEqual([5.0, 4.5, 3.5, 2.0, 1.0]);
    expect(out.summary.policyVersion).toBe("v1");
  });

  test("captures runSeed from the configured payload", async () => {
    const runId = "run_seed";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    const out = await buildReplaySummary({ db, runId });
    expect(out.summary.runSeed).toBe("operator-seed-summary");
  });

  test("idempotent: re-running yields the same summary", async () => {
    const runId = "run_idem";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await emitFitness(db, runId, "cand_a", 1.0);
    await emitFitness(db, runId, "cand_b", 2.0);
    const a = await buildReplaySummary({ db, runId });
    const b = await buildReplaySummary({ db, runId });
    expect(a.summary).toEqual(b.summary);
    expect(a.sequenceThrough).toBe(b.sequenceThrough);
  });

  test("zero-survivors run still reports status + zero topCandidates", async () => {
    const runId = "run_zero";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId,
      type: "generation.started",
      actor: "runtime",
      payload: { index: 0 },
      generationId: "gen_0",
    });
    await appendEvent(db, {
      runId,
      type: "generation.completed",
      actor: "runtime",
      payload: { completedAt: new Date().toISOString(), candidateCount: 0 },
      generationId: "gen_0",
    });
    await appendEvent(db, {
      runId,
      type: "run.completed",
      actor: "runtime",
      payload: { completedAt: new Date().toISOString() },
    });
    const out = await buildReplaySummary({ db, runId });
    expect(out.summary.status).toBe("completed");
    expect(out.summary.generationsCompleted).toBe(1);
    expect(out.summary.topCandidates).toEqual([]);
  });

  test("fitness histogram has 10 buckets summing to candidatesScored", async () => {
    const runId = "run_hist";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    const totals = [0.1, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
    for (let i = 0; i < totals.length; i += 1) {
      await emitFitness(db, runId, `cand_${i}`, totals[i] ?? 0);
    }
    const out = await buildReplaySummary({ db, runId });
    expect(out.summary.fitnessHistogram.buckets).toHaveLength(10);
    const sum = out.summary.fitnessHistogram.buckets.reduce((a, b) => a + b, 0);
    expect(sum).toBe(totals.length);
    expect(out.summary.fitnessHistogram.min).toBe(0.1);
    expect(out.summary.fitnessHistogram.max).toBe(4.0);
  });
});
