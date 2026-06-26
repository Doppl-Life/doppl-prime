import type { CandidateIdea, CriticMandate, CriticReview } from '@doppl/contracts';
import type { ModelGateway } from '../../model-gateway';
import type { EventStore } from '../../event-store';
import { runCriticCall, type CouncilRunContext } from './critic-call';

/**
 * P4.6 critic council orchestrator (ARCHITECTURE.md §7, KEY SAFETY RULE #6 emit-only). Runs the INJECTED
 * active mandate set (critic-set rotation is P4.7 — this slice runs whatever set it is given) and returns
 * the set of accepted `CriticReview`s ONLY. It can NEVER select a winner, mutate candidates/lineage, or
 * alter scoring policy — the return type is `CriticReview[]` and nothing else (emit-only by construction).
 */

/**
 * The shared emit-only + numeric-score mandate appended to every critic instruction (Wave 1, Step 2 —
 * critic-score calibration). Critics previously emitted "a critique and confidence only", so the
 * `CriticReview.scores` record was always EMPTY → the `critic_scores` fitness component was a CONSTANT
 * (~15% of the weight sitting flat in the normalized-average denominator, dragging + compressing every
 * total). This elicits ONE numeric 0–5 rating per mandate with an explicit FULL-RANGE / DIFFERENTIATE
 * directive (the same central-tendency-breaking treatment the held-out judge's instruction uses), so the
 * component becomes a real discriminating signal AND supplies the per-axis numbers directed reproduction
 * (Step 3) consumes. `scores` stays OPTIONAL on the model-output schema (an omission repairs/degrades to a
 * non-contributing review, never a hard strict-reject → value 0). Emit-only is preserved (rule #6): the
 * critic supplies evidence + a rating, never a winner / scoring-policy override.
 */
const EMIT_ONLY_AND_SCORE =
  ' Output a structured `critique`, a `confidence` in [0,1], AND a `scores` object holding ONE numeric ' +
  'rating from 0 to 5 for this mandate, e.g. {"rating": 4}. Use the FULL 0–5 range and DIFFERENTIATE: ' +
  'anchor a typical idea at 2–3, give 4 to a clearly strong one, reserve 5 for the genuinely exceptional, ' +
  'and 0–1 for the genuinely weak — never cluster every idea at the same number; a mediocre idea MUST score ' +
  'lower than a strong one. You never select winners, mutate the candidate, or alter scoring.';

/**
 * Closed per-mandate critic instruction map (council config, NOT a frozen contract). Each instruction is
 * TRUSTED and rides the system message via the isolation seam (the candidate rides a separate user
 * message as DATA). Keyed by the closed `CriticMandate` union — every mandate has an instruction.
 */
const MANDATE_INSTRUCTIONS: Record<CriticMandate, string> = {
  factual_grounding:
    'You are a factual-grounding critic. Assess whether the candidate idea is grounded in accurate, ' +
    'verifiable facts and cite where it is or is not.' +
    EMIT_ONLY_AND_SCORE,
  novelty_prior_art:
    'You are a novelty / prior-art critic. Assess how novel the candidate idea is relative to known ' +
    'prior art.' +
    EMIT_ONLY_AND_SCORE,
  feasibility:
    'You are a feasibility critic. Assess whether the candidate idea is practically realizable given ' +
    'plausible constraints.' +
    EMIT_ONLY_AND_SCORE,
  falsification:
    'You are a falsification critic. Attempt to falsify the candidate idea — identify what would have to ' +
    'hold and whether it survives scrutiny.' +
    EMIT_ONLY_AND_SCORE,
  subtype_specific:
    'You are a subtype-specific critic. Apply the evaluation criteria specific to the candidate subtype.' +
    EMIT_ONLY_AND_SCORE,
};

export interface RunCouncilParams {
  gateway: ModelGateway;
  store: EventStore;
  candidate: CandidateIdea;
  /** The active mandate set for this candidate (injected; rotation = P4.7). */
  mandates: readonly CriticMandate[];
  runContext: CouncilRunContext;
}

export async function runCouncil(params: RunCouncilParams): Promise<CriticReview[]> {
  const { gateway, store, candidate, mandates, runContext } = params;
  const reviews: CriticReview[] = [];
  for (const mandate of mandates) {
    const review = await runCriticCall({
      gateway,
      store,
      candidate,
      mandate,
      instruction: MANDATE_INSTRUCTIONS[mandate],
      runContext,
    });
    if (review !== null) {
      reviews.push(review);
    }
  }
  return reviews;
}
