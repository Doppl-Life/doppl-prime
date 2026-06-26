import { JudgeResult } from '@doppl/contracts';
import type { CandidateIdea } from '@doppl/contracts';
import { assembleIsolatedRequest } from '../isolation/candidate-as-data';
import { DEFAULT_JUDGE_RUBRIC, loadJudgeRubric } from './rubric';
import { serializeCandidate } from '../council/critic-call';
import {
  axisScoresFrom,
  buildJudgeResult,
  emitJudgeRejected,
  emitJudgeReviewStarted,
  emitJudgeReviewed,
  JUDGE_AXIS_CRITERIA,
  JudgeModelOutput,
  type JudgeRunContext,
} from './judge-core';
import type { ModelGateway } from '../../model-gateway';
import type { EventStore } from '../../event-store';

/**
 * P4.8 held-out final-judge runner (ARCHITECTURE.md §7/§8/§4/§14/§9) — the SINGLE-candidate path. Runs the
 * held-out judge under its own `final_judge` ModelRole via the gateway, isolated from the candidate via the
 * P4.4 candidate-as-DATA seam, applying the IMMUTABLE loaded 5-axis rubric (P4.3). The model supplies only
 * per-axis 0–10 scores; the RUNNER computes the weighted acceptance metric deterministically (the model
 * NEVER supplies the aggregate — KEY SAFETY RULE #6 anti-reward-hacking; rule #7 replay reads the persisted
 * record, never re-judges). All the rubric criteria, acceptance math, `JudgeResult` assembly, and event
 * shapes live in `judge-core.ts`, shared byte-identically with the peer-context `runComparativeJudge`.
 *
 * The judge sits OUTSIDE the breeding loop (final_judge role, never a rotating critic) and exposes no
 * selection/mutation/policy surface. It persists the frozen `JudgeResult` as the authoritative
 * `judge.reviewed` event (the P0.16 seam) and ALSO returns it for the caller (selection P5.5 reads
 * `acceptance` via the `candidateId` join + `FitnessScore.components.judge_acceptance`). Events use actor
 * `selection_controller`, debit no energy (rule #8), and persist via the EventStore port only (forbidden
 * #4). On a rejected/un-repairable output it emits `output_schema_rejected` and returns null.
 */

export { type JudgeRunContext } from './judge-core';

export interface RunJudgeParams {
  gateway: ModelGateway;
  store: EventStore;
  candidate: CandidateIdea;
  runContext: JudgeRunContext;
  /**
   * The rubric SOURCE — defaults to the immutable {@link DEFAULT_JUDGE_RUBRIC} const (the only source by
   * construction; no agenome/candidate-derived path can set it — the P4.3 [low] obligation). Always
   * re-validated through {@link loadJudgeRubric} (defense-in-depth).
   */
  rubricSource?: unknown;
}

// EXPERIMENT (judge gradient) — the 0–5 instruction let the judge model cluster every axis at 3–4 (central-
// tendency bias) → acceptance compressed to 5–6 distinct values capped ~0.68 → the dominant 46% fitness
// weight could not separate the top candidates → NO climb. Wave 2 Step 4 (Michael-signed-off, rule #6)
// WIDENS the scale to 0–10 and supplies the shared per-axis criteria + weakness-hunting so the judge
// DIFFERENTIATES. Rule #6 intact: still the immutable held-out anchor (loaded from the frozen const,
// runner-computed acceptance, agent-unwritable); recorded via the bumped rubric policyVersion (mvp-3). Rule
// #5 intact: candidate-INDEPENDENT trusted system text. The peer-comparative variant is `comparative-judge.ts`.
const JUDGE_INSTRUCTION =
  'You are the held-out final judge — the strict quality bar the organism cannot move. Score the candidate ' +
  'idea on each of the five fixed rubric axes (grounding, novelty, feasibility, falsification_survival, ' +
  'subtype_check_pass), each as an INTEGER 0–10. ' +
  JUDGE_AXIS_CRITERIA +
  ' Also return a `rationales` object with one concise line per axis naming the specific weakness that ' +
  'capped that score. The rationale only EXPLAINS your score — it does not change it. Return only the ' +
  'per-axis scores and rationales — you do not decide acceptance, select winners, or alter the rubric.';

export async function runJudge(params: RunJudgeParams): Promise<JudgeResult | null> {
  const { gateway, store, candidate, runContext } = params;
  const rubricSource = params.rubricSource ?? DEFAULT_JUDGE_RUBRIC;

  // 1. Load the rubric ONLY via loadJudgeRubric from the immutable source (no agent-writable path).
  const rubric = loadJudgeRubric(rubricSource);

  // 2. judge.review_started marker (actor selection_controller, generic payload, NO energy) — before the call.
  await emitJudgeReviewStarted(store, runContext, rubric.policyVersion);

  // 3. Build the judge request ONLY via the isolation seam (candidate as sentinel-wrapped DATA), final_judge role.
  const request = assembleIsolatedRequest({
    role: 'final_judge',
    instruction: JUDGE_INSTRUCTION,
    candidate: serializeCandidate(candidate),
    schema: JudgeModelOutput,
  });
  const response = await gateway.call(request);

  // 4. Rejected / un-assemblable output → output_schema_rejected, NO acceptance (never fabricated).
  if (!response.accepted) {
    return emitJudgeRejected(
      store,
      runContext,
      response.rejection?.reason ?? 'rejected',
      response.providerMeta.gatewayRequestId,
    );
  }
  const parsed = JudgeModelOutput.safeParse(response.output);
  if (!parsed.success) {
    return emitJudgeRejected(
      store,
      runContext,
      'judge_output_unassemblable',
      response.providerMeta.gatewayRequestId,
    );
  }

  // 5–6. The RUNNER computes acceptance + builds the frozen JudgeResult (model supplied only per-axis scores;
  //      the aggregate + identity are runner-owned — rule #6 + rule #7 replay-faithful).
  const judgeResult = buildJudgeResult({
    runContext,
    axisScores: axisScoresFrom(parsed.data),
    rationales: parsed.data.rationales,
    rubric,
    providerMeta: response.providerMeta,
    ...(response.langfuseTraceId !== undefined
      ? { langfuseTraceId: response.langfuseTraceId }
      : {}),
  });

  // 7. Emit judge.reviewed←JudgeResult — the authoritative, replay-faithful home (P0.16 seam).
  await emitJudgeReviewed(store, runContext, judgeResult);

  // 8. Return the JudgeResult for the caller (selection P5.5 reads `acceptance` via the components join).
  return judgeResult;
}
