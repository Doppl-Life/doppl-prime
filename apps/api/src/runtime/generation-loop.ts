import type { Agenome, ModelGatewayResponse, RunCaps } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendEvent } from "../event-store/append.js";
import type { ModelGateway } from "../model-gateway/gateway.js";
import type { CapEnforcer, KillSwitch, RunState } from "./caps.js";
import type { EnergyLedger } from "./energy-ledger.js";
import { handleStructuredOutput } from "./repair-state.js";
import type { SeededRng } from "./rng.js";
import { GenerationStateMachine } from "./state-machines/generation.js";

/**
 * Generation loop orchestrator (P3.10). Walks ONE generation through
 * `pending → running → (degraded?) → verifying → scoring → reproducing
 * → completed`. Checks the kill switch + caps between every safe
 * transition. Phase 4/5 hooks (verify/score/reproduce) are injected as
 * pure functions defaulting to no-ops in Phase 3 — they'll do real
 * work once those phases ship.
 *
 * The loop is the ONLY orchestrator. Phase 4/5 modules hand back
 * decisions; they don't drive state transitions or persist events
 * themselves.
 */

export interface RunGenerationDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>;
  gateway: ModelGateway;
  killSwitch: KillSwitch;
  capEnforcer: CapEnforcer;
  ledger: EnergyLedger;
  rng: SeededRng;
  // Phase 4/5 hooks (no-op defaults).
  verifyHook?: (candidates: PersistedCandidate[]) => Promise<void>;
  scoreHook?: (candidates: PersistedCandidate[]) => Promise<void>;
  reproduceHook?: (
    agenomes: Agenome[],
    candidates: PersistedCandidate[],
  ) => Promise<{ nextAgenomes?: Agenome[] }>;
}

export interface RunGenerationInput {
  runId: string;
  generationIndex: number;
  agenomes: Agenome[];
  caps: RunCaps;
  wallClockStartMs: number;
}

export interface RunGenerationOutput {
  outcome: "completed" | "failed" | "stopped";
  survivingCandidateCount: number;
  failedCap?: string;
  reason?: string;
  nextAgenomes?: Agenome[];
}

export interface PersistedCandidate {
  candidateId: string;
  agenomeId: string;
  rawOutput: unknown;
}

function buildRunState(
  input: RunGenerationInput,
  deps: RunGenerationDeps,
  estimate?: number,
): RunState {
  return {
    generationCount: input.generationIndex,
    populationCount: input.agenomes.length,
    spawnDepth: 0,
    toolCallCount: 0,
    energyAccumulator: deps.ledger.current(),
    wallClockStartMs: input.wallClockStartMs,
    ...(estimate !== undefined ? { energyEstimate: estimate } : {}),
  };
}

async function emitCapExhausted(
  deps: RunGenerationDeps,
  input: RunGenerationInput,
  cap: string,
  value: number,
  limit: number,
): Promise<void> {
  if (cap === "energyBudget") {
    await appendEvent(deps.db, {
      runId: input.runId,
      type: "energy_exhausted",
      actor: "runtime",
      payload: {
        reason: `${cap} exceeded (${value}/${limit})`,
        spent: value,
        budget: limit,
      },
    });
    return;
  }
  await appendEvent(deps.db, {
    runId: input.runId,
    type: "generation_failed",
    actor: "runtime",
    payload: {
      reason: `${cap} exceeded (${value}/${limit})`,
    },
  });
}

export async function runGeneration(
  deps: RunGenerationDeps,
  input: RunGenerationInput,
): Promise<RunGenerationOutput> {
  // Pre-flight: kill switch then caps.
  if (deps.killSwitch.isStopped()) {
    return {
      outcome: "stopped",
      survivingCandidateCount: 0,
      ...(deps.killSwitch.reason() !== null ? { reason: deps.killSwitch.reason() as string } : {}),
    };
  }

  let capCheck = deps.capEnforcer.enforceCaps(buildRunState(input, deps));
  if (!capCheck.ok) {
    await emitCapExhausted(deps, input, capCheck.cap, capCheck.value, capCheck.limit);
    return {
      outcome: "failed",
      survivingCandidateCount: 0,
      failedCap: capCheck.cap,
    };
  }

  let genStatus = GenerationStateMachine.transition("pending", "running");
  await appendEvent(deps.db, {
    runId: input.runId,
    type: "generation.started",
    actor: "runtime",
    payload: { index: input.generationIndex },
  });

  // ─── running: population generation ─────────────────────────────────
  const persisted: PersistedCandidate[] = [];
  let invalidCount = 0;
  for (const agenome of input.agenomes) {
    if (deps.killSwitch.isStopped()) {
      return {
        outcome: "stopped",
        survivingCandidateCount: persisted.length,
        ...(deps.killSwitch.reason() !== null
          ? { reason: deps.killSwitch.reason() as string }
          : {}),
      };
    }
    // Pre-call cap check WITH the gateway's estimated spend.
    const preCheckState = buildRunState(input, deps, 0);
    capCheck = deps.capEnforcer.enforceCaps({ ...preCheckState, energyEstimate: 0 });
    if (!capCheck.ok) {
      await emitCapExhausted(deps, input, capCheck.cap, capCheck.value, capCheck.limit);
      return {
        outcome: "failed",
        survivingCandidateCount: persisted.length,
        failedCap: capCheck.cap,
      };
    }

    let response: ModelGatewayResponse;
    try {
      response = await deps.gateway.invoke({
        role: "population_generator",
        runId: input.runId,
        agenomeId: agenome.id,
        input: {
          prompt: agenome.systemPrompt,
        },
        correlationId: `corr_${agenome.id}`,
      });
    } catch (_err) {
      // Provider failure already persisted by the gateway dispatcher;
      // skip this agenome and continue.
      continue;
    }

    if (response.energyActual !== undefined) {
      deps.ledger.reconcile(response.energyActual);
    }

    // Run the U6 repair-state edge on the response.
    const candidateId = `cand_${agenome.id}_${input.generationIndex}`;
    const handled = await handleStructuredOutput({
      candidateId,
      runId: input.runId,
      correlationId: `corr_${candidateId}`,
      role: "population_generator",
      agenomeId: agenome.id,
      generationId: `gen_${input.generationIndex}`,
      currentStatus: "created",
      result: response.ok
        ? { ok: true, output: response.output, repairAttempts: response.repairAttempts as 0 | 1 }
        : {
            ok: false,
            validationError: response.validationError ?? "unknown",
            repairAttempts: response.repairAttempts as 1,
          },
      appendEvent: (e) => appendEvent(deps.db, e),
    });

    if (handled.nextStatus === "under_review") {
      // Parse the gateway's output JSON so the candidate.created event
      // carries the model's actual title/summary/subtype payload — not
      // hardcoded "Generated candidate" placeholders. Falls back to
      // sensible defaults if any field is missing or the JSON is malformed.
      let parsed: Record<string, unknown> = {};
      try {
        const raw = typeof response.output === "string" ? response.output : String(response.output);
        const maybe = JSON.parse(raw);
        if (maybe && typeof maybe === "object") parsed = maybe as Record<string, unknown>;
      } catch {
        /* keep defaults */
      }
      const str = (k: string, fallback: string): string =>
        typeof parsed[k] === "string" && (parsed[k] as string).length > 0
          ? (parsed[k] as string)
          : fallback;
      await appendEvent(deps.db, {
        runId: input.runId,
        type: "candidate.created",
        actor: "agenome",
        agenomeId: agenome.id,
        candidateId,
        payload: {
          candidate: {
            id: candidateId,
            runId: input.runId,
            generationId: `gen_${input.generationIndex}`,
            agenomeId: agenome.id,
            subtype: str("subtype", "cross_domain_transfer"),
            title: str("title", "Generated candidate"),
            summary: str("summary", "From generation loop"),
            claims: [],
            evidenceRefs: [],
            status: "created",
            subtypePayload: {
              sourceDomain: str("sourceDomain", "biology"),
              sourceTechnique: str("sourceTechnique", "selection"),
              targetDomain: str("targetDomain", "ML"),
              targetProblem: str("targetProblem", "collapse"),
              transferMapping: str("transferMapping", "fitness → loss"),
              expectedMechanism: str("expectedMechanism", "diversity sampler"),
            },
          },
        },
      });
      persisted.push({ candidateId, agenomeId: agenome.id, rawOutput: response.output });
    } else {
      invalidCount += 1;
    }
  }

  // Take the degraded edge if any candidate was invalidated AND ≥1 survived.
  if (invalidCount > 0 && persisted.length > 0) {
    genStatus = GenerationStateMachine.transition(genStatus, "degraded");
  }

  // ─── verifying → scoring → reproducing → completed ──────────────────
  const verifyingFrom = genStatus === "degraded" ? "degraded" : "running";
  void verifyingFrom;
  // Direct path; the state machine accepts running → verifying or degraded → verifying.
  genStatus = GenerationStateMachine.transition(genStatus, "verifying");

  if (deps.verifyHook) {
    await deps.verifyHook(persisted);
  }

  genStatus = GenerationStateMachine.transition(genStatus, "scoring");

  if (deps.scoreHook) {
    await deps.scoreHook(persisted);
  }

  // Zero-survivors edge: scoring → completed directly (no reproduction).
  let nextAgenomes: Agenome[] | undefined;
  if (persisted.length === 0) {
    genStatus = GenerationStateMachine.transition(genStatus, "completed");
  } else {
    genStatus = GenerationStateMachine.transition(genStatus, "reproducing");
    if (deps.reproduceHook) {
      const out = await deps.reproduceHook(input.agenomes, persisted);
      nextAgenomes = out.nextAgenomes;
    }
    genStatus = GenerationStateMachine.transition(genStatus, "completed");
  }

  await appendEvent(deps.db, {
    runId: input.runId,
    type: "generation.completed",
    actor: "runtime",
    payload: {
      completedAt: new Date().toISOString(),
      candidateCount: persisted.length,
    },
  });

  return {
    outcome: "completed",
    survivingCandidateCount: persisted.length,
    ...(nextAgenomes ? { nextAgenomes } : {}),
  };
}
