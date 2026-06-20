import { randomUUID } from "node:crypto";
import { LineageGraphProjection } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { buildLineageGraph } from "../src/projections/lineage-graph.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

const CANDIDATE_FIXTURE = (id: string, agenomeId: string) => ({
  id,
  runId: "run_lg",
  generationId: "gen_0",
  agenomeId,
  subtype: "cross_domain_transfer" as const,
  title: "T",
  summary: "S",
  claims: [],
  evidenceRefs: [],
  status: "created" as const,
  subtypePayload: {
    sourceDomain: "biology",
    sourceTechnique: "selection",
    targetDomain: "ML",
    targetProblem: "x",
    transferMapping: "y",
    expectedMechanism: "z",
  },
});

describe("spec(§9) buildLineageGraph", () => {
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

  test("empty event log → empty graph; graph.sequenceThrough coerced to 0 for schema validity (-1 internally)", async () => {
    const out = await buildLineageGraph({ db, runId: "run_empty" });
    expect(out.graph.runId).toBe("run_empty");
    expect(out.graph.nodes).toEqual([]);
    expect(out.graph.edges).toEqual([]);
    expect(out.graph.sequenceThrough).toBe(0);
    expect(out.sequenceThrough).toBe(-1);
  });

  test("output passes LineageGraphProjection schema", async () => {
    const runId = "run_schema";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_1", "ag_1") },
      candidateId: "cand_1",
      agenomeId: "ag_1",
    });
    const out = await buildLineageGraph({ db, runId });
    expect(() => LineageGraphProjection.parse(out.graph)).not.toThrow();
  });

  test("candidate.created produces 1 agenome + 1 candidate node + 1 owns_candidate edge", async () => {
    const runId = "run_simple";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_1", "ag_1") },
      candidateId: "cand_1",
      agenomeId: "ag_1",
    });
    const out = await buildLineageGraph({ db, runId });
    expect(out.graph.nodes).toHaveLength(2);
    expect(out.graph.nodes.find((n) => n.type === "agenome")?.id).toBe("ag_1");
    expect(out.graph.nodes.find((n) => n.type === "candidate")?.id).toBe("cand_1");
    expect(out.graph.edges).toHaveLength(1);
    expect(out.graph.edges[0]?.type).toBe("owns_candidate");
    expect(out.graph.edges[0]?.source).toBe("ag_1");
    expect(out.graph.edges[0]?.target).toBe("cand_1");
  });

  test("critic.reviewed and check.completed produce review + check nodes with edges back to candidate", async () => {
    const runId = "run_evidence";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_e", "ag_e") },
      candidateId: "cand_e",
      agenomeId: "ag_e",
    });
    const reviewId = `crit_${randomUUID()}`;
    await appendEvent(db, {
      runId,
      type: "critic.reviewed",
      actor: "critic",
      payload: {
        review: {
          id: reviewId,
          candidateId: "cand_e",
          mandate: "factual_grounding",
          scores: {},
          critique: "t",
          confidence: 0.7,
          evidenceRefs: [],
        },
      },
      candidateId: "cand_e",
    });
    const checkId = `chk_${randomUUID()}`;
    await appendEvent(db, {
      runId,
      type: "check.completed",
      actor: "check_runner",
      payload: {
        result: {
          id: checkId,
          candidateId: "cand_e",
          checkType: "transfer.source_validity",
          status: "passed",
          score: 1,
          evidenceRefs: [],
        },
      },
      candidateId: "cand_e",
    });
    const out = await buildLineageGraph({ db, runId });

    const reviewNode = out.graph.nodes.find((n) => n.type === "critic_review");
    expect(reviewNode?.id).toBe(reviewId);
    expect(reviewNode?.metrics?.confidence).toBe(0.7);

    const checkNode = out.graph.nodes.find((n) => n.type === "check_result");
    expect(checkNode?.id).toBe(checkId);
    expect(checkNode?.metrics?.score).toBe(1);

    const reviewEdge = out.graph.edges.find((e) => e.type === "reviews");
    expect(reviewEdge?.source).toBe(reviewId);
    expect(reviewEdge?.target).toBe("cand_e");

    const checkEdge = out.graph.edges.find((e) => e.type === "checks");
    expect(checkEdge?.source).toBe(checkId);
    expect(checkEdge?.target).toBe("cand_e");
  });

  test("fitness.scored emits a scoring node + a scores edge", async () => {
    const runId = "run_fitness";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_f", "ag_f") },
      candidateId: "cand_f",
      agenomeId: "ag_f",
    });
    const fitnessId = `fit_${randomUUID()}`;
    await appendEvent(db, {
      runId,
      type: "fitness.scored",
      actor: "selection_controller",
      payload: {
        fitness: {
          id: fitnessId,
          candidateId: "cand_f",
          total: 2.6,
          components: {},
          policyVersion: "v1",
          explanation: "t",
        },
      },
      candidateId: "cand_f",
    });
    const out = await buildLineageGraph({ db, runId });
    const scoring = out.graph.nodes.find((n) => n.type === "scoring");
    expect(scoring?.metrics?.total).toBe(2.6);
    expect(scoring?.label).toBe("fitness:v1");
    const edge = out.graph.edges.find((e) => e.type === "scores");
    expect(edge?.target).toBe("cand_f");
  });

  test("agenome.fused emits lineage edges from each parent to the child", async () => {
    const runId = "run_lineage_edge";
    const reproduction = {
      id: `rep_${randomUUID()}`,
      runId,
      parentAgenomeIds: ["ag_p1", "ag_p2"],
      childAgenomeId: "ag_child",
      mode: "fusion" as const,
      crossoverPoints: [],
      mutationSummary: "t",
    };
    await appendEvent(db, {
      runId,
      type: "agenome.fused",
      actor: "selection_controller",
      payload: { reproduction },
      agenomeId: "ag_child",
    });
    const out = await buildLineageGraph({ db, runId });
    const lineageEdges = out.graph.edges.filter((e) => e.type === "lineage");
    expect(lineageEdges).toHaveLength(2);
    expect(lineageEdges.every((e) => e.target === "ag_child")).toBe(true);
    expect(lineageEdges.map((e) => e.label).every((l) => l === "fusion")).toBe(true);
  });

  test("sequenceThrough equals the last event's sequence", async () => {
    const runId = "run_through";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_t", "ag_t") },
      candidateId: "cand_t",
      agenomeId: "ag_t",
    });
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_u", "ag_u") },
      candidateId: "cand_u",
      agenomeId: "ag_u",
    });
    const out = await buildLineageGraph({ db, runId });
    expect(out.graph.sequenceThrough).toBe(1);
  });

  test("dataRef on every node points to a non-empty string (Postgres-tier ref)", async () => {
    const runId = "run_dataref";
    await appendEvent(db, {
      runId,
      type: "candidate.created",
      actor: "agenome",
      payload: { candidate: CANDIDATE_FIXTURE("cand_d", "ag_d") },
      candidateId: "cand_d",
      agenomeId: "ag_d",
    });
    const out = await buildLineageGraph({ db, runId });
    for (const node of out.graph.nodes) {
      expect(node.dataRef).toBeDefined();
      expect(node.dataRef?.length).toBeGreaterThan(0);
    }
  });
});
