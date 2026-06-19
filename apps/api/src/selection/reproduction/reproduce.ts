import { randomUUID } from "node:crypto";
import type { Agenome, ReproductionEvent } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { reproduceMutationOnly } from "./degenerate.js";
import { fuseAgenomes } from "./fuse.js";
import { type MutationBounds, mutateAgenome, reproductionEventFromMutation } from "./mutate.js";
import { streamRng } from "./rng.js";

/**
 * Reproduction orchestrator (P5.10 + P5.11 entry). Decides the
 * reproduction mode per decision D6:
 *   - ≥ 2 parents: floor(2/3 × budget) fusion children +
 *     ceil(1/3 × budget) mutation_only children (from the top parent).
 *   - 1 parent: all `budget` children via mutation_only.
 *   - 0 parents: one `reproduction_aborted_insufficient_parents` event;
 *     empty children.
 *
 * Persists agenome.fused / agenome.mutated AND agenome.reproduced per
 * child. Returns the children for U10 to assemble into the successor
 * population.
 */

export interface ReproduceInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  parents: readonly Agenome[];
  runId: string;
  generationIndex: number;
  runSeed: string;
  bounds: MutationBounds;
  budget: number;
  correlationIdFor: (childIndex: number) => string;
  /** Optional override for fusion vs mutation split when ≥ 2 parents. */
  fusionFraction?: number;
}

export interface ReproduceOutput {
  children: Agenome[];
  events: ReproductionEvent[];
}

const DEFAULT_FUSION_FRACTION = 2 / 3;

function pairForFusion(parents: readonly Agenome[], index: number): [Agenome, Agenome] | null {
  if (parents.length < 2) return null;
  // Round-robin pairing for determinism. The fitness-descending order
  // of `parents` (the caller's promise) means index 0 pairs the top
  // two; index 1 pairs the 2nd and 3rd; etc.
  const a = parents[index % parents.length];
  const b = parents[(index + 1) % parents.length];
  if (!a || !b || a.id === b.id) return null;
  return [a, b];
}

export async function reproduceWithFallback(input: ReproduceInput): Promise<ReproduceOutput> {
  if (input.parents.length < 2) {
    return reproduceMutationOnly({
      appendEvent: input.appendEvent,
      parents: input.parents,
      runId: input.runId,
      generationIndex: input.generationIndex,
      runSeed: input.runSeed,
      bounds: input.bounds,
      budget: input.budget,
      correlationIdFor: input.correlationIdFor,
    });
  }
  if (input.budget <= 0) {
    return { children: [], events: [] };
  }

  const fusionFraction = input.fusionFraction ?? DEFAULT_FUSION_FRACTION;
  const fusionCount = Math.floor(input.budget * fusionFraction);
  const mutationCount = input.budget - fusionCount;

  const children: Agenome[] = [];
  const events: ReproductionEvent[] = [];

  // ---- Fusion children ----
  for (let i = 0; i < fusionCount; i += 1) {
    const pair = pairForFusion(input.parents, i);
    if (!pair) break;
    const [a, b] = pair;
    const rng = streamRng({
      runSeed: input.runSeed,
      generationIndex: input.generationIndex,
      parentAgenomeId: `${a.id}+${b.id}#${i}`,
      purpose: "fusion",
    });
    const result = await fuseAgenomes({
      gateway: input.gateway,
      appendEvent: input.appendEvent,
      parentA: a,
      parentB: b,
      rng,
      runId: input.runId,
      generationIndex: input.generationIndex,
      correlationId: input.correlationIdFor(i),
    });
    children.push(result.child);
    events.push(result.event);
    await input.appendEvent({
      runId: input.runId,
      type: "agenome.reproduced",
      actor: "selection_controller",
      payload: { reproduction: result.event },
      agenomeId: result.child.id,
      generationId: `gen_${input.generationIndex}`,
      correlationId: input.correlationIdFor(i),
    });
  }

  // ---- Mutation_only children (from the top parent) ----
  const topParent = input.parents[0];
  if (topParent) {
    for (let i = 0; i < mutationCount; i += 1) {
      const childIndex = fusionCount + i;
      const rng = streamRng({
        runSeed: input.runSeed,
        generationIndex: input.generationIndex,
        parentAgenomeId: `${topParent.id}#mut#${i}`,
        purpose: "mutation",
      });
      const m = mutateAgenome({
        parent: topParent,
        generationIndex: input.generationIndex,
        rng,
        bounds: input.bounds,
      });
      const event = reproductionEventFromMutation(input.runId, topParent, m.child, m.outcome);
      children.push(m.child);
      events.push(event);

      await input.appendEvent({
        runId: input.runId,
        type: "agenome.mutated",
        actor: "selection_controller",
        payload: { reproduction: event },
        agenomeId: m.child.id,
        generationId: `gen_${input.generationIndex}`,
        correlationId: input.correlationIdFor(childIndex),
      });
      await input.appendEvent({
        runId: input.runId,
        type: "agenome.reproduced",
        actor: "selection_controller",
        payload: { reproduction: event },
        agenomeId: m.child.id,
        generationId: `gen_${input.generationIndex}`,
        correlationId: input.correlationIdFor(childIndex),
      });
    }
  }

  // Use the helper to keep import surface stable in tests; the call is
  // a no-op when input matches the loop's results.
  void randomUUID;
  return { children, events };
}
