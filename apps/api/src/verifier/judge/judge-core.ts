import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, FinalJudgeAxis, JudgeResult } from '@doppl/contracts';
import type { FinalJudgeRubric, ProviderMeta } from '@doppl/contracts';
import type { AppendInput, EventStore } from '../../event-store';

/**
 * Shared held-out-judge CORE (KEY SAFETY RULE #6 / #7 / ARCHITECTURE.md §7/§8/§4/§14). The single-candidate
 * runner (`judge-call.ts`) and the peer-context comparative runner (`comparative-judge.ts`) BOTH compose
 * these pieces so the two judge paths apply the IDENTICAL rubric criteria, the IDENTICAL runner-computed
 * acceptance math, the IDENTICAL frozen `JudgeResult` assembly, and the IDENTICAL `judge.review_started` /
 * `judge.reviewed` / `output_schema_rejected` event shapes — a divergence between them would be a silent
 * rule-#6 scoring difference under the same `policyVersion`. Single-sourced (lesson §5).
 *
 * Pure except the three thin emission helpers (which append via the injected EventStore port — no raw
 * run_events write, forbidden #4). No `Math.random`/`Date.now`: ids are deterministic and acceptance is a
 * fixed weighted sum, so replay reconstructs every record from the persisted log (rule #7).
 */

/** Run / generation / candidate correlation injected by the caller (P3 scoring phase / P5). */
export interface JudgeRunContext {
  runId: string;
  generationId: string;
  candidateId: string;
}

/**
 * The per-axis 0–10 score (Wave 2 Step 4 widened it from 0–5 for finer top-end quantization; the scale is a
 * runtime/scoring concern, NOT a frozen-rubric field — lesson §6). Mirror in `judge-acceptance.ts`'s
 * `JUDGE_AXIS_MAX_SCORE` (the normalization basis); the two move together.
 */
export const axisScore = z.number().min(0).max(10);

/**
 * The per-candidate judge-model-output SHAPE (the 5 axis scores + an OPTIONAL per-axis rationale). Spread
 * directly by the single-candidate `JudgeModelOutput` and, with a `ref`, by the comparative array schema —
 * so both paths elicit the same per-candidate fields. `z.object` STRIPS any model-sent aggregate
 * (`score`/`total`/`acceptance`) or identity (`id`): the model can never supply its own winning number or
 * the record's identity (rule #6). The runner computes `acceptance` + sets the `id`.
 */
export const judgeAxisFields = {
  grounding: axisScore,
  novelty: axisScore,
  feasibility: axisScore,
  falsification_survival: axisScore,
  subtype_check_pass: axisScore,
  // FB.8 — OPTIONAL per-axis one-line rationale (explanatory output; NEVER feeds the runner-computed
  // acceptance — rule #6). `.partial()` so a model that omits/partials it still parses (the score stays
  // load-bearing); the runner attaches the frozen JudgeResult.axisRationales ONLY when all 5 are present.
  rationales: z
    .object({
      grounding: z.string(),
      novelty: z.string(),
      feasibility: z.string(),
      falsification_survival: z.string(),
      subtype_check_pass: z.string(),
    })
    .partial()
    .optional(),
} as const;

/** The single-candidate judge-model-output schema (the model fills ONLY these per-axis fields). */
export const JudgeModelOutput = z.object(judgeAxisFields);
export type JudgeModelOutput = z.infer<typeof JudgeModelOutput>;

/**
 * The shared rubric-application CRITERIA — the per-axis EARN-FROM-ZERO anchors + count-the-evidence
 * sub-criteria + anti-cheap-signal clause + assign-earned-scores reinforcement. Single-sourced so the single
 * and comparative judge apply BYTE-IDENTICAL criteria under `final-judge-v4` (a drift would be a rule-#6
 * scoring difference). Candidate-INDEPENDENT (rule #5): it names no candidate and is composed into the trusted
 * system message.
 *
 * Phase J flip (operator-delegated, 2026-06-27): this is the recalibrated v4 criteria, promoted from the
 * test/eval candidate after the substantive-bar validation (live: spread 0.26→0.57, gamed crushed 0.42→0.12,
 * monotone). It REPLACED the prior mvp-3 "anchor a typical idea at 5–6" text that flattened every axis to ~0.53
 * (the HG2 ceiling). The pre-flip mvp-3 text is retained below as {@link JUDGE_AXIS_CRITERIA_MVP3_BASELINE}
 * ONLY for the eval's before-characterization (never boot-loaded). `policyVersion` bumped mvp-3 → final-judge-v4
 * in `rubric.ts` the same change (immutability-via-versioning, rule #6 / lesson §12).
 */
export const JUDGE_AXIS_CRITERIA =
  'Score each axis by EARNING UP FROM 0: start low and raise an axis ONLY for specific, expensive-to-fake ' +
  'evidence the candidate actually provides — never for confident tone, ambition, or intent. The scale: ' +
  '0 = the axis is absent or fails outright; 1–3 = weak, a clear named flaw dominates (vague, generic, or ' +
  'unsupported); 4–5 = competent but SHALLOW — plausible and on-topic but missing the named evidence or ' +
  'concrete test the axis demands (this is where a TYPICAL idea lands; do NOT drift it up to 5–6); 6–7 = ' +
  'solid — real named evidence and a concrete mechanism or prediction, with one or two soft spots; 8–9 = ' +
  'strong AND independently checkable on this axis — reachable for genuinely good work, NOT reserved for the ' +
  'rare; 10 = a skeptical critic could not materially improve this axis. USE THE FULL RANGE and DIFFERENTIATE ' +
  'the candidates from one another. Set each axis ONLY by its sub-criteria below — COUNT what is genuinely ' +
  'present, give no credit for ambition: grounding = how many SPECIFIC, NAMED, checkable evidence anchors the ' +
  'candidate cites (a named study, dataset, system, organization, or hard number a reader could go verify): ' +
  'none, however confident the prose → 0–2; one solid anchor → 4–5; several independent checkable anchors → ' +
  '8+. novelty = the transfer or thesis is BOTH non-obvious AND specific — it names the exact source ' +
  'technique and the exact target mechanism; a well-known mapping, or a non-obvious one stated only in ' +
  'generic terms → 0–4. feasibility = a CONCRETE buildable mechanism with current means, testable within one ' +
  'iteration, that NAMES the build path; "leverage AI to…", "a holistic platform that…", or any mechanism ' +
  'with no named path → 0–3. falsification_survival = states a CONCRETE falsifiable prediction with a number, ' +
  'threshold, or operational test a real check could run, that would plausibly survive it; unfalsifiable, ' +
  'hedged, or trivially-true claims → 0–3; a sharp numeric prediction with a named test → 8+. ' +
  'subtype_check_pass = the candidate genuinely fits and fully populates its declared idea subtype. ' +
  'Cheap-to-fake signals earn NOTHING: length, confident tone, buzzword density, framework name-drops, and ' +
  'sweeping "paradigm / transform / exponential / antifragile" language are NOT evidence — a long, confident, ' +
  'sourceless answer scores LOWER on grounding than a short answer with one checkable source. ' +
  'ASSIGN EARNED SCORES — do not be conservative about evidence that IS present: "earn up from 0" means START ' +
  'low and RAISE for evidence, NOT cap evidenced work below the band its sub-criteria specify. When a ' +
  'candidate genuinely meets an axis sub-criterion, ASSIGN that band and do not reserve the top: one named ' +
  'checkable anchor on grounding IS a 4–5 (not 2–3); a candidate that names SEVERAL independent checkable ' +
  'anchors AND gives a concrete numeric/operational prediction with a test HAS EARNED 8–9 on those axes — ' +
  'assign it, do not withhold the high end out of general caution. Score BELOW a sub-criterion band only when ' +
  'the evidence is genuinely thinner than the candidate claims — but the floor for cheap-to-fake work (no ' +
  'named anchor, unfalsifiable, buzzwords) is UNCHANGED at 0–3. When uncertain whether a claimed source or ' +
  'number is real, score DOWN and name the gap in the rationale.';

/**
 * The PRE-FLIP mvp-3 criteria — retained ONLY as the eval's before-baseline (`judge-calibration.eval.ts`
 * characterizes the flat mvp-3 distribution as the BEFORE). NOT boot-loaded; `composeRuntime` wires the live
 * {@link JUDGE_AXIS_CRITERIA} (= final-judge-v4) above. Kept for provenance + the eval contrast; do not load
 * this onto the live judge.
 */
export const JUDGE_AXIS_CRITERIA_MVP3_BASELINE =
  'Calibrate EVERY axis to this scale: 0 = absent/failed, 1–2 = poor, 3–4 = below average, ' +
  '5–6 = solid but unremarkable, 7–8 = strong, 9–10 = exceptional (genuinely rare). Be a SKEPTICAL critic, ' +
  'not a cheerleader: most ideas are average, so anchor a typical idea at 5–6, reserve 7–8 for clearly ' +
  'strong work, and 9–10 only for the truly exceptional. Actively hunt each axis for its weakest point and ' +
  'let it pull the score DOWN. USE THE FULL 0–10 RANGE and DIFFERENTIATE — do NOT cluster every axis at ' +
  '5–6; an idea that is weak or unsupported on an axis MUST score 0–4 there. Judge each axis on its own ' +
  'meaning: grounding = backed by specific, verifiable evidence (not vague assertion); novelty = a genuinely ' +
  'non-obvious transfer (not a well-known mapping); feasibility = buildable/testable with current means (not ' +
  'hand-wavy); falsification_survival = makes a falsifiable prediction that would plausibly survive a real ' +
  'test (not unfalsifiable or trivially true); subtype_check_pass = actually fits its declared idea subtype.';

/**
 * Phase J — Slice Js: validate a judge-CRITERIA source and return the trusted criteria string, or throw a
 * field-identifying error (mirrors {@link loadJudgeRubric}'s load discipline for the rubric — §40). The
 * criteria is the per-axis 0–10 calibration text composed into the trusted judge instruction; it defaults to
 * the frozen {@link JUDGE_AXIS_CRITERIA} const (agent-unwritable, rule #6). Making it injectable lets a v4
 * criteria be exercised WITHOUT flipping the default (the `rubricSource` pattern applied to criteria — the
 * existing rubric seam can't reach it because criteria is a runner const, not a rubric field). An injected
 * alternate must still be a real NON-EMPTY string — undefined/empty/non-string is rejected so a missing
 * source can never silently blank the judge's calibration. Pure; no IO (the boot layer owns the source).
 */
export function loadJudgeCriteria(source: unknown): string {
  if (typeof source !== 'string') {
    throw new Error(
      `Invalid judge criteria — must be a string (got ${source === null ? 'null' : typeof source})`,
    );
  }
  if (source.trim().length === 0) {
    throw new Error('Invalid judge criteria — must be a non-empty string');
  }
  return source;
}

/**
 * Deterministically compute the weighted acceptance metric from the per-axis scores × the rubric weights.
 * Iterates the rubric's AXES only, so a non-axis weight (e.g. the §8 energy-efficiency tiebreak, which
 * selection applies from energy data) is excluded here. No `Math.random`/`Date.now` — replay recomputes the
 * identical metric from the persisted per-axis scores (rule #6 + rule #7).
 */
export function computeAcceptanceMetric(
  rubric: FinalJudgeRubric,
  axisScores: Record<FinalJudgeAxis, number>,
): number {
  let metric = 0;
  for (const axis of rubric.axes) {
    metric += axisScores[axis] * (rubric.weights[axis] ?? 0);
  }
  return metric;
}

/** Narrow a parsed per-axis model output to the closed `FinalJudgeAxis`-keyed record (drops any extra). */
export function axisScoresFrom(parsed: {
  grounding: number;
  novelty: number;
  feasibility: number;
  falsification_survival: number;
  subtype_check_pass: number;
}): Record<FinalJudgeAxis, number> {
  return {
    grounding: parsed.grounding,
    novelty: parsed.novelty,
    feasibility: parsed.feasibility,
    falsification_survival: parsed.falsification_survival,
    subtype_check_pass: parsed.subtype_check_pass,
  };
}

export interface BuildJudgeResultParams {
  runContext: JudgeRunContext;
  axisScores: Record<FinalJudgeAxis, number>;
  /** The model's optional per-axis rationales (matches the `.partial()` schema shape — any axis may be
   *  absent or present-undefined; the runner attaches them only when ALL 5 are non-empty strings). */
  rationales: Partial<Record<FinalJudgeAxis, string | undefined>> | undefined;
  rubric: FinalJudgeRubric;
  providerMeta: ProviderMeta;
  langfuseTraceId?: string;
}

/**
 * Build the frozen `JudgeResult` — RUNNER-set identity (deterministic id, no random/clock) + RUNNER-computed
 * acceptance (the model supplied only per-axis scores; the aggregate is runner math — rule #6). FB.8: attach
 * the per-axis rationale ONLY when the model supplied a non-empty one for ALL 5 axes (the frozen
 * `axisRationales` record is exhaustive); otherwise omit the optional field — explanatory output that NEVER
 * touches `acceptance`. Validated against the frozen contract (producer-agreement, lesson §20).
 */
export function buildJudgeResult(params: BuildJudgeResultParams): JudgeResult {
  const { runContext, axisScores, rationales, rubric, providerMeta, langfuseTraceId } = params;
  const acceptance = computeAcceptanceMetric(rubric, axisScores);
  const resultInput: Record<string, unknown> = {
    id: `judge-result:${runContext.runId}:${runContext.candidateId}`,
    candidateId: runContext.candidateId,
    axisScores,
    acceptance,
    rubricPolicyVersion: rubric.policyVersion,
    providerMeta,
  };
  if (langfuseTraceId !== undefined) {
    resultInput.langfuseTraceId = langfuseTraceId;
  }
  if (
    rationales !== undefined &&
    FinalJudgeAxis.options.every(
      (axis) => typeof rationales[axis] === 'string' && rationales[axis]!.trim().length > 0,
    )
  ) {
    resultInput.axisRationales = {
      grounding: rationales.grounding,
      novelty: rationales.novelty,
      feasibility: rationales.feasibility,
      falsification_survival: rationales.falsification_survival,
      subtype_check_pass: rationales.subtype_check_pass,
    };
  }
  return JudgeResult.parse(resultInput);
}

function judgeBaseEnvelope(
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

/** The deterministic per-candidate marker id prefix (`judge:{runId}:{candidateId}`). */
function markerId(runContext: JudgeRunContext): string {
  return `judge:${runContext.runId}:${runContext.candidateId}`;
}

/** Emit the `judge.review_started` marker (actor selection_controller, generic payload, NO energy — rule #8). */
export async function emitJudgeReviewStarted(
  store: EventStore,
  runContext: JudgeRunContext,
  policyVersion: string,
): Promise<void> {
  await store.append(
    judgeBaseEnvelope(`${markerId(runContext)}:started`, 'judge.review_started', runContext, {
      candidateId: runContext.candidateId,
      policyVersion,
    }),
  );
}

/** Emit the authoritative `judge.reviewed`←`JudgeResult` (the P0.16 seam; payload-map narrows on append). */
export async function emitJudgeReviewed(
  store: EventStore,
  runContext: JudgeRunContext,
  judgeResult: JudgeResult,
): Promise<void> {
  await store.append(
    judgeBaseEnvelope(
      `${markerId(runContext)}:reviewed`,
      'judge.reviewed',
      runContext,
      judgeResult,
    ),
  );
}

/** Emit `output_schema_rejected` for a candidate whose judge output was rejected/un-assemblable (never a
 *  fabricated record — rule #6). Returns null so callers can `return emitJudgeRejected(...)`. */
export async function emitJudgeRejected(
  store: EventStore,
  runContext: JudgeRunContext,
  reason: string,
  correlationId?: string,
): Promise<null> {
  const rejected = judgeBaseEnvelope(
    `${markerId(runContext)}:rejected`,
    'output_schema_rejected',
    runContext,
    { candidateId: runContext.candidateId, reason },
  );
  if (correlationId !== undefined) {
    rejected.correlationId = correlationId;
  }
  await store.append(rejected);
  return null;
}
