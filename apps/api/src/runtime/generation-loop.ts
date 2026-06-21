import type { Agenome, ModelGatewayResponse, RunCaps, SubtypeName } from "@doppl/contracts";
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

/**
 * Strict JSON schema sent to the population_generator model so the
 * provider enforces the candidate output contract instead of relying
 * on the model to follow the prompt. Required keys: subtype, title,
 * summary, explanation. Subtype-specific cross_domain_transfer fields
 * are also required by the schema (strict mode requires every property
 * to be listed in `required`) but typed as `["string","null"]` so the
 * model can return null for fields that don't apply — the existing
 * `str()` parser in the candidate.created emission already falls back
 * to defaults when a value isn't a non-empty string.
 *
 * Built per-call so the `subtype` enum reflects the run's
 * `enabledSubtypes`. A run scoped to a single subtype will only ever
 * receive responses with that subtype, instead of relying on the
 * persona prompt to choose correctly.
 */
function buildPopulationGeneratorSchema(enabledSubtypes: SubtypeName[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      subtype: { type: "string", enum: enabledSubtypes },
      title: { type: "string" },
      summary: { type: "string" },
      explanation: { type: "string" },
      // Cross-domain fields — used when subtype === "cross_domain_transfer".
      sourceDomain: { type: ["string", "null"] },
      sourceTechnique: { type: ["string", "null"] },
      targetDomain: { type: ["string", "null"] },
      targetProblem: { type: ["string", "null"] },
      transferMapping: { type: ["string", "null"] },
      expectedMechanism: { type: ["string", "null"] },
      // Zeitgeist fields — used when subtype === "zeitgeist_synthesis".
      // Strict mode requires every property to live in `required`, so the
      // unused side of the discriminator is left null by the model.
      thesis: { type: ["string", "null"] },
      audience: { type: ["string", "null"] },
      currentSignals: { type: ["array", "null"], items: { type: "string" } },
      whyNow: { type: ["string", "null"] },
      falsifiablePredictions: { type: ["array", "null"], items: { type: "string" } },
      comparablePriorArt: { type: ["array", "null"], items: { type: "string" } },
    },
    required: [
      "subtype",
      "title",
      "summary",
      "explanation",
      "sourceDomain",
      "sourceTechnique",
      "targetDomain",
      "targetProblem",
      "transferMapping",
      "expectedMechanism",
      "thesis",
      "audience",
      "currentSignals",
      "whyNow",
      "falsifiablePredictions",
      "comparablePriorArt",
    ],
  } as const;
}

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
  /** Subtype names the model is allowed to emit. Drives both the
   *  schema's enum restriction and the per-call user-message subtype
   *  reminder. */
  enabledSubtypes: SubtypeName[];
  /** Human-readable problem statement (the curated prompt's body or the
   *  operator's typed text). Forwarded into the model's user message so
   *  candidates address the actual problem. Optional for backward
   *  compat with pre-prompt-text fixtures. */
  problemText?: string;
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
      // Build the actual chat messages: the agenome's persona prompt
      // is the system message; the run's problem statement (with a
      // subtype reminder) is the user message. Until this was
      // threaded, the persona prompt was sent as a single user
      // message with no problem context — the model invented its own
      // problem to solve.
      const subtypeList = input.enabledSubtypes.join(", ");
      const fieldGuide: string[] = [];
      if (input.enabledSubtypes.includes("cross_domain_transfer")) {
        fieldGuide.push(
          'If "subtype" is "cross_domain_transfer": fill sourceDomain, sourceTechnique, targetDomain, targetProblem, transferMapping, expectedMechanism. Set thesis, audience, currentSignals, whyNow, falsifiablePredictions, comparablePriorArt to null.',
        );
      }
      if (input.enabledSubtypes.includes("zeitgeist_synthesis")) {
        fieldGuide.push(
          'If "subtype" is "zeitgeist_synthesis": fill thesis, audience, currentSignals (array of short phrases), whyNow, falsifiablePredictions (array), comparablePriorArt (array). Set sourceDomain, sourceTechnique, targetDomain, targetProblem, transferMapping, expectedMechanism to null.',
        );
      }
      const userMessage = [
        input.problemText
          ? `Problem:\n${input.problemText}`
          : "Problem: (none provided; respond with a well-formed candidate idea anyway).",
        `Respond with a single JSON object. The "subtype" field must be exactly one of: ${subtypeList}.`,
        ...fieldGuide,
      ].join("\n\n");
      response = await deps.gateway.invoke({
        role: "population_generator",
        runId: input.runId,
        agenomeId: agenome.id,
        input: {
          messages: [
            { role: "system", content: agenome.systemPrompt },
            { role: "user", content: userMessage },
          ],
        },
        correlationId: `corr_${agenome.id}`,
        schemaForOutput: buildPopulationGeneratorSchema(input.enabledSubtypes),
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
      const strArr = (k: string): string[] =>
        Array.isArray(parsed[k])
          ? (parsed[k] as unknown[]).filter((v): v is string => typeof v === "string")
          : [];
      const explanationValue = str("explanation", "");
      const chosenSubtype = str("subtype", input.enabledSubtypes[0] as string);
      // Per ARCHITECTURE.md §3, the subtypePayload shape is a discriminated
      // union keyed on `subtype`. Emit only the side that matches the
      // chosen subtype — the other side's fields stayed in the schema as
      // `["string","null"]` but must NOT leak into the persisted payload.
      const subtypePayload: Record<string, unknown> =
        chosenSubtype === "zeitgeist_synthesis"
          ? {
              thesis: str("thesis", "Implied convergence across discourse streams"),
              audience: str("audience", "Researchers tracking the field"),
              currentSignals: strArr("currentSignals"),
              whyNow: str("whyNow", "Recent shifts make the question newly tractable"),
              falsifiablePredictions: strArr("falsifiablePredictions"),
              comparablePriorArt: strArr("comparablePriorArt"),
            }
          : {
              sourceDomain: str("sourceDomain", "biology"),
              sourceTechnique: str("sourceTechnique", "selection"),
              targetDomain: str("targetDomain", "ML"),
              targetProblem: str("targetProblem", "collapse"),
              transferMapping: str("transferMapping", "fitness → loss"),
              expectedMechanism: str("expectedMechanism", "diversity sampler"),
            };
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
            subtype: chosenSubtype,
            title: str("title", "Generated candidate"),
            summary: str("summary", "From generation loop"),
            ...(explanationValue ? { explanation: explanationValue } : {}),
            claims: [],
            evidenceRefs: [],
            status: "created",
            subtypePayload,
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
