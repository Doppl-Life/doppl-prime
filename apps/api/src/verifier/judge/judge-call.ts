import { randomUUID } from "node:crypto";
import { CheckResult } from "@doppl/contracts";
import { z } from "zod";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { pipeStructuredOutput } from "../../model-gateway/structured-output.js";
import { assembleJudgeRequest } from "../isolation/candidate-as-data.js";
import { FINAL_JUDGE_POLICY_VERSION, FINAL_JUDGE_RUBRIC_TEMPLATE } from "./rubric.js";

/**
 * Single held-out final-judge call against one candidate (P4.8).
 *
 * Architectural note: Phase 0's frozen RunEventType enum has no dedicated
 * judge event. The held-out judge result is persisted as a
 * `check.completed` event with `result.checkType = "final_judge"`. The
 * judge is conceptually the bedrock check, so this avoids widening a
 * frozen contract while keeping the result observable on the same
 * projection that downstream consumers (Phase 5 selection) already use
 * for evidence. The per-axis scores ride on `CheckResult.output`; the
 * weighted total rides on `CheckResult.score`. PolicyVersion is also on
 * `output` so replay reconstructs which rubric the judgement was
 * produced under.
 *
 * Replay does NOT re-call the gateway — the persisted CheckResult is
 * authoritative. This file produces the result; reading it back is the
 * Phase 1 replay-reader's job.
 */

const JudgeModelOutput = z
  .object({
    grounding: z.number().int().min(0).max(5),
    novelty: z.number().int().min(0).max(5),
    feasibility: z.number().int().min(0).max(5),
    falsification_survival: z.number().int().min(0).max(5),
    subtype_check_pass: z.number().int().min(0).max(5),
    explanation: z.string(),
  })
  .strict();

export type JudgeAxisScores = Pick<
  z.infer<typeof JudgeModelOutput>,
  "grounding" | "novelty" | "feasibility" | "falsification_survival" | "subtype_check_pass"
>;

export interface JudgeCallInput {
  gateway: ModelGateway;
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  candidate: unknown;
  candidateId: string;
  runId: string;
  correlationId: string;
  generationId?: string;
}

export type JudgeCallResult =
  | {
      ok: true;
      result: CheckResult;
      axes: JudgeAxisScores;
      total: number;
      policyVersion: string;
    }
  | { ok: false; reason: "provider_failed" | "schema_rejected"; detail?: string };

function weightedTotal(axes: JudgeAxisScores): number {
  // Equal weights for MVP per rubric.ts. Sum of 5 axes max = 25.
  return (
    axes.grounding +
    axes.novelty +
    axes.feasibility +
    axes.falsification_survival +
    axes.subtype_check_pass
  );
}

export async function judgeCall(input: JudgeCallInput): Promise<JudgeCallResult> {
  const request = assembleJudgeRequest({
    rubricTemplate: FINAL_JUDGE_RUBRIC_TEMPLATE,
    candidate: input.candidate,
    common: {
      runId: input.runId,
      correlationId: input.correlationId,
      candidateId: input.candidateId,
      ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    },
  });

  let firstResponse: import("@doppl/contracts").ModelGatewayResponse;
  try {
    firstResponse = await input.gateway.invoke(request);
  } catch (_err) {
    return { ok: false, reason: "provider_failed" };
  }
  if (!firstResponse.ok) {
    return {
      ok: false,
      reason: "provider_failed",
      ...(firstResponse.validationError !== undefined
        ? { detail: firstResponse.validationError }
        : {}),
    };
  }

  const piped = await pipeStructuredOutput({
    raw: firstResponse.output,
    schema: JudgeModelOutput,
    repair: async () => {
      const repaired = await input.gateway.invoke(request);
      return repaired.output;
    },
    ctx: {
      appendEvent: input.appendEvent,
      runId: input.runId,
      correlationId: input.correlationId,
      role: "final_judge",
      routeId: "final_judge",
      candidateId: input.candidateId,
      ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
      ...(firstResponse.providerTraceId !== undefined
        ? { langfuseTraceId: firstResponse.providerTraceId }
        : {}),
      ...(firstResponse.langfuseObservationId !== undefined
        ? { langfuseObservationId: firstResponse.langfuseObservationId }
        : {}),
    },
  });

  if (!piped.ok) {
    return { ok: false, reason: "schema_rejected", detail: piped.validationError };
  }

  const axes: JudgeAxisScores = {
    grounding: piped.output.grounding,
    novelty: piped.output.novelty,
    feasibility: piped.output.feasibility,
    falsification_survival: piped.output.falsification_survival,
    subtype_check_pass: piped.output.subtype_check_pass,
  };
  const total = weightedTotal(axes);

  const result = CheckResult.parse({
    id: `judge_${randomUUID()}`,
    candidateId: input.candidateId,
    checkType: "final_judge",
    status: "passed",
    score: total,
    output: {
      axes,
      policyVersion: FINAL_JUDGE_POLICY_VERSION,
      explanation: piped.output.explanation,
    },
    evidenceRefs: [],
  });

  await input.appendEvent({
    runId: input.runId,
    type: "check.completed",
    actor: "system",
    payload: { result },
    correlationId: input.correlationId,
    candidateId: input.candidateId,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    ...(firstResponse.providerTraceId !== undefined
      ? { langfuseTraceId: firstResponse.providerTraceId }
      : {}),
    ...(firstResponse.langfuseObservationId !== undefined
      ? { langfuseObservationId: firstResponse.langfuseObservationId }
      : {}),
  });

  return { ok: true, result, axes, total, policyVersion: FINAL_JUDGE_POLICY_VERSION };
}
