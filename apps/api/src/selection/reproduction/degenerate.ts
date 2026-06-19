import type { Agenome, ReproductionEvent } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import { type MutationBounds, mutateAgenome, reproductionEventFromMutation } from "./mutate.js";
import { streamRng } from "./rng.js";

/**
 * Degenerate reproduction paths (P5.10).
 *  - Single parent → produce `budget` mutation_only children. Each
 *    child uses its own per-mutation stream derived from
 *    (runSeed, generationIndex, parentId, childIndex).
 *  - Zero parents → emit one `reproduction_aborted_insufficient_parents`
 *    event; return empty.
 *
 * No fusion / crossover / output_synthesis is attempted when fewer
 * than 2 distinct eligible parents exist.
 */

export interface DegenerateReproductionInput {
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  parents: readonly Agenome[];
  runId: string;
  generationIndex: number;
  runSeed: string;
  bounds: MutationBounds;
  budget: number;
  correlationIdFor: (childIndex: number) => string;
}

export interface DegenerateReproductionOutput {
  children: Agenome[];
  events: ReproductionEvent[];
}

export async function reproduceMutationOnly(
  input: DegenerateReproductionInput,
): Promise<DegenerateReproductionOutput> {
  if (input.parents.length === 0) {
    await input.appendEvent({
      runId: input.runId,
      type: "reproduction_aborted_insufficient_parents",
      actor: "selection_controller",
      payload: { reason: "zero_eligible_parents", generationIndex: input.generationIndex },
      generationId: `gen_${input.generationIndex}`,
      correlationId: input.correlationIdFor(0),
    });
    return { children: [], events: [] };
  }

  const parent = input.parents[0];
  if (!parent) return { children: [], events: [] };

  const children: Agenome[] = [];
  const events: ReproductionEvent[] = [];
  for (let i = 0; i < input.budget; i += 1) {
    const rng = streamRng({
      runSeed: input.runSeed,
      generationIndex: input.generationIndex,
      parentAgenomeId: `${parent.id}#${i}`,
      purpose: "mutation",
    });
    const result = mutateAgenome({
      parent,
      generationIndex: input.generationIndex,
      rng,
      bounds: input.bounds,
    });
    const event = reproductionEventFromMutation(input.runId, parent, result.child, result.outcome);
    children.push(result.child);
    events.push(event);

    await input.appendEvent({
      runId: input.runId,
      type: "agenome.mutated",
      actor: "selection_controller",
      payload: { reproduction: event },
      agenomeId: result.child.id,
      generationId: `gen_${input.generationIndex}`,
      correlationId: input.correlationIdFor(i),
    });
    await input.appendEvent({
      runId: input.runId,
      type: "agenome.reproduced",
      actor: "selection_controller",
      payload: { reproduction: event },
      agenomeId: result.child.id,
      generationId: `gen_${input.generationIndex}`,
      correlationId: input.correlationIdFor(i),
    });
  }
  return { children, events };
}
