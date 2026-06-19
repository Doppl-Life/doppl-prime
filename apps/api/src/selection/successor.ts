import type { Agenome, RunCaps } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../event-store/append.js";
import type { ModelGateway } from "../model-gateway/gateway.js";
import { clampBudget } from "./allocation.js";
import type { MutationBounds } from "./reproduction/mutate.js";
import { reproduceWithFallback } from "./reproduction/reproduce.js";

/**
 * Successor population assembly (P5.11). Takes the surviving / selected
 * parent agenomes from the current generation and produces the gen N+1
 * agenome list. Budget clamped to `caps.maxPopulation` so allocation
 * never raises a cap.
 *
 * Zero parents → empty successor (the run's generation completes with
 * survivors:0; no offspring). The kernel's existing zero-survivors path
 * in `runGeneration` handles the downstream behaviour.
 */

export interface AssembleSuccessorInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  parents: readonly Agenome[];
  caps: RunCaps;
  runId: string;
  runSeed: string;
  generationIndex: number;
  correlationIdFor: (childIndex: number) => string;
}

export async function assembleSuccessorPopulation(
  input: AssembleSuccessorInput,
): Promise<Agenome[]> {
  if (input.parents.length === 0) return [];

  const budget = clampBudget(input.caps.maxPopulation, input.caps.maxPopulation);
  if (budget <= 0) return [];

  const bounds: MutationBounds = { maxPopulation: input.caps.maxPopulation };
  const result = await reproduceWithFallback({
    gateway: input.gateway,
    appendEvent: input.appendEvent,
    parents: input.parents,
    runId: input.runId,
    generationIndex: input.generationIndex + 1,
    runSeed: input.runSeed,
    bounds,
    budget,
    correlationIdFor: input.correlationIdFor,
  });
  return result.children;
}
