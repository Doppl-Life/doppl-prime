import type { Agenome, ReproductionEvent } from '@doppl/contracts';
import type { ModelGateway } from '../model-gateway';
import type { MutationBounds } from './reproduction/mutate';
import { parentDistance } from './reproduction/parent-distance';
import type { FusionParent } from './reproduction/parent-distance';
import { reproduce } from './reproduction/reproduce';
import type { SelectionEmitter } from './reproduction/degenerate';
import { allocate } from './allocation';
import { isMutationSlot } from './reproduction/mutationSlot';
import type { AxisWeakness } from './reproduction/directed';
import { mapLimit } from '../concurrency/pLimit';

/** Max offspring slots reproduced CONCURRENTLY. Reproduction emits NO energy.spent (rule #8) and each
 * slot's RNG is position-deterministic (`slotSeed = seed + slot` → a fresh per-slot PRNG, never a shared
 * sequential stream), so concurrency is execution-strategy only: emitted events + their advisory-lock-
 * serialized `sequence` are unchanged (rule #2), and replay reconstructs from each child's persisted
 * ReproductionEvent regardless of live order (rule #7). */
const DEFAULT_REPRODUCE_CONCURRENCY = 6;

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
  /** Wave 1, Step 3 — the parent's weakest judged axis (the directed-repair target for fusion). Absent when
   *  the parent's best candidate has no `judge.reviewed` (degrades to generic directed synthesis). */
  weakestAxis?: AxisWeakness;
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
  /**
   * EXPERIMENT — the share of offspring slots produced by single-parent MUTATION (r) vs two-parent FUSION
   * (K), per the run's mutation strategy. 0 → fusion_only (the control, == HEAD). The kernel still bounds
   * the offspring count (rule #1); this only sets the r/K mix. Default 0 keeps callers byte-identical.
   */
  mutationFraction?: number;
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

  // DEFENSE-IN-DEPTH (anti-extinction): a NON-EMPTY pool whose heuristic weights are all zero — e.g.
  // every parent's novelty degraded to 0 (no `novelty.scored`), or a wholly zero-fitness generation —
  // makes `allocate` return all-zero spawns, so the schedule above is EMPTY and the loop below would
  // produce NO offspring AND emit NO event (a SILENT extinction: the run dies after this generation with
  // no reproduction/abort marker — the live demo-blocker). The pool is non-empty here, so this is NOT the
  // 0-eligible-parents case (`reproduction_aborted_insufficient_parents`, which `reproduce` owns per slot
  // and the kernel terminalizes as `survivors:0`) — the correct outcome is to STILL reproduce. Anchor the
  // single most-deserving parent (best fitness; tie-break canonical id asc — deterministic, so replay is
  // byte-faithful, rule #7) for ONE slot, clamped to the remaining headroom (rule #1 — never raises a cap;
  // `remainingPopulation < 1` keeps the schedule empty, deferring to the kernel's survivors:0 terminal).
  if (schedule.length === 0 && input.remainingPopulation >= 1) {
    const fallbackAnchor = [...pool].sort((a, b) =>
      b.fitness !== a.fitness
        ? b.fitness - a.fitness
        : a.agenome.id < b.agenome.id
          ? -1
          : a.agenome.id > b.agenome.id
            ? 1
            : 0,
    )[0];
    if (fallbackAnchor !== undefined) schedule.push(fallbackAnchor);
  }

  // Reproduce the scheduled slots CONCURRENTLY (bounded). `mapLimit` preserves INPUT (slot) order, and the
  // per-slot seed is `input.seed + slot` (the loop index from mapLimit), so the offspring set is identical
  // regardless of which fusion_synthesis call returns first — byte-faithful + replay-safe (rule #7).
  const slotResults = await mapLimit(
    schedule,
    DEFAULT_REPRODUCE_CONCURRENCY,
    async (anchor, slot) => {
      const slotSeed = (input.seed + slot) >>> 0;
      // EXPERIMENT — the per-slot r/K decision: a mutation slot reproduces from the SINGLE anchor (→
      // reproduce() runs mutation_only, drifting the lens), a fusion slot pairs the anchor with its most-
      // distant partner. Deterministic over the slot seed (replay reads the recorded mode). With
      // mutationFraction 0 (fusion_only) this is byte-identical to the prior always-fusion behavior.
      const mutateSlot = isMutationSlot(input.mutationFraction ?? 0, slotSeed, pool.length);
      const partners: SuccessorParent[] =
        !mutateSlot && pool.length >= 2 ? [anchor, mostDistantPartner(anchor, pool)] : [anchor];
      const genPart = input.generationId === undefined ? {} : { generationId: input.generationId };
      // Wave 1, Step 3 — steer the slot's directed fusion toward the ANCHOR lineage's weakest judged axis
      // (the slot is anchored on this parent, so its weakness is what reproduction should repair). Absent →
      // generic directed synthesis (still anti-blend). Only consumed on the fusion path (≥2 parents).
      const directedPart =
        anchor.weakestAxis === undefined ? {} : { directedRepair: anchor.weakestAxis };
      return reproduce(
        {
          runId: input.runId,
          eligibleParents: partners,
          seed: slotSeed,
          ...genPart,
          ...directedPart,
        },
        deps,
      );
    },
  );

  const population: SuccessorChild[] = [];
  for (const result of slotResults) {
    if (!result.zeroSurvivors) {
      population.push({ child: result.child, reproductionEvent: result.reproductionEvent });
    }
  }

  return { population, survivors: population.length };
}
