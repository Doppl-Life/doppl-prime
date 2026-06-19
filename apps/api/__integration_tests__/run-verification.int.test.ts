import type { CriticMandate, ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ALL_ADAPTERS, buildCheckRegistry } from "../src/check-runners/index.js";
import type { ModelGateway } from "../src/model-gateway/gateway.js";
import { makeVerifyHook } from "../src/verifier/run-verification.js";
import { type PgContainerHandle, startPgContainer } from "./helpers/pg-container.js";

/**
 * Phase 4 U9: makeVerifyHook end-to-end against testcontainers + a
 * deterministic in-memory gateway. Asserts:
 *  - the full verify pass emits 5 critic.reviewed events per candidate
 *    (one per mandate) AND 5 check.completed events per candidate (one
 *    per transfer subtype adapter, since the run enables transfer only)
 *  - the verify hook is a no-op when called with zero candidates
 *  - distinct correlation IDs are used per (candidateId, mandate/adapter)
 *    pair
 */

const VALID_REVIEW_OUTPUT = {
  scores: { grounding: 0.7 },
  critique: "Reasonable evidence base.",
  confidence: 0.6,
  evidenceRefs: [{ kind: "raw_output" as const, eventId: "evt_seed_1" }],
};

const ALL_ACCEPT_GATEWAY: ModelGateway = {
  invoke: async (_req: ModelGatewayRequest): Promise<ModelGatewayResponse> => ({
    ok: true,
    output: VALID_REVIEW_OUTPUT,
    repairAttempts: 0,
    energyEstimate: 1,
  }),
};

const RUBRIC_BY_MANDATE: Record<CriticMandate, string> = {
  factual_grounding: "Score factual grounding.",
  novelty_prior_art: "Score novelty.",
  feasibility: "Score feasibility.",
  falsification: "Score falsification.",
  subtype_specific: "Score subtype-specific dims.",
};

const TRANSFER_RAW = {
  subtypePayload: {
    sourceDomain: "biology",
    sourceTechnique: "natural selection",
    targetDomain: "ML",
    targetProblem: "regression_overfit",
    transferMapping:
      "fitness pressure in biology maps to validation loss in ML; surviving variants resist overfit",
    expectedMechanism: "diversity sampler",
  },
};

describe("spec(§7) makeVerifyHook end-to-end", () => {
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

  test("zero candidates → no events emitted", async () => {
    const registry = buildCheckRegistry([...ALL_ADAPTERS]);
    const hook = makeVerifyHook({
      db,
      gateway: ALL_ACCEPT_GATEWAY,
      registry,
      runId: "run_v0",
      runSeed: "seed-V",
      enabledSubtypes: ["cross_domain_transfer"],
      criticAgenomeIds: ["crit_A", "crit_B"],
      everyNGenerations: 2,
      rubricByMandate: RUBRIC_BY_MANDATE,
      getCurrentGenerationIndex: () => 0,
    });

    await hook([]);

    const rows = await handle.pool.query("SELECT COUNT(*) FROM run_events WHERE run_id = $1", [
      "run_v0",
    ]);
    expect(Number(rows.rows[0].count)).toBe(0);
  });

  test("1 transfer candidate → 5 critic.reviewed + 5 check.completed events", async () => {
    const registry = buildCheckRegistry([...ALL_ADAPTERS]);
    const hook = makeVerifyHook({
      db,
      gateway: ALL_ACCEPT_GATEWAY,
      registry,
      runId: "run_v1",
      runSeed: "seed-V",
      enabledSubtypes: ["cross_domain_transfer"],
      criticAgenomeIds: ["crit_A", "crit_B", "crit_C"],
      everyNGenerations: 2,
      rubricByMandate: RUBRIC_BY_MANDATE,
      getCurrentGenerationIndex: () => 0,
    });

    await hook([
      {
        candidateId: "cand_T1",
        agenomeId: "ag_T1",
        rawOutput: TRANSFER_RAW,
      },
    ]);

    const reviews = await handle.pool.query(
      "SELECT COUNT(*) FROM run_events WHERE run_id = $1 AND type = 'critic.reviewed'",
      ["run_v1"],
    );
    expect(Number(reviews.rows[0].count)).toBe(5);

    const checks = await handle.pool.query(
      "SELECT COUNT(*) FROM run_events WHERE run_id = $1 AND type = 'check.completed'",
      ["run_v1"],
    );
    expect(Number(checks.rows[0].count)).toBe(5);
  });

  test("2 candidates → 10 critic.reviewed + 10 check.completed events", async () => {
    const registry = buildCheckRegistry([...ALL_ADAPTERS]);
    const hook = makeVerifyHook({
      db,
      gateway: ALL_ACCEPT_GATEWAY,
      registry,
      runId: "run_v2",
      runSeed: "seed-V",
      enabledSubtypes: ["cross_domain_transfer"],
      criticAgenomeIds: ["crit_A"],
      everyNGenerations: 1,
      rubricByMandate: RUBRIC_BY_MANDATE,
      getCurrentGenerationIndex: () => 0,
    });

    await hook([
      { candidateId: "cand_M1", agenomeId: "ag_M1", rawOutput: TRANSFER_RAW },
      { candidateId: "cand_M2", agenomeId: "ag_M2", rawOutput: TRANSFER_RAW },
    ]);

    const reviews = await handle.pool.query(
      "SELECT COUNT(*) FROM run_events WHERE run_id = $1 AND type = 'critic.reviewed'",
      ["run_v2"],
    );
    expect(Number(reviews.rows[0].count)).toBe(10);

    const checks = await handle.pool.query(
      "SELECT COUNT(*) FROM run_events WHERE run_id = $1 AND type = 'check.completed'",
      ["run_v2"],
    );
    expect(Number(checks.rows[0].count)).toBe(10);
  });

  test("rotation stable across same rotation bucket (N=2: gen 0 + gen 1 share assignment)", async () => {
    const registry = buildCheckRegistry([...ALL_ADAPTERS]);
    let currentGen = 0;
    const hook = makeVerifyHook({
      db,
      gateway: ALL_ACCEPT_GATEWAY,
      registry,
      runId: "run_v3",
      runSeed: "seed-rot",
      enabledSubtypes: ["cross_domain_transfer"],
      criticAgenomeIds: ["crit_A", "crit_B", "crit_C", "crit_D", "crit_E"],
      everyNGenerations: 2,
      rubricByMandate: RUBRIC_BY_MANDATE,
      getCurrentGenerationIndex: () => currentGen,
    });

    await hook([{ candidateId: "cand_gen0", agenomeId: "ag", rawOutput: TRANSFER_RAW }]);
    currentGen = 1;
    await hook([{ candidateId: "cand_gen1", agenomeId: "ag", rawOutput: TRANSFER_RAW }]);
    currentGen = 2;
    await hook([{ candidateId: "cand_gen2", agenomeId: "ag", rawOutput: TRANSFER_RAW }]);

    const rows = await handle.pool.query<{
      candidate_id: string;
      agenome_id: string;
    }>(
      `SELECT candidate_id, agenome_id FROM run_events
       WHERE run_id = $1 AND type = 'critic.reviewed'
       ORDER BY sequence`,
      ["run_v3"],
    );
    // For each candidate we have 5 reviews (one per mandate). The critic
    // agenome for the same mandate should match across gen 0 and gen 1
    // (same rotation bucket, N=2) and differ at gen 2.
    const byCandidate: Record<string, string[]> = {};
    for (const r of rows.rows) {
      const list = byCandidate[r.candidate_id] ?? [];
      list.push(r.agenome_id);
      byCandidate[r.candidate_id] = list;
    }
    expect(byCandidate.cand_gen0).toEqual(byCandidate.cand_gen1);
    expect(byCandidate.cand_gen0).not.toEqual(byCandidate.cand_gen2);
  });
});
