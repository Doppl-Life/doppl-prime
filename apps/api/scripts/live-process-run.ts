import { randomUUID } from "node:crypto";
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

// A small library of synthetic cross-domain analogies so each stub
// candidate has a distinct, readable title rather than all 20 candidates
// in a run looking identical. Per-call index picks one — deterministic
// given the same run / agenome / generation, so replay is byte-stable.
const STUB_ANALOGIES: ReadonlyArray<{
  sourceDomain: string;
  sourceTechnique: string;
  targetDomain: string;
  targetProblem: string;
  transferMapping: string;
  expectedMechanism: string;
  explanation: string;
}> = [
  {
    sourceDomain: "hydraulic engineering",
    sourceTechnique: "surge tanks",
    targetDomain: "urban traffic",
    targetProblem: "congestion shockwaves",
    transferMapping: "pressure-equalization → buffered intersections",
    expectedMechanism: "absorb spikes before they propagate upstream",
    explanation:
      "Imagine a water pipe: when flow suddenly stops, pressure shockwaves can rattle the whole system. Plumbing engineers fix this by adding small tanks that absorb the spike before it travels upstream. This idea borrows the trick for city streets — when a burst of cars hits an intersection, a 'buffer' area soaks up the shock so the jam doesn't cascade for miles. The same math that keeps water pipes from hammering could keep rush hour from collapsing.",
  },
  {
    sourceDomain: "biology",
    sourceTechnique: "selection pressure",
    targetDomain: "ML training",
    targetProblem: "mode collapse",
    transferMapping: "fitness → diversity-weighted loss",
    expectedMechanism: "preserve minority modes via novelty penalty",
    explanation:
      "An AI model that's trained too long sometimes gets stuck giving the same kinds of answers — like a chef who only ever makes pasta. Nature solved a similar problem millions of years ago: evolution doesn't just reward what works, it rewards what's rare and useful, so species stay diverse. This idea adds a 'diversity bonus' to AI training so the model is nudged to invent new answers instead of always falling back on the familiar ones. The hope is models trained this way stay creative even after very long training runs.",
  },
  {
    sourceDomain: "ant colony foraging",
    sourceTechnique: "pheromone evaporation",
    targetDomain: "city logistics",
    targetProblem: "stale delivery routes",
    transferMapping: "evaporation rate → route-cost decay",
    expectedMechanism: "stale routes lose weight, fresher ones win",
    explanation:
      "Ants don't have GPS. They leave scent trails to food, and those trails fade over time so old paths get forgotten. Delivery fleets have the same problem: a route that was great last month might be terrible today because of construction or a new traffic pattern. This idea borrows the ant trick — give every route a 'freshness' score that quietly decays each day, so the system naturally forgets stale routes and gravitates to ones that actually work now. No central planner has to micromanage; the system just gets out of its own way.",
  },
  {
    sourceDomain: "immunology",
    sourceTechnique: "clonal selection",
    targetDomain: "fraud detection",
    targetProblem: "novel-attack adaptation",
    transferMapping: "antibody diversity → ensemble specialists",
    expectedMechanism: "amplify detectors that catch fresh patterns",
    explanation:
      "Your immune system can't predict what new virus will show up, so it keeps a huge library of slightly-different antibodies, and when one happens to match an invader your body rapidly clones it. Fraud detection has the same predicament: attackers invent fresh tricks every week. This idea copies the immune-system strategy — keep many small specialist detectors instead of one big general one, and when one catches a fresh attack pattern, rapidly clone it to handle the surge. The rest stand by in case their own niche gets hit.",
  },
  {
    sourceDomain: "fluid dynamics",
    sourceTechnique: "laminar-to-turbulent transition",
    targetDomain: "team scaling",
    targetProblem: "communication-overhead onset",
    transferMapping: "Reynolds threshold → headcount threshold",
    expectedMechanism: "predict the size at which structure must change",
    explanation:
      "Water through a pipe is smooth at low speed and suddenly chaotic past a precise threshold — engineers have predicted that switch for a century with one number, the Reynolds number. This idea asks whether teams hit the same kind of threshold: at some headcount, coordination tips from a few quick chats into wall-to-wall meetings. If we can predict that threshold the way fluid dynamicists do, leaders can restructure proactively instead of waiting for the team to break.",
  },
];

function makeValidCandidatePayload(agenomeId: string, idx: number): unknown {
  const analogy = STUB_ANALOGIES[idx % STUB_ANALOGIES.length] ?? STUB_ANALOGIES[0];
  if (!analogy) throw new Error("STUB_ANALOGIES is empty"); // unreachable
  // Build a title from the analogy so each candidate reads like an idea,
  // not a placeholder string. e.g. "Apply surge tanks to congestion shockwaves".
  const title = `Apply ${analogy.sourceTechnique} to ${analogy.targetProblem}`;
  const summary = `Cross-domain transfer from ${analogy.sourceDomain} (${analogy.sourceTechnique}) to ${analogy.targetDomain}: ${analogy.transferMapping}.`;
  const { explanation, ...subtypePayload } = analogy;
  return {
    subtype: "cross_domain_transfer",
    title,
    summary,
    explanation,
    ...subtypePayload,
  };
}

/** Per-process stub gateway. Mirrors the real createGateway dispatcher's
 *  success-path invariant (gateway.ts:138-163): every successful invoke
 *  appends an `energy.spent` event so the EnergyLedger, energy panel, and
 *  capsConsumed.energy stay in sync. Without this, the run would show
 *  `energy: 0 / N` even after thousands of LLM-equivalent calls. */
function createStubGateway(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
): ModelGateway {
  let callIndex = 0;
  return {
    async invoke(request: ModelGatewayRequest): Promise<ModelGatewayResponse> {
      const idx = callIndex;
      callIndex += 1;
      const energy = 5;

      await appendEvent(db, {
        runId: request.runId,
        type: "energy.spent",
        actor: "runtime",
        ...(request.generationId !== undefined ? { generationId: request.generationId } : {}),
        ...(request.agenomeId !== undefined ? { agenomeId: request.agenomeId } : {}),
        payload: {
          energy: {
            id: randomUUID(),
            runId: request.runId,
            ...(request.generationId !== undefined ? { generationId: request.generationId } : {}),
            ...(request.agenomeId !== undefined ? { agenomeId: request.agenomeId } : {}),
            eventType: "llm",
            estimate: energy,
            actual: energy,
            unit: "doppl_energy",
            reason: `stub.${request.role}`,
            providerMeta: { provider: "stub", modelId: "stub-candidate-generator", isFallback: false },
          },
        },
      });

      return {
        ok: true,
        output: JSON.stringify(makeValidCandidatePayload(request.agenomeId ?? "ag", idx)),
        repairAttempts: 0,
        energyEstimate: energy,
        energyActual: energy,
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
  const gateway = options.gateway ?? createStubGateway(db);

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

    // Synthetic per-candidate score: deterministic but varied so fitness-over-time
    // and lineage selection have non-trivial signal to render. Uses a tiny hash of
    // the candidate id so re-runs with the same rngSeed produce the same curve.
    const syntheticScore = (candidateId: string): number => {
      let h = 0;
      for (let i = 0; i < candidateId.length; i++) h = (h * 31 + candidateId.charCodeAt(i)) | 0;
      // Map to [0.30, 0.95] — visually distinguishable in the chart axis.
      const x = (Math.abs(h) % 1000) / 1000;
      return Number((0.3 + x * 0.65).toFixed(3));
    };

    let lastOutcome: "completed" | "failed" | "stopped" = "completed";
    let lastReason: string | undefined;
    // Champion tracking for the run.completed terminalSummary so the
    // FinalIdeaPanel can show a meaningful "surviving idea" line.
    let bestCandidateId: string | null = null;
    let bestTotal = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < caps.maxGenerations; i++) {
      const out = await runGeneration(
        {
          db,
          gateway,
          killSwitch,
          capEnforcer,
          ledger,
          rng,
          // Stub verify: each candidate gets one critic review per mandate
          // and one check.completed envelope. Real critics would call the
          // gateway here — for the demo this fills out the lifecycle.
          verifyHook: async (candidates) => {
            for (const c of candidates) {
              const mandates = ["falsification", "feasibility"] as const;
              for (const mandate of mandates) {
                await appendEvent(db, {
                  runId,
                  type: "critic.reviewed",
                  actor: "critic",
                  generationId: `gen_${i}`,
                  agenomeId: c.agenomeId,
                  candidateId: c.candidateId,
                  payload: {
                    review: {
                      id: `crit_${c.candidateId}_${mandate}`,
                      candidateId: c.candidateId,
                      mandate,
                      scores: { [mandate]: syntheticScore(`${c.candidateId}:${mandate}`) },
                      critique: `Stub critic (${mandate}) — synthetic review for demo`,
                      confidence: 0.75,
                      evidenceRefs: [],
                    },
                  },
                });
              }
              await appendEvent(db, {
                runId,
                type: "check.completed",
                actor: "runtime",
                generationId: `gen_${i}`,
                agenomeId: c.agenomeId,
                candidateId: c.candidateId,
                payload: {
                  result: {
                    id: `chk_${c.candidateId}`,
                    candidateId: c.candidateId,
                    checkType: "stub_verification",
                    status: "passed",
                    score: syntheticScore(`check:${c.candidateId}`),
                    evidenceRefs: [],
                  },
                },
              });
            }
          },
          // Stub score: emit a fitness.scored envelope per candidate using
          // the deterministic synthetic score. Tracks the run's champion.
          scoreHook: async (candidates) => {
            for (const c of candidates) {
              const total = syntheticScore(c.candidateId);
              await appendEvent(db, {
                runId,
                type: "fitness.scored",
                actor: "runtime",
                generationId: `gen_${i}`,
                agenomeId: c.agenomeId,
                candidateId: c.candidateId,
                payload: {
                  fitness: {
                    id: `fit_${c.candidateId}`,
                    candidateId: c.candidateId,
                    total,
                    components: {
                      critic: syntheticScore(`crit:${c.candidateId}`),
                      check: syntheticScore(`check:${c.candidateId}`),
                      novelty: syntheticScore(`nov:${c.candidateId}`),
                    },
                    policyVersion: config.scoringPolicyVersion,
                    explanation: "Synthetic fitness from boot-demo stub.",
                  },
                },
              });
              if (total > bestTotal) {
                bestTotal = total;
                bestCandidateId = c.candidateId;
              }
            }
          },
          // Stub reproduce: pick the top-N fitness candidates as parents
          // and seed gen N+1 with their agenomes (cloned into fresh ids
          // so lineage edges have something to walk). Without this the
          // population would die off and no champion would ever land.
          reproduceHook: async (parentAgenomes, candidates) => {
            const ranked = [...candidates].sort(
              (a, b) => syntheticScore(b.candidateId) - syntheticScore(a.candidateId),
            );
            const survivors = ranked.slice(0, Math.min(caps.maxPopulation, ranked.length));
            const parentById = new Map(parentAgenomes.map((p) => [p.id, p] as const));
            const nextAgenomes: Agenome[] = [];
            for (const c of survivors) {
              const parent = parentById.get(c.agenomeId);
              if (!parent) continue;
              const childId = randomUUID();
              await appendEvent(db, {
                runId,
                type: "agenome.reproduced",
                actor: "runtime",
                generationId: `gen_${i + 1}`,
                agenomeId: childId,
                payload: {
                  reproduction: {
                    id: `repro_${childId}`,
                    runId,
                    parentAgenomeIds: [parent.id],
                    childAgenomeId: childId,
                    // Single-parent reproduction in the stub — schema's named
                    // `mutation_only` for the degenerate <2-parent fallback.
                    mode: "mutation_only",
                    crossoverPoints: [],
                    mutationSummary: `Stub mutation of ${parent.id.slice(0, 8)} (no real reproducer wired yet).`,
                  },
                },
              });
              nextAgenomes.push({
                ...parent,
                id: childId,
                runId,
                generationId: `gen_${i + 1}`,
                parentIds: [parent.id],
              });
            }
            return { nextAgenomes };
          },
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
      // Use the next-gen agenomes the reproduce hook returned. If for any
      // reason it returned an empty list, fall back to a fresh seed bundle
      // so the loop has population to work with rather than terminating.
      const next = out.nextAgenomes ?? [];
      agenomes = next.length > 0
        ? next
        : materializeGen0Bundle({ runId, generationId: `gen_${i + 1}`, caps });
    }

    if (lastOutcome === "completed") {
      await markRunStatus(db, runId, "completed");
      await appendEvent(db, {
        runId,
        type: "run.completed",
        actor: "runtime",
        payload: {
          completedAt: new Date().toISOString(),
          terminalSummary:
            bestCandidateId !== null
              ? `champion ${bestCandidateId} · fitness ${bestTotal.toFixed(3)} after ${caps.maxGenerations} generation(s)`
              : `completed ${caps.maxGenerations} generation(s) — no champion (stub fitness produced no positive total)`,
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
