import type { ZeitgeistSynthesisPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * zeitgeist.novelty (P4.10) — pre-screen against the candidate's own
 * comparablePriorArt list. The candidate must declare at least 1
 * prior-art entry (acknowledgement of context) AND the thesis should
 * not be a literal substring of any prior-art entry (heuristic for
 * "this is just a restatement of X").
 *
 * Note: this is the lightweight CHECK-side novelty pre-screen.
 * NoveltyScore (Phase 5) is the authoritative novelty number; this
 * adapter exists so the verifier track can drop obvious restatements
 * before fitness scoring spends embedding budget on them.
 */

interface CandidateWithPayload {
  subtypePayload?: ZeitgeistSynthesisPayload;
}

export const zeitgeistNovelty = defineCheckAdapter({
  id: "zeitgeist.novelty",
  checkType: "zeitgeist.novelty",
  description: "Pre-screen for obvious prior-art restatements against candidate's own list",
  capabilities: ["structural"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "zeitgeist.novelty",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    if (payload.comparablePriorArt.length === 0) {
      return {
        checkType: "zeitgeist.novelty",
        status: "failed",
        score: 0,
        output: { reason: "no_prior_art_declared" },
        evidenceRefs: [],
      };
    }
    const thesisLower = payload.thesis.toLowerCase();
    const restatement = payload.comparablePriorArt.find((p) =>
      thesisLower.includes(p.toLowerCase()),
    );
    if (restatement) {
      return {
        checkType: "zeitgeist.novelty",
        status: "failed",
        score: 0.1,
        output: { reason: "restatement_of_prior_art", matched: restatement },
        evidenceRefs: [],
      };
    }
    return {
      checkType: "zeitgeist.novelty",
      status: "passed",
      score: 0.7,
      evidenceRefs: [],
    };
  },
});
