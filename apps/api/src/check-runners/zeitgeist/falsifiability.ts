import type { ZeitgeistSynthesisPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * zeitgeist.falsifiability (P4.10) — confirms the candidate declares
 * at least one falsifiable prediction with specific enough wording to
 * be checked. Heuristic: each prediction must be ≥ 12 chars and
 * mention at least one concrete noun-like token (length ≥ 4).
 */

const MIN_PREDICTION_LEN = 12;
const MIN_NOUN_LEN = 4;

interface CandidateWithPayload {
  subtypePayload?: ZeitgeistSynthesisPayload;
}

function hasConcreteNoun(prediction: string): boolean {
  return prediction.split(/[^a-zA-Z0-9]+/).some((tok) => tok.length >= MIN_NOUN_LEN);
}

export const zeitgeistFalsifiability = defineCheckAdapter({
  id: "zeitgeist.falsifiability",
  checkType: "zeitgeist.falsifiability",
  description: "Confirms at least one falsifiable prediction is specific enough to be checked",
  capabilities: ["structural"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "zeitgeist.falsifiability",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    if (payload.falsifiablePredictions.length === 0) {
      return {
        checkType: "zeitgeist.falsifiability",
        status: "failed",
        score: 0,
        output: { reason: "no_predictions_declared" },
        evidenceRefs: [],
      };
    }
    const specific = payload.falsifiablePredictions.filter(
      (p) => p.length >= MIN_PREDICTION_LEN && hasConcreteNoun(p),
    );
    if (specific.length === 0) {
      return {
        checkType: "zeitgeist.falsifiability",
        status: "failed",
        score: 0.1,
        output: { reason: "all_predictions_too_vague" },
        evidenceRefs: [],
      };
    }
    return {
      checkType: "zeitgeist.falsifiability",
      status: "passed",
      score: Math.min(1, specific.length / 3),
      output: { specificCount: specific.length },
      evidenceRefs: [],
    };
  },
});
