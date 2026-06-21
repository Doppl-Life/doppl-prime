import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, FinalJudgeAxis } from '@doppl/contracts';
import type { CandidateIdea, FinalJudgeRubric } from '@doppl/contracts';
import { assembleIsolatedRequest } from '../isolation/candidate-as-data';
import { DEFAULT_JUDGE_RUBRIC, loadJudgeRubric } from './rubric';
import { serializeCandidate } from '../council/critic-call';
import type { ModelGateway } from '../../model-gateway';
import type { AppendInput, EventStore } from '../../event-store';

/**
 * P4.8 held-out final-judge runner (ARCHITECTURE.md §7/§8/§4/§14). Runs the held-out judge under its own
 * `final_judge` ModelRole via the gateway, isolated from the candidate via the P4.4 candidate-as-DATA seam,
 * applying the IMMUTABLE loaded 5-axis rubric (P4.3). The model supplies only per-axis scores; the RUNNER
 * computes the weighted acceptance metric deterministically (the model NEVER supplies the aggregate —
 * KEY SAFETY RULE #6 anti-reward-hacking; rule #7 replay recomputes from the persisted per-axis scores).
 *
 * The judge sits OUTSIDE the breeding loop (final_judge role, never a rotating critic) and exposes no
 * selection/mutation/policy surface — it RETURNS the acceptance for selection (P5) to fold into
 * `fitness.scored`. There is NO `judge.reviewed` event; this slice emits only the `judge.review_started`
 * marker (actor `selection_controller` — the 7-role union has no `judge` member; no energy, rule #8) and
 * persists via the EventStore port only (no raw run_events write — forbidden #4). On a rejected/
 * un-repairable output it emits `output_schema_rejected` and returns null (never a fabricated score).
 */

/** Run / generation / candidate correlation injected by the caller (P3 scoring phase / P5). */
export interface JudgeRunContext {
  runId: string;
  generationId: string;
  candidateId: string;
}

/**
 * Permissive per-axis judge-model-output schema (runner-local — NOT a frozen contract; the acceptance
 * rides the OPEN `FitnessScore.components` seam into P5). The model fills ONLY the 5 axis scores (each on
 * the rubric's 0–5 scale); `z.object` STRIPS any model-sent aggregate (`score`/`total`/`acceptance`), so
 * the model can never supply its own winning number (rule #6). Keys mirror the frozen `FinalJudgeAxis`.
 */
const axisScore = z.number().min(0).max(5);
const JudgeModelOutput = z.object({
  grounding: axisScore,
  novelty: axisScore,
  feasibility: axisScore,
  falsification_survival: axisScore,
  subtype_check_pass: axisScore,
});

/** The validated acceptance the runner returns for selection (P5) to fold into `fitness.scored` (§8). */
export interface JudgeAcceptance {
  axisScores: Record<FinalJudgeAxis, number>;
  acceptanceMetric: number;
  policyVersion: string;
}

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

export async function runJudge(params: RunJudgeParams): Promise<JudgeAcceptance | null> {
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
  const acceptanceMetric = computeAcceptanceMetric(rubric, axisScores);

  // 6. Return the acceptance for selection (P5) to fold into fitness.scored. NO fitness.scored /
  //    judge.reviewed event is emitted here — that is selection's event (the rule-#7 replay home).
  return { axisScores, acceptanceMetric, policyVersion: rubric.policyVersion };
}
