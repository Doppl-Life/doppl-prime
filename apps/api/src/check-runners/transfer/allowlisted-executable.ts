import type { CrossDomainTransferPayload } from "@doppl/contracts";
import { defineCheckAdapter } from "../registry.js";

/**
 * transfer.allowlisted_executable (P4.9, REQ-S-003) — the single
 * adapter that CAN run a prepared computational check for a candidate,
 * but ONLY for problem IDs on a fixed boot-time allowlist. Unprepared
 * problems map to `status: skipped` with `unprepared_problem:<id>`;
 * there is no path through this adapter that executes
 * candidate-supplied code.
 *
 * The prepared check itself is a placeholder for MVP — Phase D plugs in
 * the actual prepared computations (e.g., toy regression with a known
 * collapse-resistant sampler). The contract this file ships is the
 * allowlist gate.
 */

export const PREPARED_TRANSFER_PROBLEMS: ReadonlySet<string> = new Set([
  "regression_overfit",
  "embedding_collapse",
  "transfer_distribution_shift",
]);

interface CandidateWithPayload {
  subtypePayload?: CrossDomainTransferPayload;
}

export const transferAllowlistedExecutable = defineCheckAdapter({
  id: "transfer.allowlisted_executable",
  checkType: "transfer.allowlisted_executable",
  description: "Allowlist-gated prepared computational check for known transfer problems",
  capabilities: ["allowlisted_executable"],
  fn: async (input) => {
    const payload = (input.candidate as CandidateWithPayload | undefined)?.subtypePayload;
    if (!payload) {
      return {
        checkType: "transfer.allowlisted_executable",
        status: "skipped",
        skipReason: "missing_subtype_payload",
        evidenceRefs: [],
      };
    }
    const extras = input.extras as { preparedProblemId?: string } | undefined;
    const problemId = extras?.preparedProblemId ?? payload.targetProblem;
    if (!PREPARED_TRANSFER_PROBLEMS.has(problemId)) {
      return {
        checkType: "transfer.allowlisted_executable",
        status: "skipped",
        skipReason: `unprepared_problem:${problemId}`,
        evidenceRefs: [],
      };
    }
    // MVP placeholder: prepared problems pass deterministically. Phase D
    // tunes the prepared computation per problem.
    return {
      checkType: "transfer.allowlisted_executable",
      status: "passed",
      score: 1.0,
      output: { problemId },
      evidenceRefs: [],
    };
  },
});
