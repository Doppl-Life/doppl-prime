import { FitnessScore } from '@doppl/contracts';
import type { RunEventRow } from '../../event-store';

/**
 * EXPERIMENT (mutagen-dynamics, adaptive controller / E2→E3) — the population CONVERGENCE measure + the
 * FITNESS-AWARE bidirectional mutation-fraction controller. Both PURE (rule #7: computed from the persisted
 * novelty vectors + fitness totals → replay reconstructs the identical fraction; and the per-slot decision
 * it feeds is itself recorded in `ReproductionEvent.mode`, so replay never re-decides).
 *
 * E2 learned the hard way (bake-off round 1): a controller that only steers DIVERSITY toward a target
 * over-explores — it pins the spread high, never lets a strong lineage consolidate, and surfaces a LOWER
 * peak than even the static-lens variant. Diversity is a MEANS to fitness, not the goal. So E3 reads the
 * FITNESS TREND too (Michael's r/K): when a lineage is clearly winning (best fitness improving), CONVERGE
 * onto it (low mutation = the K all-in bet / exploit); when the soup is stuck (no improvement), DIVERGE
 * (high mutation = cheap r exploration to find a new lineage). A diversity FLOOR still forces recovery if
 * the population collapses — so it converges onto strength without ever eating all its variety.
 */

export interface AdaptiveParams {
  /** Mutation share when a lineage is winning → mostly fusion (converge / exploit / go K). */
  readonly exploitFraction: number;
  /** Mutation share when fitness is stuck → more mutation (explore / stay r). */
  readonly exploreFraction: number;
  /** Spread below this = the population has collapsed → force a recovery burst of mutation. */
  readonly diversityFloor: number;
  /** Mutation share forced when recovering from a collapse (overrides exploit, never fully converges). */
  readonly recoveryFraction: number;
  /** Min best-fitness gain (gen over gen) that counts as "improving" (noise margin). */
  readonly improveEpsilon: number;
  /**
   * HONEST GATE (#3) — the look-back window (in generations) for the judge-acceptance exploit trigger. The
   * controller commits to exploit only when this generation's best judge_acceptance beats the BEST over the
   * prior `exploitWindow` generations (not just the immediately-prior gen), so a single-generation judge dip
   * or noise spike can't flip the whole population into exploit on a decoy peak. 1 = the old single-step check.
   */
  readonly exploitWindow: number;
  /** Clamp bounds — the fraction never leaves [min, max]. */
  readonly min: number;
  readonly max: number;
}

/** Defaults calibrated to round-1 observations (fusion_only collapsed to ~0.25; healthy spread ~0.30–0.33). */
export const DEFAULT_ADAPTIVE_PARAMS: AdaptiveParams = {
  exploitFraction: 0.15,
  exploreFraction: 0.45,
  diversityFloor: 0.26,
  recoveryFraction: 0.55,
  improveEpsilon: 0.005,
  exploitWindow: 2,
  min: 0.05,
  max: 0.7,
};

function cosineDistance(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Mean pairwise cosine distance over the generation's novelty vectors. < 2 vectors → 0 (no spread to
 * measure → treated as fully converged, so the diversity floor forces recovery).
 */
export function noveltySpread(vectors: readonly (readonly number[])[]): number {
  const usable = vectors.filter((v) => v.length > 0);
  if (usable.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      sum += cosineDistance(usable[i]!, usable[j]!);
      pairs += 1;
    }
  }
  return pairs === 0 ? 0 : sum / pairs;
}

/**
 * The fitness-aware bidirectional controller. `improving` = the best fitness rose (gen over gen) by more
 * than `improveEpsilon` → exploit (converge); else explore (diverge). If the spread has dropped below the
 * diversity floor, force a recovery burst regardless (never collapse). Pure; deterministic over the
 * (persisted) spread + trend.
 */
export function adaptiveMutationFraction(
  spread: number,
  improving: boolean,
  params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS,
): number {
  let fraction = improving ? params.exploitFraction : params.exploreFraction;
  if (spread < params.diversityFloor) fraction = Math.max(fraction, params.recoveryFraction);
  return Math.min(params.max, Math.max(params.min, fraction));
}

/**
 * Is the best fitness improving across generations? Pure over (genIndex, bestTotal) pairs: finds the
 * current generation's best vs the immediately-prior generation's best. No prior generation (the first
 * reproduction) → false (explore by default — there is no lineage to exploit yet).
 */
export function isFitnessImproving(
  bestByGenIndex: ReadonlyMap<number, number>,
  currentGenIndex: number,
  epsilon: number,
): boolean {
  const current = bestByGenIndex.get(currentGenIndex);
  const prev = bestByGenIndex.get(currentGenIndex - 1);
  if (current === undefined || prev === undefined) return false;
  return current > prev + epsilon;
}

/**
 * HONEST GATE (#3) — is the HELD-OUT JUDGE acceptance improving across generations? Pure over
 * `(genIndex, bestJudgeAcceptance)` pairs. Unlike {@link isFitnessImproving} (which reads the blended
 * `total`, ~31% agent-visible), this reads ONLY the persisted `judge_acceptance` component — the signal
 * agents cannot game (rule #6) — so a noisy uptick in critic/novelty can't trip exploit on a decoy peak.
 * "Improving" = the current generation's best beats the BEST over the prior `window` generations by
 * `epsilon` (a window, not a single step — so a one-generation dip-then-recover isn't read as a climb).
 * No current value or no prior-window baseline → `false` (explore by default, mirroring isFitnessImproving).
 */
export function isJudgeAcceptanceImproving(
  bestJudgeByGenIndex: ReadonlyMap<number, number>,
  currentGenIndex: number,
  epsilon: number,
  window: number,
): boolean {
  const current = bestJudgeByGenIndex.get(currentGenIndex);
  if (current === undefined) return false;
  let priorBest = -Infinity;
  for (let g = currentGenIndex - 1; g >= currentGenIndex - window && g >= 0; g -= 1) {
    const v = bestJudgeByGenIndex.get(g);
    if (v !== undefined && v > priorBest) priorBest = v;
  }
  if (priorBest === -Infinity) return false; // no baseline in the window → explore by default
  return current > priorBest + epsilon;
}

/**
 * HONEST GATE (#3) — fold the persisted log into the windowed judge-acceptance exploit signal for the
 * reproduce seam. Reads each generation's BEST `fitness.scored.components.judge_acceptance` keyed by the
 * `generation.started.index`, then asks {@link isJudgeAcceptanceImproving} for the current generation.
 *
 * Returns `null` when NO generation carries a `judge_acceptance` component (the full judge-degrade path) —
 * the caller then FALLS BACK to the total-based {@link isFitnessImproving} so the controller never silently
 * freezes. Pure over the persisted log (rule #7): no provider/clock/RNG; replay re-derives the identical
 * decision, which is itself recorded downstream in `ReproductionEvent.mode`.
 */
export function judgeImprovingFromLog(
  scoredEvents: readonly RunEventRow[],
  generationId: string,
  params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS,
): boolean | null {
  const genIndex = new Map<string, number>();
  for (const row of scoredEvents) {
    if (row.type !== 'generation.started') continue;
    const idx = (row.payload as { index?: unknown }).index;
    if (typeof idx === 'number' && row.generationId !== null) genIndex.set(row.generationId, idx);
  }
  const bestJudgeByGenIndex = new Map<number, number>();
  for (const row of scoredEvents) {
    if (row.type !== 'fitness.scored' || row.generationId === null) continue;
    const idx = genIndex.get(row.generationId);
    if (idx === undefined) continue;
    const parsed = FitnessScore.safeParse(row.payload);
    if (!parsed.success) continue;
    const judge = parsed.data.components.judge_acceptance;
    if (typeof judge !== 'number') continue;
    const prev = bestJudgeByGenIndex.get(idx);
    if (prev === undefined || judge > prev) bestJudgeByGenIndex.set(idx, judge);
  }
  if (bestJudgeByGenIndex.size === 0) return null; // no judge signal anywhere → caller falls back to total
  const currentGenIndex = genIndex.get(generationId) ?? 0;
  return isJudgeAcceptanceImproving(
    bestJudgeByGenIndex,
    currentGenIndex,
    params.improveEpsilon,
    params.exploitWindow,
  );
}
