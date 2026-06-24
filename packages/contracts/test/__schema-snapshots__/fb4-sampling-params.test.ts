// FB.4 — frontend-v2 diverge/converge dial: the samplingParams contract amendment (sv7→8). spec(§4)
// spec(§6): ModelGatewayRequest + LlmCallTelemetry each gain an OPTIONAL samplingParams{temperature?}
// (the executed generation sampling, recorded for replay); CURRENT_SCHEMA_VERSION 6→7→8 (ADDITIVE — an
// sv≤7 envelope still validates). rule #6: the held-out judge / scoring anchor stays BYTE-IDENTICAL across
// the dial amendment (the dial reaches GENERATION sampling only — proved structurally in the runtime tests).
import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  FinalJudgeAxis,
  FinalJudgeRubric,
  LlmCallTelemetry,
  ModelGatewayRequest,
  RunEventEnvelope,
  ScoringPolicy,
  objectFieldNames,
  validLlmCallTelemetry,
  validModelGatewayRequest,
  validRunEventEnvelope,
} from '@doppl/contracts';

const sorted = (a: readonly string[]): string[] => [...a].sort();

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

describe('FB.4 — samplingParams amendment (sv7→8) (spec §4 / §6)', () => {
  it('test_samplingparams_additive_sv8', () => {
    // additive/optional on BOTH the request and the telemetry — each parses WITH and WITHOUT samplingParams.
    expect(ModelGatewayRequest.safeParse(validModelGatewayRequest).success).toBe(true);
    expect(
      ModelGatewayRequest.safeParse({
        ...validModelGatewayRequest,
        samplingParams: { temperature: 0.9 },
      }).success,
    ).toBe(true);
    expect(LlmCallTelemetry.safeParse(validLlmCallTelemetry).success).toBe(true);
    expect(
      LlmCallTelemetry.safeParse({ ...validLlmCallTelemetry, samplingParams: { temperature: 0.4 } })
        .success,
    ).toBe(true);
    // strict inner shape — no credential/url field representable (rule #4); an unknown sampling key rejects.
    expect(
      ModelGatewayRequest.safeParse({
        ...validModelGatewayRequest,
        samplingParams: { temperature: 0.9, apiKey: 'sk-secret' },
      }).success,
    ).toBe(false);
  });

  it('test_current_schema_version_at_least_8_since_fb4', () => {
    // spec(§4): the FB.4 dial amendment landed AT OR ABOVE sv8 (the current-pin lives in the canonical
    // spots + the latest amendment's test — fb0/fb6 precedent); old envelopes (incl. v8) still validate.
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(8);
    for (const v of [1, 6, 7, 8]) {
      expect(
        RunEventEnvelope.safeParse({ ...validRunEventEnvelope, schemaVersion: v }).success,
        `schemaVersion ${v}`,
      ).toBe(true);
    }
  });

  it('test_rule6_surface_byte_identical', () => {
    // rule #6: the dial amendment leaves the held-out judge / scoring anchor field/member sets unchanged.
    expect(objectFieldNames(ScoringPolicy)).toEqual(sorted(SCORING_POLICY_FIELD_SNAPSHOT));
    expect(objectFieldNames(FinalJudgeRubric)).toEqual(sorted(FINAL_JUDGE_RUBRIC_FIELD_SNAPSHOT));
    expect(sorted(FinalJudgeAxis.options)).toEqual(sorted(FINAL_JUDGE_AXIS_SNAPSHOT));
    expect(() => FinalJudgeRubric.shape.immutableToAgents.parse(false)).toThrow();
  });
});
