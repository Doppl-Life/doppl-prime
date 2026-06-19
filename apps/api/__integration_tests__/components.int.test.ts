import { randomUUID } from "node:crypto";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { appendEvent } from "../src/event-store/append.js";
import { criticScoreForCandidate } from "../src/selection/components/critic-scores.js";
import { judgeAcceptanceForCandidate } from "../src/selection/components/judge-acceptance.js";
import { subtypeCheckScoreForCandidate } from "../src/selection/components/subtype-checks.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

type Mandate =
  | "factual_grounding"
  | "novelty_prior_art"
  | "feasibility"
  | "falsification"
  | "subtype_specific";

async function emitCriticReview(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  candidateId: string,
  mandate: Mandate,
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
        scores: { grounding: confidence },
        critique: "test",
        confidence,
        evidenceRefs: [],
      },
    },
    candidateId,
    correlationId: `corr_${randomUUID()}`,
  });
}

async function emitCheckCompleted(
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
  if (status === "skipped") result.skipReason = "test_skip";
  await appendEvent(db, {
    runId,
    type: "check.completed",
    actor: status === "skipped" ? "runtime" : "check_runner",
    payload: { result },
    candidateId,
    correlationId: `corr_${randomUUID()}`,
  });
}

describe("spec(§8) criticScoreForCandidate", () => {
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

  test("5 mandates with full confidences → mean", async () => {
    const confidences: [Mandate, number][] = [
      ["factual_grounding", 0.6],
      ["novelty_prior_art", 0.7],
      ["feasibility", 0.5],
      ["falsification", 0.8],
      ["subtype_specific", 0.4],
    ];
    for (const [m, c] of confidences) {
      await emitCriticReview(db, "run_c", "cand_c", m, c);
    }
    const score = await criticScoreForCandidate({ db, runId: "run_c", candidateId: "cand_c" });
    expect(score).toBeCloseTo((0.6 + 0.7 + 0.5 + 0.8 + 0.4) / 5, 10);
  });

  test("3 accepted + 2 missing → mean over 5 with zeros for missing", async () => {
    await emitCriticReview(db, "run_c2", "cand_c2", "factual_grounding", 0.6);
    await emitCriticReview(db, "run_c2", "cand_c2", "novelty_prior_art", 0.7);
    await emitCriticReview(db, "run_c2", "cand_c2", "feasibility", 0.5);
    const score = await criticScoreForCandidate({ db, runId: "run_c2", candidateId: "cand_c2" });
    expect(score).toBeCloseTo((0.6 + 0.7 + 0.5) / 5, 10);
  });

  test("0 reviews → 0", async () => {
    const score = await criticScoreForCandidate({ db, runId: "run_c3", candidateId: "cand_c3" });
    expect(score).toBe(0);
  });

  test("reviews for other candidates do not contribute", async () => {
    await emitCriticReview(db, "run_c4", "cand_other", "factual_grounding", 1.0);
    const score = await criticScoreForCandidate({
      db,
      runId: "run_c4",
      candidateId: "cand_target",
    });
    expect(score).toBe(0);
  });
});

describe("spec(§8) subtypeCheckScoreForCandidate", () => {
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

  test("4 passed + 1 skipped → (4 + 0.5) / 5 = 0.9", async () => {
    await emitCheckCompleted(db, "run_s", "cand_s", "transfer.source_validity", "passed", 1.0);
    await emitCheckCompleted(db, "run_s", "cand_s", "transfer.target_fit", "passed", 1.0);
    await emitCheckCompleted(db, "run_s", "cand_s", "transfer.mapping_quality", "passed", 1.0);
    await emitCheckCompleted(db, "run_s", "cand_s", "transfer.prior_art", "skipped");
    await emitCheckCompleted(
      db,
      "run_s",
      "cand_s",
      "transfer.allowlisted_executable",
      "passed",
      1.0,
    );
    const score = await subtypeCheckScoreForCandidate({
      db,
      runId: "run_s",
      candidateId: "cand_s",
    });
    expect(score).toBeCloseTo(0.9, 10);
  });

  test("final_judge check is excluded", async () => {
    await emitCheckCompleted(db, "run_s2", "cand_s2", "transfer.source_validity", "passed", 1.0);
    await emitCheckCompleted(db, "run_s2", "cand_s2", "final_judge", "passed", 25);
    const score = await subtypeCheckScoreForCandidate({
      db,
      runId: "run_s2",
      candidateId: "cand_s2",
    });
    expect(score).toBeCloseTo(1 / 5, 10);
  });

  test("all failed → 0", async () => {
    await emitCheckCompleted(db, "run_s3", "cand_s3", "transfer.source_validity", "failed");
    const score = await subtypeCheckScoreForCandidate({
      db,
      runId: "run_s3",
      candidateId: "cand_s3",
    });
    expect(score).toBe(0);
  });
});

describe("spec(§8) judgeAcceptanceForCandidate", () => {
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

  test("judge present with score 20 → 20/25 = 0.8", async () => {
    await emitCheckCompleted(db, "run_j", "cand_j", "final_judge", "passed", 20);
    const score = await judgeAcceptanceForCandidate({ db, runId: "run_j", candidateId: "cand_j" });
    expect(score).toBeCloseTo(0.8, 10);
  });

  test("judge missing → null", async () => {
    const score = await judgeAcceptanceForCandidate({
      db,
      runId: "run_j2",
      candidateId: "cand_j2",
    });
    expect(score).toBeNull();
  });

  test("non-judge checks do not contribute", async () => {
    await emitCheckCompleted(db, "run_j3", "cand_j3", "transfer.source_validity", "passed", 1);
    const score = await judgeAcceptanceForCandidate({
      db,
      runId: "run_j3",
      candidateId: "cand_j3",
    });
    expect(score).toBeNull();
  });
});
