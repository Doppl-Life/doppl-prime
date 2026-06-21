// P0.16 (judge-output amendment) — JudgeResult: the held-out judge's persisted ACCEPTANCE OUTPUT.
// spec(§7): the held-out final_judge applies the fixed 5-axis 0-5 rubric and produces the acceptance
// metric that decides "gen N+1 beats gen N"; its output is schema-validated (rule #5) and persisted
// with its rubric policyVersion + provider/trace provenance (P4.8). spec(§8): selection consumes the
// acceptance score from this persisted record, never recomputing it (P5.5). spec(§4): `judge.reviewed`
// narrows to JudgeResult (mirrors novelty.scored ← NoveltyScore). The §2.5 verifier→selection seam.
import { describe, it, expect } from 'vitest';
import {
  JudgeResult,
  FinalJudgeAxis,
  ProviderMeta,
  RunEventEnvelope,
  resolvePayloadSchema,
  validJudgeResult,
  validJudgeReviewedEnvelope,
} from '@doppl/contracts';

const FIVE_AXES = [
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
] as const;

describe('JudgeResult — held-out judge acceptance output (spec §7 / §8)', () => {
  it('accepts the canonical valid judge result', () => {
    // positive-guard-first (lesson §10) — the canonical fixture round-trips, so the all-negative
    // assertions below fail loudly if the export ever vanishes (undefined.parse would also throw).
    expect(JudgeResult.parse(validJudgeResult)).toEqual(validJudgeResult);
  });

  it('is a strict object — rejects an unknown field', () => {
    // spec(§7) lesson §9: strict closed schema — no extra field rides along onto the authoritative log.
    expect(JudgeResult.safeParse({ ...validJudgeResult, extra: 'x' }).success).toBe(false);
  });

  it('requires id, candidateId, acceptance, rubricPolicyVersion, providerMeta, axisScores', () => {
    // spec(§7) rule #5/#7: the load-bearing fields are REQUIRED so a malformed judge output is rejected
    // at the persist boundary and replay reads a complete record (lesson §13). langfuseTraceId is the
    // only optional field (non-authoritative side channel) and is asserted separately below.
    for (const key of [
      'id',
      'candidateId',
      'acceptance',
      'rubricPolicyVersion',
      'providerMeta',
      'axisScores',
    ] as const) {
      const clone: Record<string, unknown> = { ...validJudgeResult };
      delete clone[key];
      expect(JudgeResult.safeParse(clone).success, `missing ${key}`).toBe(false);
    }
    // id / candidateId / rubricPolicyVersion are non-empty strings.
    for (const key of ['id', 'candidateId', 'rubricPolicyVersion'] as const) {
      expect(
        JudgeResult.safeParse({ ...validJudgeResult, [key]: '' }).success,
        `empty ${key}`,
      ).toBe(false);
    }
  });

  it('axisScores requires ALL five closed FinalJudgeAxis keys (completeness)', () => {
    // spec(§7) rule #6/#5: the judge applies the FULL 5-axis rubric — an output missing an axis is
    // malformed and rejected. axisScores derives its key-set from the single-source FinalJudgeAxis
    // (lesson §5); Zod's enum-keyed record is exhaustive, so dropping any axis fails CLOSED.
    expect(FinalJudgeAxis.options).toHaveLength(5);
    for (const axis of FIVE_AXES) {
      const partial: Record<string, number> = { ...validJudgeResult.axisScores };
      delete partial[axis];
      expect(
        JudgeResult.safeParse({ ...validJudgeResult, axisScores: partial }).success,
        `missing axis ${axis}`,
      ).toBe(false);
    }
  });

  it('axisScores rejects an unknown axis key (rule #6 — agent cannot add a judging axis)', () => {
    // spec(§7) rule #6 (anti-reward-hacking): the judging axis set is CLOSED — a judge output carrying
    // an invented axis is rejected, so no agent can smuggle a new axis into the persisted result.
    expect(
      JudgeResult.safeParse({
        ...validJudgeResult,
        axisScores: { ...validJudgeResult.axisScores, vibes: 5 },
      }).success,
    ).toBe(false);
  });

  it('axisScores values must be numbers', () => {
    // spec(§7): each per-axis score is a number (the 0-5 RANGE is a runtime/scoring concern, lesson §6
    // — not pinned here, mirroring NoveltyScore.score; this asserts the type only).
    expect(
      JudgeResult.safeParse({
        ...validJudgeResult,
        axisScores: { ...validJudgeResult.axisScores, grounding: 'high' },
      }).success,
    ).toBe(false);
  });

  it('rubricPolicyVersion ties the result to its exact rubric version (immutability-via-versioning)', () => {
    // spec(§7) rule #6 lesson §12/§17: rubricPolicyVersion is REQUIRED and typed identically to
    // FinalJudgeRubric.policyVersion / ScoringPolicy.version (z.string().min(1)) — so a judge result
    // is forever bound to + explainable against the exact immutable rubric that produced it.
    expect(typeof validJudgeResult.rubricPolicyVersion).toBe('string');
    expect(JudgeResult.safeParse({ ...validJudgeResult, rubricPolicyVersion: 42 }).success).toBe(
      false,
    );
  });

  it('providerMeta reuses the shared ProviderMeta shape and carries no secret (rule #4)', () => {
    // spec(§6) lesson §5: providerMeta is the shared ProviderMeta (defined once, imported) — its strict
    // shape makes a credential-bearing field unrepresentable (rule #4, secrets never leave the server).
    expect(ProviderMeta.parse(validJudgeResult.providerMeta)).toEqual(
      validJudgeResult.providerMeta,
    );
    expect(
      JudgeResult.safeParse({
        ...validJudgeResult,
        providerMeta: { ...validJudgeResult.providerMeta, apiKey: 'sk-secret' },
      }).success,
    ).toBe(false);
  });

  it('langfuseTraceId is optional but non-empty when present', () => {
    // spec(§6): trace provenance is a non-authoritative side channel — optional; an empty string is
    // still rejected (a present pointer must be a real one).
    const withoutTrace: Record<string, unknown> = { ...validJudgeResult };
    delete withoutTrace.langfuseTraceId;
    expect(JudgeResult.safeParse(withoutTrace).success).toBe(true);
    expect(JudgeResult.safeParse({ ...validJudgeResult, langfuseTraceId: '' }).success).toBe(false);
  });

  it('represents no scoring-authority field (rule #6 — anti-reward-hacking)', () => {
    // spec(§7) rule #6 lesson §9: JudgeResult is the judge's evidence/measurement — it can never carry
    // the rubric, its weights, the immutability flag, or a score-override. strict makes them
    // unrepresentable, so a tampered judge output cannot move the bedrock anchor through this seam.
    for (const authorityField of ['rubric', 'weights', 'immutableToAgents', 'scoreOverride']) {
      expect(
        JudgeResult.safeParse({ ...validJudgeResult, [authorityField]: 1 }).success,
        authorityField,
      ).toBe(false);
    }
  });

  it('judge.reviewed narrows to JudgeResult and round-trips a valid envelope (spec §4)', () => {
    // spec(§4): the per-type payload map narrows judge.reviewed → JudgeResult (mirrors
    // novelty.scored ← NoveltyScore), so the SAME schema validates the event-store write and the model.
    expect(resolvePayloadSchema('judge.reviewed')).toBe(JudgeResult);
    expect(resolvePayloadSchema('judge.reviewed').parse(validJudgeResult)).toEqual(
      validJudgeResult,
    );
    // a canonical judge.reviewed envelope validates, and its payload narrows to JudgeResult.
    expect(RunEventEnvelope.parse(validJudgeReviewedEnvelope)).toEqual(validJudgeReviewedEnvelope);
    expect(validJudgeReviewedEnvelope.type).toBe('judge.reviewed');
    expect(
      resolvePayloadSchema(validJudgeReviewedEnvelope.type).parse(
        validJudgeReviewedEnvelope.payload,
      ),
    ).toEqual(validJudgeResult);
  });
});
