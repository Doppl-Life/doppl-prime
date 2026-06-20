import type {
  Agenome,
  ModelGatewayRequest,
  ModelGatewayResponse,
  RunConfig,
} from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendEvent } from "../src/event-store/append.js";
import { replayReader } from "../src/event-store/replay-reader.js";
import type { ModelGateway } from "../src/model-gateway/gateway.js";
import { createCapEnforcer, createKillSwitch } from "../src/runtime/caps.js";
import { createEnergyLedger } from "../src/runtime/energy-ledger.js";
import { runGeneration } from "../src/runtime/generation-loop.js";
import { createSeededRng } from "../src/runtime/rng.js";
import { materializeGen0Bundle } from "../src/runtime/seeds/gen-0-agenomes.js";

/**
 * Live processRun for the boot-demo MVP. Replaces the prior placeholder
 * that marked configured runs failed without emitting events — this one
 * walks the run through `run.started → generation.* (×N) → run.completed`
 * by driving the existing generation-loop orchestrator.
 *
 * Gateway: in the absence of provider keys the run uses an in-process
 * stub gateway that returns deterministic, schema-valid candidate
 * payloads. The whole event taxonomy (agenome.spawned via candidates,
 * generation.started/completed, energy.spent, candidate.created) flows
 * exactly as a real run would — only the LLM call is faked. Swap
 * `createStubGateway` for `createGateway({ … })` once OPENROUTER_API_KEY
 * / OPENAI_API_KEY are wired through model-gateway/dispatcher.
 */

interface RunRow {
  id: string;
  config: RunConfig;
}

function makeValidCandidatePayload(agenomeId: string, idx: number): unknown {
  // Mirrors the shape the population_generator role is expected to emit
  // (matches the integration test's reference payload). The repair-state
  // edge will run safeParse and accept this as "under_review".
  return {
    subtype: "cross_domain_transfer",
    title: `Stub candidate ${idx} from ${agenomeId.slice(0, 8)}`,
    summary: "Synthetic candidate emitted by the boot-demo stub gateway.",
    sourceDomain: "biology",
    sourceTechnique: "selection pressure",
    targetDomain: "ML",
    targetProblem: "model collapse",
    transferMapping: "fitness → loss",
    expectedMechanism: "diversity-preserving sampler",
  };
}

/** Per-process stub gateway. Returns valid candidate JSON for every
 *  invoke, with a fixed energyActual so the ledger advances per call. */
function createStubGateway(): ModelGateway {
  let callIndex = 0;
  return {
    async invoke(request: ModelGatewayRequest): Promise<ModelGatewayResponse> {
      const idx = callIndex;
      callIndex += 1;
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

async function loadRun(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
): Promise<RunRow | null> {
  const result = await db.execute<{ id: string; config: RunConfig }>(
    sql`SELECT id, config FROM runs WHERE id = ${runId} LIMIT 1`,
  );
  const row = result.rows[0];
  return row ? { id: row.id, config: row.config } : null;
}

async function markRunStatus(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
  status: "running" | "completed" | "failed",
): Promise<void> {
  await db.execute(sql`
    UPDATE runs
    SET status = ${status},
        completed_at = CASE WHEN ${status} IN ('completed', 'failed') THEN NOW() ELSE completed_at END
    WHERE id = ${runId}
  `);
}

export interface CreateLiveProcessRunOptions {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  /** Override the gateway (e.g., real provider). Defaults to the stub. */
  gateway?: ModelGateway;
}

export function createLiveProcessRun(
  options: CreateLiveProcessRunOptions,
): (runId: string) => Promise<void> {
  const { db } = options;
  const gateway = options.gateway ?? createStubGateway();

  return async function liveProcessRun(runId: string): Promise<void> {
    const row = await loadRun(db, runId);
    if (!row) {
      process.stderr.write(`liveProcessRun: run ${runId} not found\n`);
      return;
    }
    const config = row.config;
    const caps = config.caps;
    const wallClockStartMs = Date.now();

    await markRunStatus(db, runId, "running");
    await appendEvent(db, {
      runId,
      type: "run.started",
      actor: "runtime",
      payload: { startedAt: new Date(wallClockStartMs).toISOString() },
    });

    const ledger = await createEnergyLedger({
      runId,
      budget: caps.energyBudget,
      replayReader: replayReader(db),
    });
    const killSwitch = createKillSwitch();
    const capEnforcer = createCapEnforcer(caps);
    const rng = createSeededRng(config.rngSeed);

    let agenomes: Agenome[] = materializeGen0Bundle({
      runId,
      generationId: "gen_0",
      caps,
    });

    let lastOutcome: "completed" | "failed" | "stopped" = "completed";
    let lastReason: string | undefined;

    for (let i = 0; i < caps.maxGenerations; i++) {
      const out = await runGeneration(
        { db, gateway, killSwitch, capEnforcer, ledger, rng },
        {
          runId,
          generationIndex: i,
          agenomes,
          caps,
          wallClockStartMs,
        },
      );
      lastOutcome = out.outcome;
      lastReason = out.reason;
      if (out.outcome !== "completed") break;
      // No reproduce hook wired in the demo path: re-seed gen N+1 from
      // a fresh gen-0 bundle so the loop has population to work with.
      // Once Phase 4/5 reproduce is wired, swap to out.nextAgenomes.
      agenomes = out.nextAgenomes ?? materializeGen0Bundle({
        runId,
        generationId: `gen_${i + 1}`,
        caps,
      });
    }

    if (lastOutcome === "completed") {
      await markRunStatus(db, runId, "completed");
      await appendEvent(db, {
        runId,
        type: "run.completed",
        actor: "runtime",
        payload: {
          completedAt: new Date().toISOString(),
          terminalSummary: `completed ${caps.maxGenerations} generation(s) via stub gateway`,
        },
      });
    } else if (lastOutcome === "stopped") {
      await markRunStatus(db, runId, "failed");
      await appendEvent(db, {
        runId,
        type: "run.stopped",
        actor: "runtime",
        payload: { reason: lastReason ?? "kill switch" },
      });
    } else {
      await markRunStatus(db, runId, "failed");
      await appendEvent(db, {
        runId,
        type: "run.failed",
        actor: "runtime",
        payload: { reason: lastReason ?? "generation failed" },
      });
    }
  };
}
