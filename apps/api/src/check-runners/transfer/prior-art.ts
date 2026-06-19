import type { CrossDomainTransferPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * transfer.prior_art (P4.9) — looks up the candidate's
 * (sourceDomain, sourceTechnique) pair in a curated prior-art corpus
 * supplied via `ctx.deps.transferCorpus`. Skip-with-reason if no corpus
 * is wired in or if the lookup misses; never errors out.
 *
 * Phase 4 ships the adapter shape and the deterministic lookup; the
 * production corpus contents are a Phase D demo-prep deliverable.
 * Adapters that need to call live retrieval set `ctx.mode = "live"` and
 * receive a RetrievalSource via `ctx.deps.retrieval` — covered by U10's
 * live re-run path, not the normal verifyHook path.
 */

interface CandidateWithPayload {
  subtypePayload?: CrossDomainTransferPayload;
}

export interface TransferCorpus {
  /** Map sourceDomain → known techniques (lowercased prefixes). */
  byDomain: Record<string, string[]>;
}

interface TransferCtxDeps {
  transferCorpus?: TransferCorpus;
}

export const transferPriorArt = defineCheckAdapter({
  id: "transfer.prior_art",
  checkType: "transfer.prior_art",
  description: "Lookup against curated prior-art corpus for (sourceDomain, sourceTechnique)",
  capabilities: ["evidence", "retrieval"],
  fn: async (input, ctx) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "transfer.prior_art",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const corpus = (ctx.deps as TransferCtxDeps | undefined)?.transferCorpus;
    if (!corpus) {
      return {
        checkType: "transfer.prior_art",
        status: "skipped",
        skipReason: "no_corpus_provided",
        evidenceRefs: [],
      };
    }
    const techniques = corpus.byDomain[payload.sourceDomain.toLowerCase()] ?? [];
    const techLower = payload.sourceTechnique.toLowerCase();
    const match = techniques.find((t) => techLower.includes(t));
    if (!match) {
      return {
        checkType: "transfer.prior_art",
        status: "skipped",
        skipReason: "no_corpus_match",
        evidenceRefs: [],
      };
    }
    return {
      checkType: "transfer.prior_art",
      status: "passed",
      score: 0.8,
      output: { matched: match },
      evidenceRefs: [],
    };
  },
});
