import type { CrossDomainTransferPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * transfer.source_validity (P4.9) — structural pre-screen for the
 * source-side fields of a cross_domain_transfer payload. Returns
 * `failed` when sourceDomain or sourceTechnique are missing or
 * unreasonably short; `passed` otherwise.
 *
 * MVP shape: deterministic, no gateway hop. The plan's "is this domain
 * real?" gateway-routed variant would call assembleCheckRequest with a
 * subtype_check role — that variant is deferred to Phase D corpus
 * tuning. Phase 4 ships the adapter shape + the lint-enforced isolation
 * invariant; production scoring is a Phase D / future iteration.
 */

const MIN_DOMAIN_LEN = 3;
const MIN_TECHNIQUE_LEN = 3;

interface CandidateWithPayload {
  subtypePayload?: CrossDomainTransferPayload;
}

export const transferSourceValidity = defineCheckAdapter({
  id: "transfer.source_validity",
  checkType: "transfer.source_validity",
  description: "Structural pre-screen for sourceDomain + sourceTechnique presence/length",
  capabilities: ["structural"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "transfer.source_validity",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const okLen =
      payload.sourceDomain.length >= MIN_DOMAIN_LEN &&
      payload.sourceTechnique.length >= MIN_TECHNIQUE_LEN;
    return {
      checkType: "transfer.source_validity",
      status: okLen ? "passed" : "failed",
      score: okLen ? 1.0 : 0.0,
      evidenceRefs: [],
    };
  },
});
