import { describe, expect, it } from 'vitest';
import { validLlmCallTelemetry, validJudgeResult } from '@doppl/contracts';
import type { RunEventEnvelope } from '../../../src/data/contracts';
import { deriveAgenomeTelemetry, deriveJudgeRationale } from '../../../src/panels/nodeTelemetry';

/**
 * FV.5b — the PURE event-derived deep-telemetry selectors the node inspector surfaces (FB.6 raw capture +
 * FB.4 executed temperature + FB.7 tool-call detail + FB.8 judge rationale). Read-only / emit-only over the
 * persisted (scrubbed) events; a malformed/old payload is skipped, never crashes the drawer.
 */

let seq = 0;
function ev(type: string, payload: unknown, over: Record<string, unknown> = {}): RunEventEnvelope {
  return {
    id: `e${seq}`,
    runId: 'run_1',
    sequence: seq++,
    occurredAt: '2026-06-24T00:00:00.000Z',
    type,
    actor: 'selection_controller',
    schemaVersion: 9,
    payload,
    ...over,
  } as unknown as RunEventEnvelope;
}

describe('nodeTelemetry — FV.5b deep telemetry selectors', () => {
  it('test_derive_agenome_llm_telemetry_with_temperature', () => {
    const events = [
      ev('llm_call_telemetry', {
        ...validLlmCallTelemetry,
        agenomeId: 'agnX',
        rawResponse: 'the raw generation output',
        samplingParams: { temperature: 0.94 },
        truncated: false,
      }),
      // a telemetry for a DIFFERENT agenome must be excluded.
      ev('llm_call_telemetry', { ...validLlmCallTelemetry, agenomeId: 'agnOTHER' }),
    ];
    const tel = deriveAgenomeTelemetry(events, 'agnX');
    expect(tel.llmCalls).toHaveLength(1);
    expect(tel.llmCalls[0]?.role).toBe(validLlmCallTelemetry.role);
    expect(tel.llmCalls[0]?.rawResponse).toBe('the raw generation output');
    expect(tel.llmCalls[0]?.temperature).toBeCloseTo(0.94, 10);
    expect(tel.llmCalls[0]?.truncated).toBe(false);
  });

  it('test_derive_agenome_tool_calls_from_finished', () => {
    const events = [
      ev('tool_call.started', { toolName: 'web_search', query: 'q' }, { agenomeId: 'agnX' }),
      ev(
        'tool_call.finished',
        { toolName: 'web_search', query: 'umbrella designs', result: 'top patents' },
        { agenomeId: 'agnX' },
      ),
      // a finished tool call for a DIFFERENT agenome is excluded.
      ev('tool_call.finished', { toolName: 'web_search', query: 'x' }, { agenomeId: 'agnOTHER' }),
    ];
    const tel = deriveAgenomeTelemetry(events, 'agnX');
    expect(tel.toolCalls).toEqual([
      { toolName: 'web_search', query: 'umbrella designs', result: 'top patents' },
    ]);
  });

  it('test_derive_judge_rationale_latest_wins', () => {
    const events = [
      ev('judge.reviewed', {
        ...validJudgeResult,
        candidateId: 'candX',
        axisScores: { ...validJudgeResult.axisScores },
        axisRationales: {
          grounding: 'old',
          novelty: 'old',
          feasibility: 'old',
          falsification_survival: 'old',
          subtype_check_pass: 'old',
        },
      }),
      ev('judge.reviewed', {
        ...validJudgeResult,
        candidateId: 'candX',
        axisScores: { ...validJudgeResult.axisScores },
        axisRationales: {
          grounding: 'cites prior art',
          novelty: 'cross-domain',
          feasibility: 'buildable',
          falsification_survival: 'survives',
          subtype_check_pass: 'meets contract',
        },
      }),
    ];
    const r = deriveJudgeRationale(events, 'candX');
    expect(r?.axisRationales.grounding).toBe('cites prior art'); // highest-sequence wins
    expect(r?.axisScores.novelty).toBe(validJudgeResult.axisScores.novelty);
    // a candidate never judged → null.
    expect(deriveJudgeRationale(events, 'candNONE')).toBeNull();
  });

  it('test_selectors_skip_malformed_and_handle_absent_rationale', () => {
    // a malformed llm_call_telemetry is skipped (no throw); a judge result WITHOUT axisRationales → {}.
    const events = [
      ev('llm_call_telemetry', { not: 'a telemetry payload' }, { agenomeId: 'agnX' }),
      ev('judge.reviewed', {
        ...validJudgeResult,
        candidateId: 'candX',
        axisRationales: undefined,
      }),
    ];
    const tel = deriveAgenomeTelemetry(events, 'agnX');
    expect(tel.llmCalls).toEqual([]);
    const r = deriveJudgeRationale(events, 'candX');
    expect(r?.axisRationales).toEqual({});
  });
});
