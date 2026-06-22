---
artifact_type: solution
case_id: fsd-accident-economy
solution_id: melissa-runtime-branch-import
title: Melissa Runtime Branch Import Provenance
source_type: kernel
comparison_set_id: fsd-accident-economy-v0
comparison_input_hash: sha256:fixture-fsd-accident-economy-v0
comparison_input_paths: 
  - calibration-vault/cases/fsd-accident-economy/case.md
  - calibration-vault/cases/fsd-accident-economy/problem.md
source_status: unavailable
source_branch: melissa
source_commit: 58a852402a72e977230afc51ed446a15bfde2564
adapter_version: runtime-branch-provenance-adapter-v0
adapter_notes: "Melissa has problem-threaded generation and scoring machinery, but no direct case-specific solution export for this case yet."
output_class: candidate
phase: solution_discovery
subtype: runtime_branch
kernel: melissa
branch: melissa
run_id: import-fsd-accident-economy
generation_id: branch-runtime-provenance
agenome_id: melissa-runtime
candidate_id: no-direct-case-export
created_at: 2026-06-22T17:30:54.337Z
---

# Melissa Runtime Branch Import

Melissa has problem-threaded generation and scoring machinery, but no direct case-specific solution export for this case yet.

## Import Status

This artifact should not be rated as a final solution. It records branch capability and the absence of a direct exported solution for this case.

## Capability Evidence

### apps/api/src/runtime/generation-loop.ts

```ts
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
```
### apps/api/src/runtime/demo/demo-run-config.ts

```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RunConfig, SubtypeName } from "@doppl/contracts";
import { RunConfig as RunConfigSchema } from "@doppl/contracts";
import { type DemoCapOverride, applyDemoOverride } from "./demo-cap-override.js";

/**
 * Demo run-config helper (PD.5). Builds a valid RunConfig from either:
 *   - A curated problem-set selection (loaded from fixtures/curated-prompts/<id>.json)
 *   - An operator-entered free-text prompt
 *
 * Both paths flow through the SAME write path as a normal POST /runs:
 * the result is just a RunConfig, validated by the Zod schema. There is
 * no new event type, no new RunConfig shape, no new contract surface.
 *
 * Phase 4's candidate-as-DATA isolation seam means an injected prompt
 * cannot move scoring; that safety pin is structurally enforced
 * upstream, so this helper does NOT need to sanitize prompt content.
 *
 * For operator prompts: `seed` is derived deterministically from the
 * prompt text so identical prompts produce identical runs. Long prompts
 * (>200 chars) are hashed to keep `seed` short; the full prompt still
 * lands in the curated payload structure when applicable.
 */

export class EmptyPromptError extends Error {
  constructor() {
    super(
      "demo-run-config: operatorPrompt is required when source='operator' and must be non-empty",
    );
    this.name = "EmptyPromptError";
  }
}

export class CuratedPromptNotFoundError extends Error {
  public readonly problemId: string;
  constructor(problemId: string) {
    super(`demo-run-config: curated prompt '${problemId}' not found`);
    this.name = "CuratedPromptNotFoundError";
    this.problemId = problemId;
  }
}

export class InvalidCuratedPromptError extends Error {
  public readonly problemId: string;
  constructor(problemId: string, reason: string) {
    super(`demo-run-config: curated prompt '${problemId}' is invalid: ${reason}`);
    this.name = "InvalidCuratedPromptError";
    this.problemId = problemId;
  }
}

export interface CuratedPrompt {
  id: string;
  title: string;
  subtype: SubtypeName;
  prompt: string;
  seed: string;
  rngSeed: string;
  modelProfile: string;
  scoringPolicyVersion: string;
  defaultCaps: RunConfig["caps"];
}

export const DEFAULT_CURATED_PROMPTS_DIR = resolve(process.cwd(), "fixtures/curated-prompts");

const OPERATOR_DEFAULTS = {
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  caps: {
    maxPopulation: 6,
    maxGenerations: 4,
    energyBudget: 8_000,
    maxSpawnDepth: 3,
    maxToolCalls: 40,
    wallClockTimeoutMs: 10 * 60 * 1000,
  },
  enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"] as SubtypeName[],
} as const;
```
### apps/api/src/selection/fitness/policy.ts

```ts
import type { ScoringPolicy } from "@doppl/contracts";

/**
 * Scoring policy v1 (P5.6, D3). Equal weights for the four primary
 * signals + a small energy-efficiency tiebreak. Phase 7 dashboard
 * surfaces `policyVersion`; bumping the values flips the version so
 * scores under different policies stay comparable across generations.
 *
 * Component normalization (D4):
 *  - critic               ∈ [0, 1]
 *  - subtype_check        ∈ [0, 1]
 *  - novelty              ∈ [0, 1]   (mapped from cosine distance [0,2] via /2)
 *  - judge_acceptance     ∈ [0, 1]   (judge total / 25; null when absent)
 *  - energy_efficiency    ∈ (0, 1]   (1 / (1 + spend))
 *
 * Total range: `[0, 4.1]` when all components present; lower when judge
 * is absent (its slot drops to 0 contribution).
 */

export const SCORING_POLICY_V1: ScoringPolicy = {
  version: "v1",
  weights: {
    critic: 1.0,
    subtype_check: 1.0,
    novelty: 1.0,
    judge_acceptance: 1.0,
    energy_efficiency: 0.1,
  },
};

/**
 * Component values keyed by name. Values must be `[0, 1]`. `null` skips
 * the component (treated as 0 in the total; the explanation flags it).
 */
export type FitnessComponents = Record<string, number | null>;

export interface AppliedPolicy {
  total: number;
  /** Per-name contribution (weight × raw value). Excludes nulls. */
  componentTotals: Record<string, number>;
  explanation: string;
}

export function applyPolicy(policy: ScoringPolicy, components: FitnessComponents): AppliedPolicy {
  let total = 0;
  const componentTotals: Record<string, number> = {};
  const lines: string[] = [];

  // Iterate over the policy's known weight keys so a component the
  // policy doesn't know about is silently ignored (the policyVersion is
  // the authority on which components count).
  for (const name of Object.keys(policy.weights).sort()) {
    const weight = policy.weights[name] ?? 0;
    const raw = components[name];
    if (raw === null || raw === undefined) {
      lines.push(`${name}: raw=null weight=${weight.toFixed(2)} contrib=0 (not present)`);
      continue;
    }
    const contrib = raw * weight;
    componentTotals[name] = contrib;
    total += contrib;
    lines.push(
      `${name}: raw=${raw.toFixed(3)} weight=${weight.toFixed(2)} contrib=${contrib.toFixed(3)}`,
    );
  }
  lines.push(`total=${total.toFixed(3)} policyVersion=${policy.version}`);

  return {
    total,
    componentTotals,
    explanation: lines.join("\n"),
  };
}
```
### apps/api/src/verifier/judge/run-judge.ts

```ts
import type { CheckResult } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { type JudgeAxisScores, judgeCall } from "./judge-call.js";

/**
 * Held-out final-judge runner (P4.8). Runs at run-end, NOT per
 * generation (D5 in the Phase 4 plan). Invoked from the terminal-
 * classifier path before the run's terminal flip. Iterates surviving
 * candidates, calls `judgeCall` for each, and returns the list of
 * accepted judgements.
 *
 * If no candidates survived (zero-survivors edge), the judge is not
 * called and no events are emitted — the terminal classifier still
 * runs normally, the run just has no acceptance metric to compare
 * against.
 */

export interface JudgeCandidate {
  candidateId: string;
  candidate: unknown;
}

export interface RunFinalJudgeInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  candidates: readonly JudgeCandidate[];
  runId: string;
  correlationIdFor: (candidateId: string) => string;
}

export interface JudgeAcceptance {
  candidateId: string;
  result: CheckResult;
  axes: JudgeAxisScores;
  total: number;
  policyVersion: string;
}

export async function runFinalJudge(input: RunFinalJudgeInput): Promise<JudgeAcceptance[]> {
  if (input.candidates.length === 0) {
    return [];
  }
  const acceptances: JudgeAcceptance[] = [];
  for (const c of input.candidates) {
    const out = await judgeCall({
      gateway: input.gateway,
      appendEvent: input.appendEvent,
      candidate: c.candidate,
      candidateId: c.candidateId,
      runId: input.runId,
      correlationId: input.correlationIdFor(c.candidateId),
    });
    if (out.ok) {
      acceptances.push({
        candidateId: c.candidateId,
        result: out.result,
        axes: out.axes,
        total: out.total,
        policyVersion: out.policyVersion,
      });
    }
    // Rejected / failed judgements leave no acceptance — their
    // output_schema_rejected or provider_call_failed events were already
    // persisted upstream.
  }
  return acceptances;
}
```
