import { CriticMandate } from '@doppl/contracts';
import { createSeededRng } from '../../runtime';

/**
 * P4.7 — critic-set rotation (ARCHITECTURE.md §7 critic rotation; §4 replay determinism;
 * KEY SAFETY RULE #6 judge-anchor-untouchable; RULE #7 replay-pure).
 *
 * A PURE, deterministic per-generation selector: it returns the active subset of the closed
 * `CriticMandate` universe for a given generation, derived CLOSED-FORM from the run's PERSISTED
 * RNG seed + the generation index. Because both inputs are already persisted (`RunConfig.rngSeed`
 * in `run.configured`, `Generation.index`), replay re-derives the IDENTICAL set with zero coupling
 * to the shared run RNG stream — nothing is re-sampled (rule #7). It draws NOTHING through the
 * `persistOutcomes` bridge and emits NO event/contract: the active set is re-derivable from those
 * two persisted inputs and is additionally directly inspectable from the council's per-mandate
 * `critic.review_started` / `critic.reviewed` events for the generation.
 *
 * SAFETY by construction:
 *  - Rule #6 — the codomain is EXACTLY `CriticMandate.options`; this module imports no
 *    `FinalJudgeRubric` / judge config / `ScoringPolicy` / scoring symbol, so it cannot add,
 *    remove, reweight, or alter any judging axis or the held-out judge anchor. The signature
 *    accepts only scalars (no `CandidateIdea` / `Agenome` / candidate-content param), so candidate
 *    text or an agenome metric-mutation attempt is structurally incapable of moving the selection.
 *  - Rule #7 — pure, no IO: imports no model / embedding / web / event-store seam (lesson 30); the
 *    only randomness is the deterministic, seed-derived `createSeededRng` (mulberry32, byte-stable).
 */

/** The active critic-set size per generation (K of N). Tunable; clamped to `[1, N]` at use. */
export const DEFAULT_ACTIVE_CRITIC_COUNT = 3;

export interface SelectCriticMandatesParams {
  /** The run's PERSISTED PRNG seed (`RunConfig.rngSeed`, via `readRngSeed`) — NOT the scenario string. */
  rngSeed: number;
  /** The `Generation.index` this critic set is for. */
  generationIndex: number;
  /** Active critic count for this generation; clamped to `[1, N]`. Defaults to `DEFAULT_ACTIVE_CRITIC_COUNT`. */
  activeCount?: number;
}

/**
 * Mix the two persisted inputs into a distinct, well-distributed uint32 per generation, so the
 * critic set actually rotates generation to generation. Pure integer ops (`Math.imul` + xorshift),
 * byte-stable across V8 — no `Math.random`, no `Date.now`. A rare cross-generation seed collision is
 * acceptable (it merely repeats a set — not a safety issue); collision-freeness is not required.
 */
function deriveGenSeed(rngSeed: number, generationIndex: number): number {
  let h = (rngSeed >>> 0) ^ Math.imul(generationIndex >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Select the active critic mandate set for one generation. Returns a duplicate-free
 * `CriticMandate[]` of length `min(clampedActiveCount, N)`, deterministic for a given
 * `(rngSeed, generationIndex, activeCount)`.
 */
export function selectCriticMandates(params: SelectCriticMandatesParams): CriticMandate[] {
  const { rngSeed, generationIndex, activeCount } = params;
  const universe: CriticMandate[] = [...CriticMandate.options];
  const n = universe.length;
  const k = Math.max(1, Math.min(n, activeCount ?? DEFAULT_ACTIVE_CRITIC_COUNT));

  const rng = createSeededRng(deriveGenSeed(rngSeed, generationIndex));

  // Partial Fisher-Yates: pick k distinct members from the closed universe into the prefix.
  // Duplicate-free by construction (each draw swaps an unused tail element into position i).
  for (let i = 0; i < k; i++) {
    const j = rng.nextInt(i, n); // [i, n)
    const tmp = universe[i]!; // i ∈ [0, k) ⊆ [0, n) — in range
    universe[i] = universe[j]!; // j ∈ [i, n) — in range
    universe[j] = tmp;
  }

  return universe.slice(0, k);
}
