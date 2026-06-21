import type { AgenomeStatus } from '@doppl/contracts';
import { createRng } from './reproduction/rng';
import type { AgenomeFitness } from './cull';

/**
 * selectParents (P5.7, ARCHITECTURE.md §3/§8) — selects the next generation's parent pool from the
 * eligible agenomes.
 *
 * Eligible = an agenome with ≥1 candidate that reached a `FitnessScore`, excluding `culled`/`spent`/
 * `failed` (§3 `eligible_parent`). Parents are ranked by best-candidate `FitnessScore.total` (the
 * composed fitness P5.6 already folded novelty/energy/critic/judge — selection picks the fittest
 * eligible; the novelty×energy×fitness allocation is P5.11's job). Ties are broken by a DETERMINISTIC
 * seeded RNG (`createRng(seed)` from the persisted per-run seed, reusing P5.8) — so the same
 * `(set, seed)` reconstructs the identical parent set on replay WITHOUT re-sampling (rule #7).
 *
 * The ranking is INPUT-ORDER-INDEPENDENT: eligible agenomes are canonical-sorted by `agenomeId`, the
 * seeded key is drawn per agenome in that canonical order, then sorted by `(total desc, rngKey asc)`. So
 * the replay-reader surfacing persisted `fitness.scored` in a different traversal than the live run
 * yields the identical parent set (the strongest replay guarantee).
 *
 * Zero eligible parents → an EMPTY parent set + `zeroSurvivors:true` (no fabricated parents). The KERNEL
 * emits `generation.completed{survivors:0}` (a lifecycle terminal) on that flag — selection only signals
 * it. Pure over its inputs + the persisted seed; no provider call, no clock, no input mutation.
 */
export interface SelectParentsInput {
  agenomes: readonly AgenomeFitness[];
  /** The persisted per-run RNG seed — the deterministic tie-break source (replay re-derives from it). */
  seed: number;
}

export interface SelectParentsResult {
  parents: string[];
  explanation: string;
  zeroSurvivors: boolean;
}

const TERMINAL_STATES: ReadonlySet<AgenomeStatus> = new Set(['culled', 'spent', 'failed']);

interface RankedAgenome {
  agenomeId: string;
  total: number;
  rngKey: number;
}

function isEligible(agenome: AgenomeFitness): boolean {
  return !TERMINAL_STATES.has(agenome.status) && agenome.candidates.length > 0;
}

export function selectParents(input: SelectParentsInput, count: number): SelectParentsResult {
  // Canonical order (by agenomeId) → input-order-independent seeded tie-break (replay guarantee).
  const eligible = input.agenomes
    .filter(isEligible)
    .map((agenome) => ({
      agenomeId: agenome.agenomeId,
      total: Math.max(...agenome.candidates.map((c) => c.total)),
    }))
    .sort((a, b) => (a.agenomeId < b.agenomeId ? -1 : a.agenomeId > b.agenomeId ? 1 : 0));

  if (eligible.length === 0) {
    return {
      parents: [],
      zeroSurvivors: true,
      explanation:
        'Zero eligible parents — no survivors; the generation completes with survivors:0.',
    };
  }

  // Draw one seeded tie-break key per agenome in the canonical order.
  const rng = createRng(input.seed);
  const ranked: RankedAgenome[] = eligible.map((e) => ({ ...e, rngKey: rng.nextFloat() }));

  // Rank by fitness desc; equal totals broken by the seeded key (ascending) — deterministic.
  ranked.sort((a, b) => (b.total !== a.total ? b.total - a.total : a.rngKey - b.rngKey));

  const selected = ranked.slice(0, Math.max(0, count));
  const parents = selected.map((r) => r.agenomeId);
  const detail = selected.map((r) => `${r.agenomeId}(fitness ${r.total})`).join(', ');
  const explanation =
    `Selected ${parents.length} parent(s) by fitness total, seeded tie-break (seed ${input.seed}): ` +
    `${detail}.`;

  return { parents, explanation, zeroSurvivors: false };
}
