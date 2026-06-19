import { randomUUID } from "node:crypto";
import type { NoveltyScore } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { SCORING_POLICY_V1 } from "../src/selection/fitness/policy.js";
import { scoreFitness } from "../src/selection/fitness/score-fitness.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

async function emitCriticReview(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  candidateId: string,
  mandate:
    | "factual_grounding"
    | "novelty_prior_art"
    | "feasibility"
    | "falsification"
    | "subtype_specific",
  confidence: number,
): Promise<void> {
  await appendEvent(db, {
    runId,
    type: "critic.reviewed",
    actor: "critic",
    payload: {
      review: {
        id: `crit_${randomUUID()}`,
        candidateId,
        mandate,
        scores: {},
        critique: "t",
        confidence,
        evidenceRefs: [],
      },
    },
    candidateId,
    correlationId: `corr_${randomUUID()}`,
  });
}

async function emitCheck(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  candidateId: string,
  checkType: string,
  status: "passed" | "failed" | "skipped",
  score?: number,
): Promise<void> {
  const result: Record<string, unknown> = {
    id: `chk_${randomUUID()}`,
    candidateId,
    checkType,
    status,
    evidenceRefs: [],
  };
  if (score !== undefined) result.score = score;
  if (status === "skipped") result.skipReason = "t";
  await appendEvent(db, {
    runId,
    type: "check.completed",
    actor: status === "skipped" ? "runtime" : "check_runner",
    payload: { result },
    candidateId,
    correlationId: `corr_${randomUUID()}`,
  });
}

async function emitEnergy(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  agenomeId: string,
  spend: number,
): Promise<void> {
  await appendEvent(db, {
    runId,
    type: "energy.spent",
    actor: "runtime",
    payload: {
      energy: {
        id: randomUUID(),
        runId,
        agenomeId,
        eventType: "llm",
        estimate: spend,
        actual: spend,
        unit: "doppl_energy",
        reason: "t",
      },
    },
    agenomeId,
    correlationId: `corr_${randomUUID()}`,
  });
}

function makeNoveltyScore(candidateId: string, score: number): NoveltyScore {
  return {
    id: `nov_${randomUUID()}`,
    candidateId,
    vector: [1, 0, 0],
    embeddingModelId: "text-embedding-3-large",
    dimension: 3,
    comparisonSet: [],
    method: "embedding_cosine_mean",
    score,
    explanation: "test",
  };
}

describe("spec(§8) scoreFitness — end-to-end", () => {
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

  test("happy path: all 5 components present → fitness.scored event with full explanation", async () => {
    const runId = "run_f1";
    const candidateId = "cand_f1";
    const agenomeId = "ag_f1";

    // critic: 5 mandates at 0.5 → critic = 0.5
    const mandates: (
      | "factual_grounding"
      | "novelty_prior_art"
      | "feasibility"
      | "falsification"
      | "subtype_specific"
    )[] = [
      "factual_grounding",
      "novelty_prior_art",
      "feasibility",
      "falsification",
      "subtype_specific",
    ];
    for (const m of mandates) {
      await emitCriticReview(db, runId, candidateId, m, 0.5);
    }
    // subtype: 5/5 passed → subtype_check = 1.0
    for (const ct of [
      "transfer.source_validity",
      "transfer.target_fit",
      "transfer.mapping_quality",
      "transfer.prior_art",
      "transfer.allowlisted_executable",
    ]) {
      await emitCheck(db, runId, candidateId, ct, "passed", 1);
    }
    // judge: 20/25 → judge_acceptance = 0.8
    await emitCheck(db, runId, candidateId, "final_judge", "passed", 20);
    // energy: 9 → energy_efficiency = 1/10 = 0.1
    await emitEnergy(db, runId, agenomeId, 9);

    const novelty = makeNoveltyScore(candidateId, 1.0); // normalized to 0.5

    const eventBucket: { count: number } = { count: 0 };
    const appendBound = async (e: Parameters<typeof appendEvent>[1]) => {
      eventBucket.count += 1;
      return appendEvent(db, e);
    };

    const out = await scoreFitness({
      db,
      appendEvent: appendBound,
      runId,
      candidateId,
      agenomeId,
      novelty,
      policy: SCORING_POLICY_V1,
      correlationId: "corr_f1",
    });

    // critic(0.5) + subtype(1.0) + novelty(0.5) + judge(0.8) + energy(0.1×0.1=0.01) = 2.81
    expect(out.fitness.total).toBeCloseTo(2.81, 2);
    expect(out.fitness.policyVersion).toBe("v1");
    expect(out.fitness.explanation).toContain("policyVersion=v1");
    expect(eventBucket.count).toBe(1);
  });

  test("judge missing → component absent, explanation flags it", async () => {
    const runId = "run_f2";
    const candidateId = "cand_f2";
    const agenomeId = "ag_f2";

    // Only critic for one mandate → critic=0.2/5=...
    await emitCriticReview(db, runId, candidateId, "factual_grounding", 1.0);

    const novelty = makeNoveltyScore(candidateId, 0);
    const out = await scoreFitness({
      db,
      appendEvent: (e) => appendEvent(db, e),
      runId,
      candidateId,
      agenomeId,
      novelty,
      policy: SCORING_POLICY_V1,
      correlationId: "corr_f2",
    });

    expect(out.fitness.explanation).toContain("judge_acceptance: raw=null");
  });

  test("idempotent: same inputs + same policy → same total across two calls", async () => {
    const runId = "run_f3";
    const candidateId = "cand_f3";
    const agenomeId = "ag_f3";
    await emitCriticReview(db, runId, candidateId, "factual_grounding", 0.5);
    const novelty = makeNoveltyScore(candidateId, 1.0);
    const first = await scoreFitness({
      db,
      appendEvent: (e) => appendEvent(db, e),
      runId,
      candidateId,
      agenomeId,
      novelty,
      policy: SCORING_POLICY_V1,
      correlationId: "corr_f3a",
    });
    const second = await scoreFitness({
      db,
      appendEvent: (e) => appendEvent(db, e),
      runId,
      candidateId,
      agenomeId,
      novelty,
      policy: SCORING_POLICY_V1,
      correlationId: "corr_f3b",
    });
    expect(first.fitness.total).toBe(second.fitness.total);
  });

  test("novelty score 0 → component 0, novelty score 2 (max distance) → component 1", async () => {
    const runId = "run_f4";
    const candidateId = "cand_f4";
    const agenomeId = "ag_f4";
    const novOut0 = await scoreFitness({
      db,
      appendEvent: (e) => appendEvent(db, e),
      runId,
      candidateId,
      agenomeId,
      novelty: makeNoveltyScore(candidateId, 0),
      policy: SCORING_POLICY_V1,
      correlationId: "corr_f4_0",
    });
    expect(novOut0.components.novelty).toBe(0);

    const novOut2 = await scoreFitness({
      db,
      appendEvent: (e) => appendEvent(db, e),
      runId,
      candidateId,
      agenomeId,
      novelty: makeNoveltyScore(candidateId, 2),
      policy: SCORING_POLICY_V1,
      correlationId: "corr_f4_2",
    });
    expect(novOut2.components.novelty).toBe(1);
  });
});
