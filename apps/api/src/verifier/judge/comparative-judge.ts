import { z } from 'zod';
import { JudgeResult } from '@doppl/contracts';
import type { CandidateIdea } from '@doppl/contracts';
import { assembleIsolatedComparativeRequest } from '../isolation/candidate-as-data';
import { DEFAULT_JUDGE_RUBRIC, loadJudgeRubric } from './rubric';
import { serializeCandidate } from '../council/critic-call';
import { runJudge } from './judge-call';
import {
  axisScoresFrom,
  buildJudgeResult,
  emitJudgeRejected,
  emitJudgeReviewStarted,
  emitJudgeReviewed,
  JUDGE_AXIS_CRITERIA,
  judgeAxisFields,
  loadJudgeCriteria,
  type JudgeRunContext,
} from './judge-core';
import type { ModelGateway } from '../../model-gateway';
import type { EventStore } from '../../event-store';

/**
 * Wave 2 Step 4 — the held-out final judge's PEER-CONTEXT (comparative) path (ARCHITECTURE.md §7/§8/§4/§14;
 * Michael-signed-off, rule #6). The single-candidate `runJudge` scores each candidate in ISOLATION, which
 * let the model cluster every axis at the middle of the scale (central tendency) → `judge_acceptance`
 * compressed to a handful of distinct values and the dominant fitness weight could not separate the top
 * candidates → no climb. This runner scores a whole generation in ONE gateway call so the model can see the
 * peers and SPREAD its absolute scores (the winner upward), breaking the compression.
 *
 * Safety is byte-identical to the single path — they SHARE `judge-core.ts`:
 *  - rule #6: the model supplies ONLY per-axis 0–10 scores per candidate; the RUNNER computes each
 *    candidate's `acceptance` as `Σ(that candidate's axes × the immutable rubric weights)` — there is NO
 *    peer-relative term, so acceptance is PEER-INVARIANT given fixed axis scores (the structural FLOOR: a
 *    uniformly-weak generation cannot manufacture a high best; peer context can only change what the MODEL
 *    outputs, never how the runner aggregates). The rubric is loaded from the immutable const; the judge
 *    stays outside the breeding loop (final_judge role). Same `final-judge-mvp-3` policyVersion.
 *  - rule #5: every candidate reaches the model ONLY as a sentinel-wrapped DATA blob via the multi-blob
 *    isolation seam; the ref ids are caller-controlled (positional), never candidate text.
 *  - rule #7: each candidate persists its own `judge.review_started` + `judge.reviewed` (or
 *    `output_schema_rejected`) — identical event shapes to the single path — so replay reads them verbatim,
 *    never re-judges. Missing/unmatched output for a candidate → `output_schema_rejected` (never fabricated).
 *  - rule #8: markers + the call debit no energy; emission is via the EventStore port (forbidden #4).
 */

/** The per-candidate comparative output entry — the per-axis fields keyed alongside the candidate `ref`. */
const ComparativeJudgeModelOutput = z.object({
  candidates: z.array(z.object({ ref: z.string(), ...judgeAxisFields })),
});

// Phase J Slice Js: built from the (injectable) criteria — same byte-identical default, threadable v4. The
// comparative instruction shares the rubric CRITERIA byte-identically with the single judge (same rubric
// application); only the framing differs (score EACH candidate, key by ref). ISOLATION_COMPARATIVE_FRAMING
// (added by the seam) carries the "score independently, peers differentiate not inflate" FLOOR mandate.
// Candidate-INDEPENDENT trusted text (rule #5).
export function buildComparativeJudgeInstruction(criteria: string): string {
  return (
    'You are the held-out final judge — the strict quality bar the organism cannot move. Score EACH candidate ' +
    'idea below on each of the five fixed rubric axes (grounding, novelty, feasibility, falsification_survival, ' +
    'subtype_check_pass), each as an INTEGER 0–10. ' +
    criteria +
    ' For EACH candidate also return a `rationales` object with one concise line per axis naming the specific ' +
    'weakness that capped that score. The rationale only EXPLAINS your score — it does not change it. Return ' +
    'one result object per candidate in a `candidates` array, each with its `ref` id and the five per-axis ' +
    'scores — you do not decide acceptance, select winners, or alter the rubric.'
  );
}

export interface RunComparativeJudgeParams {
  gateway: ModelGateway;
  store: EventStore;
  /** The generation's candidates, scored together (peer context). */
  candidates: readonly CandidateIdea[];
  /** Run + generation correlation; each candidate's `candidateId` is taken from the candidate itself. */
  runContext: { runId: string; generationId: string };
  /** The rubric SOURCE — defaults to the immutable {@link DEFAULT_JUDGE_RUBRIC} (re-validated; rule #6). */
  rubricSource?: unknown;
  /** The CRITERIA source (Phase J Slice Js) — defaults to the frozen `JUDGE_AXIS_CRITERIA` (re-validated). */
  criteriaSource?: unknown;
}

/** candidateId → its JudgeResult (or null when that candidate's judge output was rejected / unmatched). */
export type ComparativeJudgeResults = Map<string, JudgeResult | null>;

/** The TRUSTED per-candidate ref: the 1-based positional index as a string (never candidate-derived). */
function refOf(index: number): string {
  return String(index + 1);
}

export async function runComparativeJudge(
  params: RunComparativeJudgeParams,
): Promise<ComparativeJudgeResults> {
  const { gateway, store, candidates, runContext } = params;
  const rubricSource = params.rubricSource ?? DEFAULT_JUDGE_RUBRIC;
  const criteriaSource = params.criteriaSource ?? JUDGE_AXIS_CRITERIA;
  const criteria = loadJudgeCriteria(criteriaSource);
  const results: ComparativeJudgeResults = new Map();

  if (candidates.length === 0) {
    return results;
  }

  // 1. Load the rubric ONLY via loadJudgeRubric from the immutable source (no agent-writable path, rule #6).
  const rubric = loadJudgeRubric(rubricSource);

  const contextFor = (index: number): JudgeRunContext => ({
    runId: runContext.runId,
    generationId: runContext.generationId,
    candidateId: candidates[index]!.id,
  });

  // N=1 — no peers to compare; delegate to the single-candidate path (identical behavior, no wasted framing).
  if (candidates.length === 1) {
    const single = await runJudge({
      gateway,
      store,
      candidate: candidates[0]!,
      runContext: contextFor(0),
      rubricSource,
      criteriaSource,
    });
    results.set(candidates[0]!.id, single);
    return results;
  }

  // 2. Per-candidate judge.review_started markers (before the call) — same shape as the single path.
  for (let i = 0; i < candidates.length; i += 1) {
    await emitJudgeReviewStarted(store, contextFor(i), rubric.policyVersion);
  }

  // 3. ONE comparative gateway call — all candidates as sentinel-wrapped DATA blobs via the multi-blob seam.
  const request = assembleIsolatedComparativeRequest({
    role: 'final_judge',
    instruction: buildComparativeJudgeInstruction(criteria),
    candidates: candidates.map((candidate, index) => ({
      ref: refOf(index),
      text: serializeCandidate(candidate),
    })),
    schema: ComparativeJudgeModelOutput,
  });
  const response = await gateway.call(request);
  const correlationId = response.providerMeta.gatewayRequestId;

  // 4. A rejected / un-assemblable WHOLE-call output rejects EVERY candidate (never a fabricated record).
  const rejectAll = async (reason: string): Promise<ComparativeJudgeResults> => {
    for (let i = 0; i < candidates.length; i += 1) {
      results.set(
        candidates[i]!.id,
        await emitJudgeRejected(store, contextFor(i), reason, correlationId),
      );
    }
    return results;
  };
  if (!response.accepted) {
    return rejectAll(response.rejection?.reason ?? 'rejected');
  }
  const parsed = ComparativeJudgeModelOutput.safeParse(response.output);
  if (!parsed.success) {
    return rejectAll('judge_output_unassemblable');
  }

  // 5. Index the per-candidate entries by ref (FIRST occurrence wins — deterministic; a duplicate or
  //    out-of-range ref is ignored). The model echoes the trusted ref we assigned each blob.
  const byRef = new Map<string, (typeof parsed.data.candidates)[number]>();
  for (const entry of parsed.data.candidates) {
    if (!byRef.has(entry.ref)) {
      byRef.set(entry.ref, entry);
    }
  }

  // 6. Per candidate: build + emit its JudgeResult from ITS axis scores (runner-computed acceptance, rule
  //    #6). A candidate with no matching entry → output_schema_rejected for that candidate (never fabricated).
  for (let i = 0; i < candidates.length; i += 1) {
    const ctx = contextFor(i);
    const entry = byRef.get(refOf(i));
    if (entry === undefined) {
      results.set(
        candidates[i]!.id,
        await emitJudgeRejected(store, ctx, 'judge_missing_ref', correlationId),
      );
      continue;
    }
    const judgeResult = buildJudgeResult({
      runContext: ctx,
      axisScores: axisScoresFrom(entry),
      rationales: entry.rationales,
      rubric,
      providerMeta: response.providerMeta,
      ...(response.langfuseTraceId !== undefined
        ? { langfuseTraceId: response.langfuseTraceId }
        : {}),
    });
    await emitJudgeReviewed(store, ctx, judgeResult);
    results.set(candidates[i]!.id, judgeResult);
  }

  return results;
}
