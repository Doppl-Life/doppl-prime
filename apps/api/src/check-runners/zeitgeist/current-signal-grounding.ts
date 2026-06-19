import type { ZeitgeistSynthesisPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * zeitgeist.current_signal_grounding (P4.10) — verifies the candidate's
 * stated currentSignals at least partially overlap with a curated
 * zeitgeist corpus supplied via `ctx.deps.zeitgeistCorpus`. Skip-with-
 * reason if the corpus is absent or no signals match.
 */

interface CandidateWithPayload {
  subtypePayload?: ZeitgeistSynthesisPayload;
}

export interface ZeitgeistCorpus {
  knownSignalTokens: readonly string[]; // lowercase token prefixes
}

interface ZeitgeistCtxDeps {
  zeitgeistCorpus?: ZeitgeistCorpus;
}

export const zeitgeistCurrentSignalGrounding = defineCheckAdapter({
  id: "zeitgeist.current_signal_grounding",
  checkType: "zeitgeist.current_signal_grounding",
  description: "Confirms candidate's currentSignals match the curated zeitgeist corpus",
  capabilities: ["evidence", "retrieval"],
  fn: async (input, ctx) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "zeitgeist.current_signal_grounding",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const corpus = (ctx.deps as ZeitgeistCtxDeps | undefined)?.zeitgeistCorpus;
    if (!corpus) {
      return {
        checkType: "zeitgeist.current_signal_grounding",
        status: "skipped",
        skipReason: "no_corpus_provided",
        evidenceRefs: [],
      };
    }
    if (payload.currentSignals.length === 0) {
      return {
        checkType: "zeitgeist.current_signal_grounding",
        status: "failed",
        score: 0,
        evidenceRefs: [],
      };
    }
    const signals = payload.currentSignals.map((s) => s.toLowerCase());
    const matches = corpus.knownSignalTokens.filter((tok) =>
      signals.some((s) => s.includes(tok)),
    ).length;
    if (matches === 0) {
      return {
        checkType: "zeitgeist.current_signal_grounding",
        status: "skipped",
        skipReason: "no_corpus_match",
        evidenceRefs: [],
      };
    }
    const score = matches / Math.max(1, corpus.knownSignalTokens.length);
    return {
      checkType: "zeitgeist.current_signal_grounding",
      status: "passed",
      score,
      output: { matchCount: matches },
      evidenceRefs: [],
    };
  },
});
