import type { CrossDomainTransferPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * transfer.target_fit (P4.9) — checks the candidate's transferMapping
 * actually mentions the target problem (so the mapping is at least
 * superficially aimed at the stated target). Lightweight + deterministic
 * MVP behaviour.
 */

interface CandidateWithPayload {
  subtypePayload?: CrossDomainTransferPayload;
}

function tokensFrom(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

export const transferTargetFit = defineCheckAdapter({
  id: "transfer.target_fit",
  checkType: "transfer.target_fit",
  description: "Confirms the transferMapping at least mentions targetDomain or targetProblem",
  capabilities: ["structural"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "transfer.target_fit",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const mapping = payload.transferMapping.toLowerCase();
    const targetTokens = [
      ...tokensFrom(payload.targetDomain),
      ...tokensFrom(payload.targetProblem),
    ];
    const matches = targetTokens.filter((t) => mapping.includes(t)).length;
    const okMatches = matches >= 1;
    return {
      checkType: "transfer.target_fit",
      status: okMatches ? "passed" : "failed",
      score: targetTokens.length === 0 ? 0 : matches / Math.max(1, targetTokens.length),
      evidenceRefs: [],
    };
  },
});
