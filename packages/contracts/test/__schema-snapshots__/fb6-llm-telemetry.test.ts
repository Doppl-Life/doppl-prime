// FB.6 — frontend-v2 raw reasoning/response capture contract amendment (sv6→7). spec(§4): a new
// RunEventType member `llm_call_telemetry` + the frozen `LlmCallTelemetry` payload model + the
// HIGH_TRAFFIC_PAYLOAD_MAP narrowing; CURRENT_SCHEMA_VERSION 6→7 (ADDITIVE — a schemaVersion ≤6
// envelope still validates). rule #6: the held-out judge / scoring anchor stays BYTE-IDENTICAL across
// the bump (the capture records GENERATION output, never the judge/rubric/scoring surface).
import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  FinalJudgeAxis,
  FinalJudgeRubric,
  LlmCallTelemetry,
  RunEventEnvelope,
  RunEventType,
  ScoringPolicy,
  objectFieldNames,
  resolvePayloadSchema,
  validLlmCallTelemetry,
  validRunEventEnvelope,
} from '@doppl/contracts';

const sorted = (a: readonly string[]): string[] => [...a].sort();

// The frozen field-name set of the new high-traffic Appendix-A model (cross-track regression gate).
const LLM_CALL_TELEMETRY_FIELD_SNAPSHOT = [
  'id',
  'runId',
  'generationId',
  'agenomeId',
  'role',
  'rawResponse',
  'rawReasoning',
  'providerMeta',
  'truncated',
  // frontend-v2 FB.4 (sv7→8): the executed generation sampling params (records the dial's temperature).
  'samplingParams',
];

// rule #6 — the held-out judge anchor field-sets this amendment must NOT move.
const SCORING_POLICY_FIELD_SNAPSHOT = ['version', 'weights', 'normalization'];
const FINAL_JUDGE_RUBRIC_FIELD_SNAPSHOT = ['axes', 'weights', 'policyVersion', 'immutableToAgents'];
const FINAL_JUDGE_AXIS_SNAPSHOT = [
  'grounding',
  'novelty',
  'feasibility',
  'falsification_survival',
  'subtype_check_pass',
];

describe('FB.6 — raw reasoning/response capture amendment (spec §4)', () => {
  it('test_llm_call_telemetry_event_type_member', () => {
    // spec(§4) lesson §1: the closed registry now parses `llm_call_telemetry` and still rejects unlisted.
    expect(RunEventType.parse('llm_call_telemetry')).toBe('llm_call_telemetry');
    expect(RunEventType.safeParse('llm_call_unknown').success).toBe(false);
  });

  it('test_llm_call_telemetry_payload_schema', () => {
    // spec(§4): the model parses a valid capture; `rawReasoning`/`providerMeta` optional; strict (no
    // extra/credential field representable, rule #4); the HIGH_TRAFFIC map narrows the type to the model.
    expect(LlmCallTelemetry.safeParse(validLlmCallTelemetry).success).toBe(true);
    expect(
      LlmCallTelemetry.safeParse({ ...validLlmCallTelemetry, rawReasoning: 'chain of thought' })
        .success,
    ).toBe(true);
    expect(resolvePayloadSchema('llm_call_telemetry')).toBe(LlmCallTelemetry);
    expect(
      LlmCallTelemetry.safeParse({ ...validLlmCallTelemetry, apiKey: 'sk-secret' }).success,
    ).toBe(false);
    // truncated is a REQUIRED queryable marker (a reader always knows if the capture is partial).
    const { truncated, ...noFlag } = validLlmCallTelemetry;
    void truncated;
    expect(LlmCallTelemetry.safeParse(noFlag).success).toBe(false);
  });

  it('test_current_schema_version_at_least_7_since_fb6', () => {
    // spec(§4): FB.6 introduced sv7; later additive bumps keep it ≥7 (the EXACT current pin lives in
    // field-sets.test.ts — this amendment-local test asserts FB.6's floor + that v5/6/7 envelopes still
    // validate, the additive/backward-compat guarantee that is FB.6's concern).
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(7);
    for (const v of [1, 5, 6, 7]) {
      expect(
        RunEventEnvelope.safeParse({ ...validRunEventEnvelope, schemaVersion: v }).success,
        `schemaVersion ${v}`,
      ).toBe(true);
    }
  });

  it('test_llm_call_telemetry_field_set_snapshot', () => {
    // spec(§4) spec(§2.5): the new high-traffic model's field-name set == the frozen snapshot.
    expect(objectFieldNames(LlmCallTelemetry)).toEqual(sorted(LLM_CALL_TELEMETRY_FIELD_SNAPSHOT));
    expect(LLM_CALL_TELEMETRY_FIELD_SNAPSHOT).toHaveLength(10);
  });

  it('test_immutable_rule6_surface_unchanged', () => {
    // rule #6 (the floor the organism cannot lift): a telemetry-capture amendment must leave the
    // held-out judge / scoring anchor field/member sets BYTE-IDENTICAL.
    expect(objectFieldNames(ScoringPolicy)).toEqual(sorted(SCORING_POLICY_FIELD_SNAPSHOT));
    expect(objectFieldNames(FinalJudgeRubric)).toEqual(sorted(FINAL_JUDGE_RUBRIC_FIELD_SNAPSHOT));
    expect(sorted(FinalJudgeAxis.options)).toEqual(sorted(FINAL_JUDGE_AXIS_SNAPSHOT));
    expect(() => FinalJudgeRubric.shape.immutableToAgents.parse(false)).toThrow();
  });
});
