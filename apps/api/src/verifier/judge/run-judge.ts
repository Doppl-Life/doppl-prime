import type { CheckResult } from "@doppl/contracts";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { type JudgeAxisScores, judgeCall } from "./judge-call.js";

/**
 * Held-out final-judge runner (P4.8). Runs at run-end, NOT per
 * generation (D5 in the Phase 4 plan). Invoked from the terminal-
 * classifier path before the run's terminal flip. Iterates surviving
 * candidates, calls `judgeCall` for each, and returns the list of
 * accepted judgements.
 *
 * If no candidates survived (zero-survivors edge), the judge is not
 * called and no events are emitted — the terminal classifier still
 * runs normally, the run just has no acceptance metric to compare
 * against.
 */

export interface JudgeCandidate {
  candidateId: string;
  candidate: unknown;
}

export interface RunFinalJudgeInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  candidates: readonly JudgeCandidate[];
  runId: string;
  correlationIdFor: (candidateId: string) => string;
}

export interface JudgeAcceptance {
  candidateId: string;
  result: CheckResult;
  axes: JudgeAxisScores;
  total: number;
  policyVersion: string;
}

export async function runFinalJudge(input: RunFinalJudgeInput): Promise<JudgeAcceptance[]> {
  if (input.candidates.length === 0) {
    return [];
  }
  const acceptances: JudgeAcceptance[] = [];
  for (const c of input.candidates) {
    const out = await judgeCall({
      gateway: input.gateway,
      appendEvent: input.appendEvent,
      candidate: c.candidate,
      candidateId: c.candidateId,
      runId: input.runId,
      correlationId: input.correlationIdFor(c.candidateId),
    });
    if (out.ok) {
      acceptances.push({
        candidateId: c.candidateId,
        result: out.result,
        axes: out.axes,
        total: out.total,
        policyVersion: out.policyVersion,
      });
    }
    // Rejected / failed judgements leave no acceptance — their
    // output_schema_rejected or provider_call_failed events were already
    // persisted upstream.
  }
  return acceptances;
}
