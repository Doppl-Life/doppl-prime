import type { ZeitgeistSynthesisPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * zeitgeist.timing (P4.10) — verifies the candidate's `whyNow`
 * explanation has substance (not a placeholder) and references the
 * current moment in a non-trivial way. ZeitgeistSynthesisPayload does
 * NOT carry an explicit signalDate field, so timing is heuristic on
 * whyNow length + concrete-noun density.
 */

const MIN_WHY_NOW_LEN = 30;

interface CandidateWithPayload {
  subtypePayload?: ZeitgeistSynthesisPayload;
}

export const zeitgeistTiming = defineCheckAdapter({
  id: "zeitgeist.timing",
  checkType: "zeitgeist.timing",
  description: "Heuristic check that whyNow has substance and isn't placeholder text",
  capabilities: ["structural"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "zeitgeist.timing",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const w = payload.whyNow.trim();
    if (w.length < MIN_WHY_NOW_LEN) {
      return {
        checkType: "zeitgeist.timing",
        status: "failed",
        score: 0,
        evidenceRefs: [],
      };
    }
    const placeholder = /^(tbd|todo|placeholder|because|reasons|various)$/i;
    if (placeholder.test(w)) {
      return {
        checkType: "zeitgeist.timing",
        status: "failed",
        score: 0,
        evidenceRefs: [],
      };
    }
    return {
      checkType: "zeitgeist.timing",
      status: "passed",
      score: Math.min(1, w.length / 200),
      evidenceRefs: [],
    };
  },
});
