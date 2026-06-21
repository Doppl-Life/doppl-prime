import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { buildCurrentState } from "../src/projections/current-state.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const VALID_RUN_CONFIG = {
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

const CANDIDATE_FIXTURE = (id: string, agenomeId: string, generationId: string) => ({
  id,
  runId: "run_cs",
  generationId,
  agenomeId,
  subtype: "cross_domain_transfer" as const,
  title: "Test candidate",
  summary: "Test summary",
  claims: [],
  evidenceRefs: [],
  status: "created" as const,
  subtypePayload: {
    sourceDomain: "biology",
    sourceTechnique: "selection",
    targetDomain: "ML",
    targetProblem: "collapse",
    transferMapping: "fitness to loss",
    expectedMechanism: "diversity sampler",
  },
});

describe("spec(§9) buildCurrentState", () => {
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

  test("empty event log → empty state, no entities", async () => {
    const out = await buildCurrentState({ db, runId: "run_empty" });
    expect(out.state.runId).toBeNull();
    expect(out.state.run).toBeUndefined();
    expect(Object.keys(out.state.candidates)).toEqual([]);
    expect(out.sequenceThrough).toBe(-1);
  });

  test("run lifecycle: configured → started → completed lands status=completed", async () => {
    const runId = "run_lifecycle";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
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
      payload: { completedAt: new Date().toISOString(), terminalSummary: "ok" },
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.run?.status).toBe("completed");
    expect(out.state.run?.terminalReason).toBe("ok");
  });

  test("run.failed lands status=failed with reason", async () => {
    const runId = "run_failed";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId,
      type: "run.failed",
      actor: "runtime",
      payload: { completedAt: new Date().toISOString(), reason: "energy_exhausted" },
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.run?.status).toBe("failed");
    expect(out.state.run?.terminalReason).toBe("energy_exhausted");
  });

  test("generation lifecycle: started → completed reflects candidate count", async () => {
    const runId = "run_gen";
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
      payload: { completedAt: new Date().toISOString(), candidateCount: 3 },
      generationId: "gen_0",
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.generations.gen_0?.status).toBe("completed");
    expect(out.state.generations.gen_0?.candidateCount).toBe(3);
  });

  test("candidate.created populates candidates + autocreates the agenome", async () => {
    const runId = "run_cs";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_1", "ag_1", "gen_0") },
      candidateId: "cand_1",
      agenomeId: "ag_1",
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.candidates.cand_1?.agenomeId).toBe("ag_1");
    expect(out.state.candidates.cand_1?.subtype).toBe("cross_domain_transfer");
    expect(out.state.candidates.cand_1?.title).toBe("Test candidate");
    expect(out.state.candidates.cand_1?.summary).toBe("Test summary");
    expect(out.state.candidates.cand_1?.claims).toEqual([]);
    expect(out.state.candidates.cand_1?.evidenceRefs).toEqual([]);
    expect(out.state.candidates.cand_1?.subtypePayload).toMatchObject({
      sourceDomain: "biology",
      targetDomain: "ML",
    });
    expect(out.state.agenomes.ag_1).toBeDefined();
    expect(out.state.agenomes.ag_1?.parentIds).toEqual([]);
  });

  test("candidate.created with explanation populates the optional field on the row", async () => {
    const runId = "run_cs_expl";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: {
        candidate: {
          ...CANDIDATE_FIXTURE("cand_e", "ag_e", "gen_0"),
          runId,
          explanation: "In plain English: a clear analogy.",
        },
      },
      candidateId: "cand_e",
      agenomeId: "ag_e",
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.candidates.cand_e?.explanation).toBe("In plain English: a clear analogy.");
  });

  test("candidate.created without explanation omits the field from the row", async () => {
    const runId = "run_cs_no_expl";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: { ...CANDIDATE_FIXTURE("cand_n", "ag_n", "gen_0"), runId } },
      candidateId: "cand_n",
      agenomeId: "ag_n",
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.candidates.cand_n?.explanation).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(out.state.candidates.cand_n ?? {}, "explanation"),
    ).toBe(false);
  });

  test("agenome.fused emits a lineage edge per parent", async () => {
    const runId = "run_fuse";
    const reproduction = {
      id: `rep_${randomUUID()}`,
      runId,
      parentAgenomeIds: ["ag_a", "ag_b"],
      childAgenomeId: "ag_child",
      mode: "fusion" as const,
      crossoverPoints: ["p1"],
      mutationSummary: "test",
    };
    await appendEvent(db, {
      runId,
      type: "agenome.fused",
      actor: "selection_controller",
      payload: { reproduction },
      agenomeId: "ag_child",
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.agenomes.ag_child).toBeDefined();
    expect(out.state.agenomes.ag_child?.parentIds).toEqual(["ag_a", "ag_b"]);
    expect(out.state.lineageEdges).toHaveLength(2);
    expect(out.state.lineageEdges.map((e) => e.source).sort()).toEqual(["ag_a", "ag_b"]);
  });

  test("novelty vector preserved byte-identically (no recomputation)", async () => {
    const runId = "run_nov";
    const novelty = {
      id: `nov_${randomUUID()}`,
      candidateId: "cand_n",
      vector: [0.1, 0.2, 0.3, 0.4, 0.5],
      embeddingModelId: "text-embedding-3-large",
      dimension: 5,
      comparisonSet: [],
      method: "embedding_cosine_mean" as const,
      score: 0.42,
      explanation: "test",
    };
    await appendEvent(db, {
      runId,
      type: "novelty.scored",
      actor: "selection_controller",
      payload: { novelty },
      candidateId: "cand_n",
    });
    const out = await buildCurrentState({ db, runId });
    const stored = out.state.noveltyScores[novelty.id];
    expect(stored?.vector).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(stored?.embeddingModelId).toBe("text-embedding-3-large");
  });

  test("fitness.scored captures decomposed components + policyVersion", async () => {
    const runId = "run_fit";
    const fitness = {
      id: `fit_${randomUUID()}`,
      candidateId: "cand_f",
      total: 2.66,
      components: { critic: 0.62, subtype_check: 0.8, novelty: 0.43, judge_acceptance: 0.8 },
      policyVersion: "v1",
      explanation: "test explanation",
    };
    await appendEvent(db, {
      runId,
      type: "fitness.scored",
      actor: "selection_controller",
      payload: { fitness },
      candidateId: "cand_f",
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.fitnessScores[fitness.id]?.total).toBeCloseTo(2.66, 10);
    expect(out.state.fitnessScores[fitness.id]?.policyVersion).toBe("v1");
  });

  test("idempotent re-fold: building twice yields the same state", async () => {
    const runId = "run_idem";
    await appendEvent(db, {
      runId,
      type: "run.configured",
      actor: "operator",
      payload: { config: VALID_RUN_CONFIG },
    });
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_x", "ag_x", "gen_0") },
      candidateId: "cand_x",
      agenomeId: "ag_x",
    });
    const a = await buildCurrentState({ db, runId });
    const b = await buildCurrentState({ db, runId });
    expect(a.state).toEqual(b.state);
    expect(a.sequenceThrough).toBe(b.sequenceThrough);
  });

  test("candidate_invalidated moves the candidate to status=invalid", async () => {
    const runId = "run_inv";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_inv", "ag_z", "gen_0") },
      candidateId: "cand_inv",
      agenomeId: "ag_z",
    });
    await appendEvent(db, {
      runId,
      type: "candidate_invalidated",
      actor: "runtime",
      payload: { candidateId: "cand_inv", reason: "schema_rejected" },
      candidateId: "cand_inv",
    });
    const out = await buildCurrentState({ db, runId });
    expect(out.state.candidates.cand_inv?.status).toBe("invalid");
  });
});
