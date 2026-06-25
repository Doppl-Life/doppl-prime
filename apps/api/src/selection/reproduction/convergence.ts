/**
 * EXPERIMENT (mutagen-dynamics, adaptive controller / E2) — the population CONVERGENCE measure + the
 * bidirectional mutation-fraction controller, both PURE (rule #7: computed from the persisted novelty
 * vectors → replay reconstructs the identical fraction; and the per-slot decision it feeds is itself
 * recorded in `ReproductionEvent.mode`, so replay never re-decides).
 *
 * `noveltySpread` = the mean pairwise COSINE DISTANCE of a generation's candidate novelty vectors — high =
 * diverse, low = converged. `adaptiveMutationFraction` is the emergent, BIDIRECTIONAL pressure Michael
 * described: when the population CONVERGES (spread below target) it RAISES the mutation fraction to inject
 * divergence; when it DIVERGES (spread above target) it LOWERS the fraction so fusion can consolidate. The
 * controller pushes against whatever it sees — convergence/divergence is the emergent behavior of the soup,
 * not a preset dial. Calibrated against observed fusion_only spreads (~0.29–0.35).
 */

export interface AdaptiveParams {
  /** The spread the controller steers toward — below it pushes divergence, above it pushes convergence. */
  readonly targetSpread: number;
  /** Sensitivity: fraction delta per unit of spread error. */
  readonly gain: number;
  /** The neutral baseline fraction (at exactly target spread). */
  readonly base: number;
  /** Clamp bounds — the fraction never leaves [min, max] (a sane r/K envelope). */
  readonly min: number;
  readonly max: number;
}

/** Defaults calibrated to the observed novelty-spread band (fusion_only converged from ~0.35 → ~0.29). */
export const DEFAULT_ADAPTIVE_PARAMS: AdaptiveParams = {
  targetSpread: 0.34,
  gain: 3,
  base: 1 / 3,
  min: 0.1,
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
 * measure → the controller treats it as fully converged, maximizing divergence pressure).
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
 * The bidirectional controller: spread BELOW target (converged) → fraction ABOVE base (more mutation →
 * inject divergence); spread ABOVE target (diverse) → fraction BELOW base (more fusion → consolidate).
 * Clamped to [min, max]. Pure; deterministic over the (persisted) spread.
 */
export function adaptiveMutationFraction(
  spread: number,
  params: AdaptiveParams = DEFAULT_ADAPTIVE_PARAMS,
): number {
  const raw = params.base + params.gain * (params.targetSpread - spread);
  return Math.min(params.max, Math.max(params.min, raw));
}
