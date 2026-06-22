import type {
  Agenome,
  CriticMandate,
  FitnessScoredPayload,
  RunConfig,
} from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ALL_ADAPTERS, buildCheckRegistry } from "../src/check-runners/index.js";
import { appendEvent } from "../src/event-store/append.js";
import { replayReader } from "../src/event-store/replay-reader.js";
import type { ModelGateway } from "../src/model-gateway/gateway.js";
import { createCapEnforcer, createKillSwitch } from "../src/runtime/caps.js";
import { createEnergyLedger } from "../src/runtime/energy-ledger.js";
import { runGeneration } from "../src/runtime/generation-loop.js";
import { createSeededRng } from "../src/runtime/rng.js";
import { materializeGen0Bundle } from "../src/runtime/seeds/gen-0-agenomes.js";
import { makeReproduceHook } from "../src/selection/run-reproduction.js";
import { makeScoreHook } from "../src/selection/run-scoring.js";
import { makeVerifyHook } from "../src/verifier/run-verification.js";

/**
 * Live processRun for the boot-demo. Drives a run from
 * `run.started → generation.* (×N) → run.completed` using the real
 * verify / score / reproduce hook factories — no stubs. The caller MUST
 * pass a real `gateway`; without one, the script throws at construction
 * rather than silently filling the event log with fake reviews and
 * synthetic fitness numbers.
 */

interface RunRow {
  id: string;
  config: RunConfig;
}

/**
 * Critic council member identifiers. These are NOT real agenomes —
 * they're string IDs used by the council rotation to deterministically
 * pick which "voice" speaks for each mandate per generation. Three is
 * enough for round-robin diversity without inflating the LLM call
 * budget per generation.
 */
const CRITIC_AGENOME_IDS = ["crit_skeptic", "crit_grounded", "crit_practical"] as const;

/**
 * Council rubric — one short instruction per mandate. These are read
 * verbatim into the critic prompt by `runCouncil`. Kept terse so the
 * model has room for the candidate text and the JSON-schema response;
 * tune as needed once you see what the live critique looks like.
 */
const RUBRIC_BY_MANDATE: Record<CriticMandate, string> = {
  factual_grounding:
    "Score factual_grounding 0-1. Reward claims tied to verifiable prior art, named techniques, or measurable evidence. Penalize vague gestures and unsupported assertions.",
  novelty_prior_art:
    "Score novelty_prior_art 0-1. Reward genuinely new combinations and underexplored mappings. Penalize ideas that restate well-known techniques without adding anything.",
  feasibility:
    "Score feasibility 0-1. Reward ideas that could plausibly be tried with realistic resources in months, not decades. Penalize ideas that require speculative infrastructure or perfect data.",
  falsification:
    "Score falsification 0-1. Reward ideas whose authors named concrete predictions that could prove the idea wrong. Penalize unfalsifiable framings and motte-and-bailey claims.",
  subtype_specific:
    "Score subtype_specific 0-1. For cross_domain_transfer, weigh the strength of the source→target mapping. For zeitgeist_synthesis, weigh how distinct the three streams are and whether the implication is actually implied by all three.",
};

/** How often the council rotates assignments. 1 = re-pick every generation. */
const EVERY_N_GENERATIONS = 1;

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

/**
 * Replay the run's fitness.scored events at the end of a completed run
 * and pick the candidate with the highest total. Used to populate the
 * run.completed terminalSummary so the FinalIdeaPanel has a champion
 * to show. Reads from the event log (not from any in-memory tracker)
 * so the result is stable across restarts and matches what replay
 * would compute.
 */
async function findRunChampion(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
): Promise<{ candidateId: string; total: number } | null> {
  let best: { candidateId: string; total: number } | null = null;
  for await (const env of replayReader(db).events(runId)) {
    if (env.type !== "fitness.scored") continue;
    const fitness = (env.payload as FitnessScoredPayload).fitness;
    if (!fitness) continue;
    if (best === null || fitness.total > best.total) {
      best = { candidateId: fitness.candidateId, total: fitness.total };
    }
  }
  return best;
}

export interface CreateLiveProcessRunOptions {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  /** Required. The live process refuses to start without a real gateway
   *  — running with a stub would silently fill the event log with fake
   *  critic reviews and synthetic fitness scores. */
  gateway: ModelGateway;
}

export function createLiveProcessRun(
  options: CreateLiveProcessRunOptions,
): (runId: string) => Promise<void> {
  const { db, gateway } = options;
  if (!gateway) {
    throw new Error(
      "createLiveProcessRun requires a real `gateway`. Set OPENROUTER_API_KEY + OPENAI_API_KEY at boot so buildRealGateway returns a non-null gateway.",
    );
  }
  const checkRegistry = buildCheckRegistry([...ALL_ADAPTERS]);

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

    // The verify/score/reproduce hooks need the current generation
    // index. We rebuild the hook bundle each iteration with a tiny
    // closure over `i` so each generation passes the right value into
    // the council rotation, the scoring policy's generationId field,
    // and the reproduce hook's gen-N+1 child stamping.
    let lastOutcome: "completed" | "failed" | "stopped" = "completed";
    let lastReason: string | undefined;

    for (let i = 0; i < caps.maxGenerations; i++) {
      const getCurrentGenerationIndex = (): number => i;
      const verifyHook = makeVerifyHook({
        db,
        gateway,
        registry: checkRegistry,
        runId,
        runSeed: config.seed,
        enabledSubtypes: config.enabledSubtypes,
        criticAgenomeIds: CRITIC_AGENOME_IDS,
        everyNGenerations: EVERY_N_GENERATIONS,
        rubricByMandate: RUBRIC_BY_MANDATE,
        getCurrentGenerationIndex,
      });
      const scoreHook = makeScoreHook({
        db,
        gateway,
        runId,
        getCurrentGenerationIndex,
      });
      const reproduceHook = makeReproduceHook({
        db,
        gateway,
        runId,
        runSeed: config.seed,
        runCaps: caps,
        getCurrentGenerationIndex,
      });

      const out = await runGeneration(
        {
          db,
          gateway,
          killSwitch,
          capEnforcer,
          ledger,
          rng,
          verifyHook,
          scoreHook,
          reproduceHook,
        },
        {
          runId,
          generationIndex: i,
          agenomes,
          caps,
          wallClockStartMs,
          enabledSubtypes: config.enabledSubtypes,
          ...(config.problemText !== undefined ? { problemText: config.problemText } : {}),
        },
      );
      lastOutcome = out.outcome;
      lastReason = out.reason;
      if (out.outcome !== "completed") break;
      // Use the next-gen agenomes the reproduce hook returned. If the
      // reproduce hook returned no successors (everyone culled), fall
      // back to a fresh seed bundle so the loop has population to work
      // with instead of terminating mid-run.
      const next = out.nextAgenomes ?? [];
      agenomes =
        next.length > 0
          ? next
          : materializeGen0Bundle({ runId, generationId: `gen_${i + 1}`, caps });
    }

    if (lastOutcome === "completed") {
      const champ = await findRunChampion(db, runId);
      await markRunStatus(db, runId, "completed");
      await appendEvent(db, {
        runId,
        type: "run.completed",
        actor: "runtime",
        payload: {
          completedAt: new Date().toISOString(),
          terminalSummary: champ
            ? `champion ${champ.candidateId} · fitness ${champ.total.toFixed(3)} after ${caps.maxGenerations} generation(s)`
            : `completed ${caps.maxGenerations} generation(s) — no champion (no fitness events landed)`,
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
