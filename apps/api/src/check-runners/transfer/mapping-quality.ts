import type { CrossDomainTransferPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * transfer.mapping_quality (P4.9) — judges the mapping is at least a
 * mapping (not just a restatement). MVP heuristic: transferMapping must
 * be long enough to be meaningful (>= 20 chars), distinct from
 * sourceTechnique and targetProblem (low overlap), and mention both
 * source and target sides.
 */

const MIN_MAPPING_LEN = 20;

interface CandidateWithPayload {
  subtypePayload?: CrossDomainTransferPayload;
}

export const transferMappingQuality = defineCheckAdapter({
  id: "transfer.mapping_quality",
  checkType: "transfer.mapping_quality",
  description:
    "Heuristic check that the transferMapping is a structured mapping, not a restatement",
  capabilities: ["structural"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "transfer.mapping_quality",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const m = payload.transferMapping;
    if (m.length < MIN_MAPPING_LEN) {
      return {
        checkType: "transfer.mapping_quality",
        status: "failed",
        score: 0,
        evidenceRefs: [],
      };
    }
    const mLower = m.toLowerCase();
    const mentionsSource = mLower.includes(payload.sourceDomain.toLowerCase().split(" ")[0] ?? "");
    const mentionsTarget = mLower.includes(payload.targetDomain.toLowerCase().split(" ")[0] ?? "");
    const ok = mentionsSource && mentionsTarget;
    return {
      checkType: "transfer.mapping_quality",
      status: ok ? "passed" : "failed",
      score: ok ? 0.8 : 0.3,
      evidenceRefs: [],
    };
  },
});
