import { Agenome } from '@doppl/contracts';
import type { ReproductionEvent } from '@doppl/contracts';
import type { ModelGateway } from '../../model-gateway';
import type { MutationBounds } from './mutate';
import { applyMutation } from './mutate';
import { applyFusion, fuse } from './fuse';
import type { FusionParent } from './parent-distance';
import { abortInsufficientParents, reproduceMutationOnly } from './degenerate';
import type { ReproductionContext, SelectionEmitter } from './degenerate';
import type { AxisWeakness } from './directed';

/**
 * reproduce / applyReproduction (P5.10, ARCHITECTURE.md §8/§3) — the reproduction dispatcher + the
 * mode-keyed replay dispatcher.
 *
 * `reproduce` routes by the count of DISTINCT eligible parents (two references to the same id = 1
 * distinct, never self-fusion): ≥2 → two-level fusion (delegates to P5.9 `fuse`, unchanged); exactly 1
 * → `mutation_only` from the single survivor (P5.8 `mutate` via `reproduceMutationOnly`); 0 → no
 * offspring (`reproduction_aborted_insufficient_parents` + `zeroSurvivors:true` — the kernel emits
 * `generation.completed{survivors:0}`).
 *
 * `applyReproduction` is the replay path: it switches on the persisted `ReproductionEvent.mode` to the
 * matching reconstructor (`fusion`/`crossover`/`output_synthesis` → `applyFusion`, `mutation_only` →
 * `applyMutation`), keeping the whole reproduction family replay-faithful behind one entry — NO gateway
 * (structural), NO rng re-sample (KEY SAFETY RULE #7). Pure over inputs; the abort path has no child.
 */
export interface ReproduceInput {
  runId: string;
  /** The current (parents') generation; children land here — the kernel/P5.11 assigns gen N+1. */
  generationId?: string;
  eligibleParents: readonly FusionParent[];
  seed: number;
  /** Wave 1, Step 3 — the anchor lineage's weakest judged axis, steering directed fusion (live-only — see
   *  `FuseInput.directedRepair`). Only consumed on the ≥2-parent fusion path. */
  directedRepair?: AxisWeakness;
}

export interface ReproduceDeps {
  gateway: ModelGateway;
  emit: SelectionEmitter;
  newId: () => string;
  bounds: MutationBounds;
}

export type ReproduceResult =
  | { zeroSurvivors: false; child: Agenome; reproductionEvent: ReproductionEvent }
  | { zeroSurvivors: true };

/** Distinct-by-agenome-id, first occurrence preserved — two references to one id count as one parent. */
function distinctParents(parents: readonly FusionParent[]): FusionParent[] {
  const seen = new Set<string>();
  const out: FusionParent[] = [];
  for (const parent of parents) {
    if (!seen.has(parent.agenome.id)) {
      seen.add(parent.agenome.id);
      out.push(parent);
    }
  }
  return out;
}

export async function reproduce(
  input: ReproduceInput,
  deps: ReproduceDeps,
): Promise<ReproduceResult> {
  const distinct = distinctParents(input.eligibleParents);
  // Omit generationId when absent (exactOptionalPropertyTypes forbids assigning `: undefined`).
  const genPart = input.generationId === undefined ? {} : { generationId: input.generationId };
  const context: ReproductionContext = { runId: input.runId, seed: input.seed, ...genPart };

  if (distinct.length >= 2) {
    // ≥2 distinct → two-level fusion (P5.9 fuse handles fusion.started/agenome.fused + its own replay).
    const directedPart =
      input.directedRepair === undefined ? {} : { directedRepair: input.directedRepair };
    const { child, reproductionEvent } = await fuse(
      { runId: input.runId, parents: distinct, seed: input.seed, ...genPart, ...directedPart },
      { gateway: deps.gateway, emit: deps.emit, newId: deps.newId },
    );
    return { zeroSurvivors: false, child, reproductionEvent };
  }

  if (distinct.length === 1) {
    // exactly 1 distinct → mutation_only from the single survivor (no gateway/fusion).
    const { child, reproductionEvent } = await reproduceMutationOnly(
      distinct[0]!.agenome,
      context,
      {
        emit: deps.emit,
        newId: deps.newId,
        bounds: deps.bounds,
      },
    );
    return { zeroSurvivors: false, child, reproductionEvent };
  }

  // 0 distinct → abort; selection returns the flag, the kernel emits generation.completed{survivors:0}.
  await abortInsufficientParents(context, { emit: deps.emit, newId: deps.newId });
  return { zeroSurvivors: true };
}

/**
 * applyReproduction — the mode-keyed replay dispatcher. Reconstructs the child from the persisted
 * `ReproductionEvent` with NO gateway and NO rng re-sample (rule #7). The abort path persisted no
 * `ReproductionEvent`, so it has no child to reconstruct (not handled here).
 */
export function applyReproduction(
  parents: readonly FusionParent[],
  reproductionEvent: ReproductionEvent,
): Agenome {
  if (reproductionEvent.mode === 'mutation_only') {
    const [survivorId] = reproductionEvent.parentAgenomeIds;
    const survivor = parents.find((p) => p.agenome.id === survivorId)?.agenome;
    if (survivor === undefined) {
      throw new Error('applyReproduction: mutation_only survivor not found in the pool');
    }
    return applyMutation(survivor, reproductionEvent.mutationSummary, {
      newId: () => reproductionEvent.childAgenomeId,
    });
  }
  // fusion / crossover / output_synthesis → the fusion reconstructor.
  return applyFusion(parents, reproductionEvent);
}
