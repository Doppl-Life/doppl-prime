import { z } from 'zod';
import { FinalJudgeAxis } from './final-judge-rubric';
import { ProviderMeta } from '../gateway/provider-meta';

/**
 * JudgeResult — the held-out judge's persisted ACCEPTANCE OUTPUT (ARCHITECTURE.md §7/§8, Appendix A).
 * Strict 7-field object; `judge.reviewed` is the authoritative home for the held-out-judge acceptance,
 * exactly as `novelty.scored`←NoveltyScore is the authoritative home for novelty.
 *
 * The held-out judge (KEY SAFETY RULE #6 — the bedrock fitness anchor, anti-reward-hacking) applies
 * the fixed 5-axis 0-5 FinalJudgeRubric outside the breeding loop and produces the acceptance metric
 * that decides "gen N+1 beats gen N" (§7). Its output is UNTRUSTED until schema-validated (rule #5,
 * accept/repair≤1/reject) and only then persisted — so this strict shape is the gate at the persist
 * boundary, and selection reads the acceptance from the persisted record, never recomputing it (§8/P5.5).
 *
 * Mirrors NoveltyScore structurally (the sibling authoritative scoring measurement): id + candidateId
 * + the authoritative-once-computed payload + provenance + the policy-version tie. The KEY pins:
 *  - `axisScores` is `z.record(FinalJudgeAxis, z.number())` — the per-axis breakdown, keyed by the
 *    SINGLE-SOURCE closed FinalJudgeAxis (lesson §5). Zod's enum-keyed record is EXHAUSTIVE + CLOSED:
 *    all 5 axes required, an unknown axis key rejected — so a malformed/tampered judge output that
 *    drops or invents a judging axis fails CLOSED at the persist boundary (defense-in-depth for rule #6).
 *  - `acceptance` is the overall scalar metric selection consumes (surfaced as the named
 *    `FitnessScore.components.judge_acceptance` signal — the fitness↔judge link is by candidateId join
 *    + that component, NOT a duplicate authoritative copy, mirroring the fitness↔novelty link).
 *  - `rubricPolicyVersion` is REQUIRED and typed IDENTICALLY to `FinalJudgeRubric.policyVersion` /
 *    `ScoringPolicy.version` (`z.string().min(1)`) — immutability-via-versioning (lesson §12/§17): the
 *    result is forever bound to + explainable against the exact immutable rubric that produced it.
 *  - `providerMeta` is the shared `ProviderMeta` (lesson §5, imported never redefined) — its strict
 *    shape makes a credential-bearing field unrepresentable (rule #4). REQUIRED: every gateway-routed
 *    judge call has provenance, and replay reads the persisted outcome rather than re-judging (rule #7).
 *
 * REPLAY (rule #7): `axisScores` + `acceptance` are REQUIRED persisted fields (lesson §13), so replay
 * reconstructs the acceptance decision by READING this record and never re-invokes the judge provider.
 *
 * The schema encodes SHAPE only: the 0-5 per-axis scale and the acceptance range are runtime/scoring
 * concerns (lesson §6, like NoveltyScore.score) — applied by the P4/P5 held-out-judge LOAD path, not
 * pinned here. JudgeResult carries NO rubric / weights / immutability-flag / score-override field
 * (strict + field-set snapshot, lesson §9) — it is the judge's measurement, never scoring authority.
 */
export const JudgeResult = z.strictObject({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  axisScores: z.record(FinalJudgeAxis, z.number()),
  acceptance: z.number(),
  rubricPolicyVersion: z.string().min(1),
  providerMeta: ProviderMeta,
  langfuseTraceId: z.string().min(1).optional(),
  /**
   * FB.8 (frontend-v2, sv8→9) — the held-out judge's per-axis one-line rationale, emitted ALONGSIDE its
   * scores and keyed by the SAME closed `FinalJudgeAxis`. The WHOLE field is OPTIONAL (a judge output without
   * rationale omits it entirely → additive/backward-compatible: an sv≤8 JudgeResult still validates); WHEN
   * PRESENT it is EXHAUSTIVE like `axisScores` (all 5 axes required, an unknown axis key rejected — the
   * enum-keyed record is closed; the runner attaches it only when the model supplied all 5). EXPLANATORY
   * OUTPUT only: it explains WHY each axis scored as it did so the UI can surface the judge's reasoning
   * (FV.5b), and it NEVER feeds the acceptance metric — the runner computes `acceptance` deterministically
   * from `axisScores` × the immutable rubric weights (rule #6: the rationale EXPLAINS the floor, it cannot
   * move it; the score stays the load-bearing field).
   */
  axisRationales: z.record(FinalJudgeAxis, z.string()).optional(),
});

export type JudgeResult = z.infer<typeof JudgeResult>;
