import { randomUUID } from "node:crypto";
import { Agenome, type ReproductionEvent } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import type { SeededRng } from "../../runtime/rng.js";
import { crossoverAgenomes } from "./crossover.js";
import { synthesizeFusedPrompt } from "./output-synthesis.js";

/**
 * Two-level fusion orchestrator (P5.9). Calls agenome-level crossover
 * AND optionally output-level synthesis via the fusion_synthesis
 * gateway role. Returns the child agenome plus a ReproductionEvent in
 * the appropriate mode:
 *   - "fusion"            — both crossover and synthesis succeeded
 *   - "crossover"         — synthesis failed (or was skipped); crossover only
 *   - "output_synthesis"  — caller can request this specifically; runs both but
 *                            only labels the result by the synthesis side
 *
 * Persists the agenome.fused event with the full ReproductionEvent and
 * any provider trace metadata from the synthesis call.
 */

export interface FuseAgenomesInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  parentA: Agenome;
  parentB: Agenome;
  rng: SeededRng;
  runId: string;
  generationIndex: number;
  correlationId: string;
  /** When false, skip the output_synthesis gateway call (faster, deterministic). */
  withOutputSynthesis?: boolean;
}

export interface FuseAgenomesOutput {
  child: Agenome;
  event: ReproductionEvent;
}

export async function fuseAgenomes(input: FuseAgenomesInput): Promise<FuseAgenomesOutput> {
  const { parentA, parentB, rng, runId, generationIndex } = input;

  const crossover = crossoverAgenomes({ parentA, parentB, rng });
  let systemPrompt = crossover.systemPrompt;
  let providerTraceId: string | undefined;
  let langfuseObservationId: string | undefined;
  let synthesisSucceeded = false;

  if (input.withOutputSynthesis !== false) {
    const synthesis = await synthesizeFusedPrompt({
      gateway: input.gateway,
      parentA,
      parentB,
      runId,
      correlationId: input.correlationId,
      generationId: `gen_${generationIndex}`,
    });
    if (synthesis) {
      systemPrompt = synthesis.synthesizedPrompt;
      providerTraceId = synthesis.providerTraceId;
      langfuseObservationId = synthesis.langfuseObservationId;
      synthesisSucceeded = true;
    }
  }

  const childId = `ag_${randomUUID()}`;
  const child = Agenome.parse({
    id: childId,
    runId,
    generationId: `gen_${generationIndex}`,
    parentIds: [parentA.id, parentB.id],
    systemPrompt,
    personaWeights: crossover.personaWeights,
    toolPermissions: crossover.toolPermissions,
    decompositionPolicy: crossover.decompositionPolicy,
    spawnBudget: Math.max(parentA.spawnBudget, parentB.spawnBudget),
    mutationMeta: {
      source: "fuse",
      crossoverPoints: crossover.crossoverPoints,
      synthesisUsed: synthesisSucceeded,
    },
    status: "seeded",
  });

  const event: ReproductionEvent = {
    id: `rep_${randomUUID()}`,
    runId,
    parentAgenomeIds: [parentA.id, parentB.id],
    childAgenomeId: childId,
    mode: synthesisSucceeded ? "fusion" : "crossover",
    crossoverPoints: crossover.crossoverPoints,
    mutationSummary: synthesisSucceeded
      ? `crossover+synthesis (${crossover.crossoverPoints.length} points from B)`
      : `crossover only (${crossover.crossoverPoints.length} points from B); synthesis unavailable`,
  };

  await input.appendEvent({
    runId,
    type: "agenome.fused",
    actor: "selection_controller",
    payload: { reproduction: event },
    agenomeId: childId,
    generationId: `gen_${generationIndex}`,
    correlationId: input.correlationId,
    ...(providerTraceId !== undefined ? { langfuseTraceId: providerTraceId } : {}),
    ...(langfuseObservationId !== undefined ? { langfuseObservationId } : {}),
  });

  return { child, event };
}
