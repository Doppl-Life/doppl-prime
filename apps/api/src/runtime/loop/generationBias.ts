/**
 * FB.4 — the diverge/converge dial's bias bands (ARCHITECTURE.md §5/§6, KEY SAFETY RULES #6/#7/#5/#1/#8).
 *
 * The per-run `RunConfig.generationBias` dial ∈ [−1,+1] (FB.0; diverge(+)/converge(−), 0 neutral) maps to
 * (1) a SYSTEM-AUTHORED, vetted, TRUSTED band fragment composed into the population_generator framing
 * (mirroring the FB.3 {@link import('./generationOperators').OPERATOR_FRAGMENTS} precedent) and (2) a
 * bounded, clamped temperature nudge ({@link biasToTemperature}). The dial biases GENERATION ONLY — the
 * held-out judge, its rubric, the scoring policy, and selection are untouched (rule #6 SOLO: the band
 * fragment + temperature reach the `population_generator` request alone; the critic/judge requests — built
 * by the single `assembleIsolatedRequest` chokepoint — take no bias and set no samplingParams, so the dial
 * is STRUCTURALLY unable to reach the evaluation path).
 *
 * Rule #6 BY CONSTRUCTION: a band fragment STEERS generation and NEVER references the held-out judge /
 * rubric / scoring / fitness anchor (pinned by the no-judge-words unit test). Rule #5: the fragments are a
 * CLOSED, system-authored set selected by a numeric dial — there is no untrusted free-text channel, and the
 * per-run problem stays isolated as untrusted DATA (`wrapUntrusted`, unchanged). Rule #7:
 * {@link composeBiasFraming} + {@link biasToTemperature} are PURE deterministic functions of the dial —
 * replay reconstructs the identical framing and reads the RECORDED executed temperature, never re-derives or
 * re-samples. Rule #1/#8: the dial shapes the PROMPT + the sampling param only — it reads/changes no cap and
 * alters no energy debit.
 */

type BiasBand = 'strong_converge' | 'converge' | 'neutral' | 'diverge' | 'strong_diverge';

/**
 * The diverge/converge band fragments — system-authored TRUSTED lens lines, rule-#6-clean (NO judge /
 * rubric / scoring / score / fitness / weight / acceptance / reward reference). `neutral` is empty so a
 * neutral/absent dial keeps the generation framing BYTE-IDENTICAL to the no-bias baseline (backward-compat).
 */
export const BIAS_FRAGMENTS: Readonly<Record<BiasBand, string>> = {
  strong_converge:
    'Converge hard: commit to the single strongest direction, refine and consolidate it, and prioritize depth and feasibility over breadth.',
  converge:
    'Lean toward convergence: deepen and refine the most promising direction rather than opening new ones, and favor feasibility.',
  neutral: '',
  diverge:
    'Lean toward divergence: explore more widely and surface fresh, non-obvious angles beyond the most direct direction.',
  strong_diverge:
    'Diverge hard: maximize breadth and novelty, depart from the obvious, and pursue unconventional directions others overlook.',
};

/** The neutral dead-band half-width: |bias| < this → neutral (no framing, no temperature nudge). */
const NEUTRAL_EDGE = 0.2;
/** The strong-band edge: |bias| ≥ this → the strong band (the ratified edges: ±0.2 neutral, ±0.6 strong). */
const STRONG_EDGE = 0.6;

/** The temperature nudge: `clamp(0.7 + 0.3·bias, 0.4, 1.2)`. The +1.2 ceiling is the research coherence cap. */
const TEMP_BASE = 0.7;
const TEMP_SPAN = 0.3;
const TEMP_MIN = 0.4;
const TEMP_MAX = 1.2;

/** Map a dial value to its band (deterministic; the ratified edges: ±0.2 neutral, ±0.6 strong). */
function biasBand(bias: number): BiasBand {
  if (bias < -STRONG_EDGE) return 'strong_converge';
  if (bias < -NEUTRAL_EDGE) return 'converge';
  if (bias < NEUTRAL_EDGE) return 'neutral';
  if (bias < STRONG_EDGE) return 'diverge';
  return 'strong_diverge';
}

/**
 * Compose the dial's TRUSTED band fragment into a framing suffix (the `\n\n`-prefixed line the caller appends
 * to the population_generator SYSTEM message, after the operator framing). Returns `''` for an absent or
 * neutral dial so the framing stays BYTE-IDENTICAL to the no-bias baseline (backward-compatible). PURE: a
 * function of the dial alone — it reads no cap, no energy, no clock, and makes no provider call (rule #7).
 */
export function composeBiasFraming(bias?: number): string {
  if (bias === undefined) return '';
  const fragment = BIAS_FRAGMENTS[biasBand(bias)];
  return fragment === '' ? '' : `\n\n${fragment}`;
}

/**
 * Map the dial to the generation call's temperature: `clamp(0.7 + 0.3·bias, [0.4, 1.2])` — diverge (bias>0)
 * → higher temperature, converge (bias<0) → lower (direction-consistent with the framing). Clamped to the
 * research-bounded ceiling 1.2 (beyond which coherence collapses with no diversity payoff). PURE/deterministic
 * (rule #7): replay reads the RECORDED executed temperature; it never re-derives via this function.
 */
export function biasToTemperature(bias = 0): number {
  return Math.min(TEMP_MAX, Math.max(TEMP_MIN, TEMP_BASE + TEMP_SPAN * bias));
}
