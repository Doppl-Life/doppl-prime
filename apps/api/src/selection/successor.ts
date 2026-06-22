import type { Agenome, ReproductionEvent } from '@doppl/contracts';
import type { ModelGateway } from '../model-gateway';
import type { MutationBounds } from './reproduction/mutate';
import { parentDistance } from './reproduction/parent-distance';
import type { FusionParent } from './reproduction/parent-distance';
import { reproduce } from './reproduction/reproduce';
import type { SelectionEmitter } from './reproduction/degenerate';
import { allocate } from './allocation';

/**
 * assembleSuccessor (P5.11, ARCHITECTURE.md §8/§5) — assembles the gen N+1 successor population.
 *
 * It runs the heuristic `allocate` over the eligible parents, then realizes the per-parent allocation by
 * ANCHORING: a parent allocated `a_P` slots anchors `a_P` children — each produced by `reproduce` (P5.10)
 * with the pool `[P, mostDistantPartner(P)]` (so the allocation drives the offspring distribution AND the
 * fusion is anti-collapse-biased), or `[P]` → `mutation_only` when P is the only eligible parent. So
 * `population.length = Σ allocation ≤ remainingPopulation` (KEY SAFETY RULE #1 — a hint clamped to the
 * headroom; the kernel enforces).
 *
 * This is a RUNTIME HANDOFF (rule #9 layering): it RETURNS the population set + survivor count and does
 * NOT import the runtime kernel — the kernel mints gen N+1, assigns the children's generationId, applies
 * the agenome state transitions, and emits the generation lifecycle. It owns no event of its own (child
 * events come from `reproduce`). Zero eligible parents → an EMPTY successor (`survivors:0`, no fabricated
 * generation). Replay-reconstructable (rule #7): `allocate` is deterministic over the persisted component
 * values, and each child replays via `applyReproduction` from its persisted event — no gateway/embed call.
 */
export interface SuccessorParent extends FusionParent {
  /** The parent's best-candidate FitnessScore.total (heuristic weight input). */
  fitness: number;
  /** The consumed persisted novelty value (heuristic weight input; never re-embedded — rule #7). */
  novelty: number;
  /** The P5.4 energy-efficiency component value (heuristic weight input). */
  energyEfficiency: number;
}

export interface SuccessorInput {
  runId: string;
  /** The current (parents') generation; the kernel mints + assigns gen N+1 at the handoff. */
  generationId?: string;
  eligibleParents: readonly SuccessorParent[];
  /** Remaining population headroom (maxPopulation − currentPopulation) — the rule-#1 clamp bound. */
  remainingPopulation: number;
  /** The persisted per-run RNG seed; each slot derives a distinct seed (replay reads persisted outcomes). */
  seed: number;
}

export interface SuccessorDeps {
  gateway: ModelGateway;
  emit: SelectionEmitter;
  newId: () => string;
  bounds: MutationBounds;
}

export interface SuccessorChild {
  child: Agenome;
  reproductionEvent: ReproductionEvent;
}

export interface SuccessorResult {
  population: SuccessorChild[];
  survivors: number;
}

/** Distinct-by-agenome-id, first occurrence preserved. */
function distinct(parents: readonly SuccessorParent[]): SuccessorParent[] {
  const seen = new Set<string>();
  const out: SuccessorParent[] = [];
  for (const parent of parents) {
    if (!seen.has(parent.agenome.id)) {
      seen.add(parent.agenome.id);
      out.push(parent);
    }
  }
  return out;
}

/** The pool member (≠ anchor) maximizing parent-distance to the anchor; tie-break by canonical id asc. */
function mostDistantPartner(
  anchor: SuccessorParent,
  pool: readonly SuccessorParent[],
): SuccessorParent {
  let best: SuccessorParent | undefined;
  let bestDistance = -Infinity;
  for (const peer of pool) {
    if (peer.agenome.id === anchor.agenome.id) continue;
    const distance = parentDistance(anchor.noveltyVector, peer.noveltyVector);
    if (
      distance > bestDistance ||
      (distance === bestDistance && best !== undefined && peer.agenome.id < best.agenome.id)
    ) {
      bestDistance = distance;
      best = peer;
    }
  }
  return best ?? anchor;
}

export async function assembleSuccessor(
  input: SuccessorInput,
  deps: SuccessorDeps,
): Promise<SuccessorResult> {
  const pool = distinct(input.eligibleParents);
  if (pool.length === 0) {
    return { population: [], survivors: 0 };
  }

  const allocation = allocate(
    pool.map((p) => ({
      agenomeId: p.agenome.id,
      fitness: p.fitness,
      novelty: p.novelty,
      energyEfficiency: p.energyEfficiency,
    })),
    input.remainingPopulation,
  );

  // Anchor schedule (canonical id order): each parent P appears `a_P` times.
  const schedule: SuccessorParent[] = [];
  for (const { agenomeId, spawns } of [...allocation].sort((a, b) =>
    a.agenomeId < b.agenomeId ? -1 : a.agenomeId > b.agenomeId ? 1 : 0,
  )) {
    const anchor = pool.find((p) => p.agenome.id === agenomeId);
    if (anchor === undefined) continue;
    for (let i = 0; i < spawns; i += 1) schedule.push(anchor);
  }

  const population: SuccessorChild[] = [];
  for (const [slot, anchor] of schedule.entries()) {
    const partners: SuccessorParent[] =
      pool.length >= 2 ? [anchor, mostDistantPartner(anchor, pool)] : [anchor];
    const slotSeed = (input.seed + slot) >>> 0;
    const genPart = input.generationId === undefined ? {} : { generationId: input.generationId };
    const result = await reproduce(
      { runId: input.runId, eligibleParents: partners, seed: slotSeed, ...genPart },
      deps,
    );
    if (!result.zeroSurvivors) {
      population.push({ child: result.child, reproductionEvent: result.reproductionEvent });
    }
  }

  return { population, survivors: population.length };
}
