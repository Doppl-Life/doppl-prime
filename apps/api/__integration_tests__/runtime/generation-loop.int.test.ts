import type { Agenome, ModelGatewayRequest, ModelGatewayResponse, RunCaps } from "@doppl/contracts";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { replayReader } from "../../src/event-store/replay-reader.js";
import type { ModelGateway } from "../../src/model-gateway/gateway.js";
import { createCapEnforcer, createKillSwitch } from "../../src/runtime/caps.js";
import { createEnergyLedger } from "../../src/runtime/energy-ledger.js";
import { runGeneration } from "../../src/runtime/generation-loop.js";
import { createSeededRng } from "../../src/runtime/rng.js";
import { materializeGen0Bundle } from "../../src/runtime/seeds/gen-0-agenomes.js";
import { type PgContainerHandle, startPgContainer } from "../helpers/pg-container.js";

const CAPS: RunCaps = {
  maxPopulation: 10,
  maxGenerations: 3,
  energyBudget: 10_000,
  maxSpawnDepth: 2,
  maxToolCalls: 50,
  wallClockTimeoutMs: 60_000,
};

function makeValidCandidatePayload(agenomeId: string, idx: number): unknown {
  return {
    subtype: "cross_domain_transfer",
    title: `Candidate ${idx} from ${agenomeId}`,
    summary: "Test candidate",
    sourceDomain: "biology",
    sourceTechnique: "selection pressure",
    targetDomain: "ML",
    targetProblem: "model collapse",
    transferMapping: "fitness → loss",
    expectedMechanism: "diversity-preserving sampler",
  };
}

interface MakeGatewayOptions {
  /** Per-call result returner; defaults to always-valid candidate. */
  resolve?: (
    req: ModelGatewayRequest,
    callIndex: number,
  ) => ModelGatewayResponse | Promise<ModelGatewayResponse>;
}

function makeGateway(opts: MakeGatewayOptions = {}): ModelGateway {
  let callIndex = 0;
  return {
    async invoke(request: ModelGatewayRequest): Promise<ModelGatewayResponse> {
      const idx = callIndex;
      callIndex += 1;
      if (opts.resolve) return opts.resolve(request, idx);
      return {
        ok: true,
        output: JSON.stringify(makeValidCandidatePayload(request.agenomeId ?? "ag", idx)),
        repairAttempts: 0,
        energyEstimate: 5,
        energyActual: 5,
      };
    },
  };
}

describe("spec(§3 / §5) runGeneration — generation loop orchestrator", () => {
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
    await handle.pool.query("DELETE FROM runs");
  });

  async function setup(opts: MakeGatewayOptions = {}) {
    const runId = "run_loop_test";
    const agenomes = materializeGen0Bundle({
      runId,
      generationId: "gen_0",
      caps: CAPS,
    });
    const ledger = await createEnergyLedger({
      runId,
      budget: CAPS.energyBudget,
      replayReader: replayReader(db),
    });
    return {
      runId,
      agenomes,
      deps: {
        db,
        gateway: makeGateway(opts),
        killSwitch: createKillSwitch(),
        capEnforcer: createCapEnforcer(CAPS),
        ledger,
        rng: createSeededRng("seed-test"),
      },
    };
  }

  test("happy path — generation walks pending → completed and emits expected events", async () => {
    const { runId, agenomes, deps } = await setup();
    const result = await runGeneration(deps, {
      runId,
      generationIndex: 0,
      agenomes,
      caps: CAPS,
      wallClockStartMs: Date.now(),
      enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
    });
    expect(result.outcome).toBe("completed");

    const candidatesCreated = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id=$1 AND type='candidate.created'`,
      [runId],
    );
    expect(Number(candidatesCreated.rows[0]?.count)).toBe(agenomes.length);

    const generationCompleted = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id=$1 AND type='generation.completed'`,
      [runId],
    );
    expect(Number(generationCompleted.rows[0]?.count)).toBe(1);
  });

  test("partial failure — 1 of N candidates invalid → degraded edge taken; remaining candidates created", async () => {
    let okCount = 0;
    const resolve: MakeGatewayOptions["resolve"] = (req, _idx) => {
      okCount += 1;
      if (okCount === 1) {
        return {
          ok: false,
          repairAttempts: 1,
          validationError: "deliberately malformed",
          energyEstimate: 5,
        };
      }
      return {
        ok: true,
        output: JSON.stringify(makeValidCandidatePayload(req.agenomeId ?? "ag", okCount)),
        repairAttempts: 0,
        energyEstimate: 5,
        energyActual: 5,
      };
    };
    const { runId, agenomes, deps } = await setup({ resolve });
    const result = await runGeneration(deps, {
      runId,
      generationIndex: 0,
      agenomes,
      caps: CAPS,
      wallClockStartMs: Date.now(),
      enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
    });
    expect(result.outcome).toBe("completed");

    const created = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id=$1 AND type='candidate.created'`,
      [runId],
    );
    expect(Number(created.rows[0]?.count)).toBe(agenomes.length - 1);

    const invalidated = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id=$1 AND type='candidate_invalidated'`,
      [runId],
    );
    expect(Number(invalidated.rows[0]?.count)).toBe(1);
  });

  test("zero survivors — ALL candidates invalid → generation completes with no surviving candidates", async () => {
    const resolve: MakeGatewayOptions["resolve"] = () => ({
      ok: false,
      repairAttempts: 1,
      validationError: "all fail",
      energyEstimate: 5,
    });
    const { runId, agenomes, deps } = await setup({ resolve });
    const result = await runGeneration(deps, {
      runId,
      generationIndex: 0,
      agenomes,
      caps: CAPS,
      wallClockStartMs: Date.now(),
      enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
    });
    expect(result.outcome).toBe("completed");
    expect(result.survivingCandidateCount).toBe(0);

    const invalidated = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id=$1 AND type='candidate_invalidated'`,
      [runId],
    );
    expect(Number(invalidated.rows[0]?.count)).toBe(agenomes.length);
  });

  test("kill switch triggered mid-generation → outcome='stopped' + no further candidate.created events", async () => {
    const { runId, agenomes, deps } = await setup();
    deps.killSwitch.requestStop("operator request");
    const result = await runGeneration(deps, {
      runId,
      generationIndex: 0,
      agenomes,
      caps: CAPS,
      wallClockStartMs: Date.now(),
      enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
    });
    expect(result.outcome).toBe("stopped");

    const created = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id=$1 AND type='candidate.created'`,
      [runId],
    );
    expect(Number(created.rows[0]?.count)).toBe(0);
  });

  test("energy cap exhausted → outcome='failed' + energy_exhausted event", async () => {
    const TIGHT_CAPS: RunCaps = { ...CAPS, energyBudget: 1 };
    const { runId, agenomes } = await setup();
    // Re-create ledger + enforcer with the tight cap.
    const tightLedger = await createEnergyLedger({
      runId,
      budget: TIGHT_CAPS.energyBudget,
      replayReader: replayReader(db),
    });
    const result = await runGeneration(
      {
        db,
        gateway: makeGateway(),
        killSwitch: createKillSwitch(),
        capEnforcer: createCapEnforcer(TIGHT_CAPS),
        ledger: tightLedger,
        rng: createSeededRng("seed-test"),
      },
      {
        runId,
        generationIndex: 0,
        agenomes,
        caps: TIGHT_CAPS,
        wallClockStartMs: Date.now(),
        enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"],
      },
    );
    expect(result.outcome).toBe("failed");
    expect(result.failedCap).toBe("energyBudget");

    const exhausted = await handle.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM run_events
       WHERE run_id=$1 AND type='energy_exhausted'`,
      [runId],
    );
    expect(Number(exhausted.rows[0]?.count)).toBe(1);
  });
});
