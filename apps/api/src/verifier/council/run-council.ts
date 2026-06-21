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
 * Closed per-mandate critic instruction map (council config, NOT a frozen contract). Each instruction is
 * TRUSTED and rides the system message via the isolation seam (the candidate rides a separate user
 * message as DATA). Keyed by the closed `CriticMandate` union — every mandate has an instruction.
 */
const MANDATE_INSTRUCTIONS: Record<CriticMandate, string> = {
  factual_grounding:
    'You are a factual-grounding critic. Assess whether the candidate idea is grounded in accurate, ' +
    'verifiable facts and cite where it is or is not. Emit a structured critique and confidence only — ' +
    'you never select winners, mutate the candidate, or alter scoring.',
  novelty_prior_art:
    'You are a novelty / prior-art critic. Assess how novel the candidate idea is relative to known ' +
    'prior art. Emit a structured critique and confidence only — you never select or score-override.',
  feasibility:
    'You are a feasibility critic. Assess whether the candidate idea is practically realizable given ' +
    'plausible constraints. Emit a structured critique and confidence only.',
  falsification:
    'You are a falsification critic. Attempt to falsify the candidate idea — identify what would have to ' +
    'hold and whether it survives scrutiny. Emit a structured critique and confidence only.',
  subtype_specific:
    'You are a subtype-specific critic. Apply the evaluation criteria specific to the candidate subtype. ' +
    'Emit a structured critique and confidence only.',
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
