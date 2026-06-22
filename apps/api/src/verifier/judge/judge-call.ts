import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, FinalJudgeAxis, JudgeResult } from '@doppl/contracts';
import type { CandidateIdea, FinalJudgeRubric } from '@doppl/contracts';
import { assembleIsolatedRequest } from '../isolation/candidate-as-data';
import { DEFAULT_JUDGE_RUBRIC, loadJudgeRubric } from './rubric';
import { serializeCandidate } from '../council/critic-call';
import type { ModelGateway } from '../../model-gateway';
import type { AppendInput, EventStore } from '../../event-store';

/**
 * P4.8 held-out final-judge runner (ARCHITECTURE.md §7/§8/§4/§14/§9). Runs the held-out judge under its own
 * `final_judge` ModelRole via the gateway, isolated from the candidate via the P4.4 candidate-as-DATA seam,
 * applying the IMMUTABLE loaded 5-axis rubric (P4.3). The model supplies only per-axis scores; the RUNNER
 * computes the weighted acceptance metric deterministically (the model NEVER supplies the aggregate —
 * KEY SAFETY RULE #6 anti-reward-hacking; rule #7 replay reads the persisted record, never re-judges).
 *
 * The judge sits OUTSIDE the breeding loop (final_judge role, never a rotating critic) and exposes no
 * selection/mutation/policy surface. It persists the frozen `JudgeResult` as the authoritative
 * `judge.reviewed` event (the P0.16 seam — `judge.reviewed`←`JudgeResult` is the held-out-judge's
 * authoritative home, exactly as `novelty.scored`←`NoveltyScore`), completing the
 * `judge.review_started`→`judge.reviewed` pair, and ALSO returns the `JudgeResult` for the caller.
 * Selection (P5.5) reads the `acceptance` scalar from the persisted record via the `candidateId` join +
 * the `FitnessScore.components.judge_acceptance` signal — NOT a duplicate authoritative copy. Both events
 * use actor `selection_controller` (the 7-role union has no `judge` member); they debit no energy (rule #8)
 * and persist via the EventStore port only (no raw run_events write — forbidden #4). On a rejected/
 * un-repairable output it emits `output_schema_rejected` and returns null (never a fabricated record).
 */

/** Run / generation / candidate correlation injected by the caller (P3 scoring phase / P5). */
export interface JudgeRunContext {
  runId: string;
  generationId: string;
  candidateId: string;
}

/**
 * Permissive per-axis judge-model-output schema (runner-local — NOT a frozen contract; only the model's
 * raw per-axis input). The model fills ONLY the 5 axis scores (each on the rubric's 0–5 scale); `z.object`
 * STRIPS any model-sent aggregate (`score`/`total`/`acceptance`) or identity (`id`), so the model can
 * never supply its own winning number or the record's identity (rule #6). The runner computes the
 * `acceptance` aggregate + sets the `id`; the result is the frozen `JudgeResult`. Keys mirror `FinalJudgeAxis`.
 */
const axisScore = z.number().min(0).max(5);
const JudgeModelOutput = z.object({
  grounding: axisScore,
  novelty: axisScore,
  feasibility: axisScore,
  falsification_survival: axisScore,
  subtype_check_pass: axisScore,
});

export interface RunJudgeParams {
  gateway: ModelGateway;
  store: EventStore;
  candidate: CandidateIdea;
  runContext: JudgeRunContext;
  /**
   * The rubric SOURCE — defaults to the immutable {@link DEFAULT_JUDGE_RUBRIC} const (the only
   * source by construction; no agenome/candidate-derived path can set it — the P4.3 [low] obligation).
   * Always re-validated through {@link loadJudgeRubric} (defense-in-depth).
   */
  rubricSource?: unknown;
}

const JUDGE_INSTRUCTION =
  'You are the held-out final judge. Score the candidate idea on each of the five fixed rubric axes ' +
  '(grounding, novelty, feasibility, falsification_survival, subtype_check_pass), each on a 0–5 scale. ' +
  'Return only the per-axis scores — you do not decide acceptance, select winners, or alter the rubric.';

/**
 * Deterministically compute the weighted acceptance metric from the per-axis scores × the rubric weights.
 * Iterates the rubric's AXES only, so a non-axis weight (e.g. the §8 energy-efficiency tiebreak, which
 * selection applies from energy data) is excluded here. No `Math.random`/`Date.now` — replay recomputes
 * the identical metric from the persisted per-axis scores (rule #7).
 */
function computeAcceptanceMetric(
  rubric: FinalJudgeRubric,
  axisScores: Record<FinalJudgeAxis, number>,
): number {
  let metric = 0;
  for (const axis of rubric.axes) {
    metric += axisScores[axis] * (rubric.weights[axis] ?? 0);
  }
  return metric;
}

function baseEnvelope(
  id: string,
  type: AppendInput['type'],
  runContext: JudgeRunContext,
  payload: Record<string, unknown>,
): AppendInput {
  return {
    id,
    runId: runContext.runId,
    generationId: runContext.generationId,
    candidateId: runContext.candidateId,
    type,
    actor: 'selection_controller',
    payload,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export async function runJudge(params: RunJudgeParams): Promise<JudgeResult | null> {
  const { gateway, store, candidate, runContext } = params;
  const rubricSource = params.rubricSource ?? DEFAULT_JUDGE_RUBRIC;

  // 1. Load the rubric ONLY via loadJudgeRubric from the immutable source (no agent-writable path).
  const rubric = loadJudgeRubric(rubricSource);
  const markerId = `judge:${runContext.runId}:${runContext.candidateId}`;

  // 2. judge.review_started marker (actor selection_controller, generic payload, NO energy) — before the call.
  await store.append(
    baseEnvelope(`${markerId}:started`, 'judge.review_started', runContext, {
      candidateId: runContext.candidateId,
      policyVersion: rubric.policyVersion,
    }),
  );

  // 3. Build the judge request ONLY via the isolation seam (candidate as sentinel-wrapped DATA), final_judge role.
  const request = assembleIsolatedRequest({
    role: 'final_judge',
    instruction: JUDGE_INSTRUCTION,
    candidate: serializeCandidate(candidate),
    schema: JudgeModelOutput,
  });
  const response = await gateway.call(request);

  // 4. Rejected / un-assemblable output → output_schema_rejected, NO acceptance (never fabricated).
  const emitRejected = async (reason: string): Promise<null> => {
    const rejected = baseEnvelope(`${markerId}:rejected`, 'output_schema_rejected', runContext, {
      candidateId: runContext.candidateId,
      reason,
    });
    rejected.correlationId = response.providerMeta.gatewayRequestId;
    await store.append(rejected);
    return null;
  };
  if (!response.accepted) {
    return emitRejected(response.rejection?.reason ?? 'rejected');
  }
  const parsed = JudgeModelOutput.safeParse(response.output);
  if (!parsed.success) {
    return emitRejected('judge_output_unassemblable');
  }

  // 5. The RUNNER computes the acceptance metric deterministically — the model supplied only the axis
  //    scores; the aggregate is runner math (rule #6 + rule #7 replay-faithful).
  const axisScores: Record<FinalJudgeAxis, number> = {
    grounding: parsed.data.grounding,
    novelty: parsed.data.novelty,
    feasibility: parsed.data.feasibility,
    falsification_survival: parsed.data.falsification_survival,
    subtype_check_pass: parsed.data.subtype_check_pass,
  };
  const acceptance = computeAcceptanceMetric(rubric, axisScores);

  // 6. Build the frozen JudgeResult — RUNNER-set identity (deterministic id, no random/clock) + computed
  //    acceptance; the model never controls id/acceptance (rule #6). Validate it (producer-agreement,
  //    lesson 20; belt-and-suspenders with the append-path payload-map narrowing).
  const resultInput: Record<string, unknown> = {
    id: `judge-result:${runContext.runId}:${runContext.candidateId}`,
    candidateId: runContext.candidateId,
    axisScores,
    acceptance,
    rubricPolicyVersion: rubric.policyVersion,
    providerMeta: response.providerMeta,
  };
  if (response.langfuseTraceId !== undefined) {
    resultInput.langfuseTraceId = response.langfuseTraceId;
  }
  const judgeResult = JudgeResult.parse(resultInput);

  // 7. Emit judge.reviewed←JudgeResult — the authoritative, replay-faithful home (P0.16 seam), completing
  //    the judge.review_started→judge.reviewed pair. Persisted via the EventStore port (no raw write); the
  //    payload-map narrows it on append (fail-closed). The JudgeResult carries the full providerMeta, so
  //    no envelope correlationId is needed (unlike critic.reviewed / the rejection path).
  await store.append(
    baseEnvelope(`${markerId}:reviewed`, 'judge.reviewed', runContext, judgeResult),
  );

  // 8. Return the JudgeResult for the caller (selection P5.5 reads `acceptance` via the components join).
  return judgeResult;
}
