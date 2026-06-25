// P0.12 — ModelGatewayResponse: the ONLY response surface domain code uses (ARCHITECTURE.md §6).
// spec(§6): structured outputs are validated → accepted / repaired (≤1) / rejected, with the
// outcome in `validationResult`; `accepted` ⇔ (validationResult !== 'rejected'); a `rejected`
// response carries a `rejection`. providerMeta is the SHARED P0.9 ProviderMeta (inherits its
// no-secret pin). spec(§14): no credential field.
import { describe, it, expect } from 'vitest';
import { ModelGatewayResponse, ValidationResult } from '@doppl/contracts';

const validProviderMeta = {
  provider: 'openrouter',
  modelId: 'anthropic/claude-3.5',
  gatewayRequestId: 'greq_1',
  tokensIn: 100,
  tokensOut: 50,
};

const acceptedResponse = {
  accepted: true,
  output: { idea: 'immune-inspired recommender' },
  validationResult: 'accepted',
  providerMeta: validProviderMeta,
  langfuseTraceId: 'trace_1',
};

const repairedResponse = {
  accepted: true,
  output: { idea: 'y' },
  validationResult: 'repaired',
  providerMeta: validProviderMeta,
};

const rejectedResponse = {
  accepted: false,
  validationResult: 'rejected',
  providerMeta: validProviderMeta,
  rejection: { reason: 'schema validation failed after one repair' },
};

describe('ModelGatewayResponse — the only response seam (spec §6/§14)', () => {
  it('gateway_response_strict_and_providerMeta', () => {
    // positive guard first: accepted/repaired/rejected responses all round-trip; optionals omittable.
    expect(ModelGatewayResponse.parse(acceptedResponse)).toEqual(acceptedResponse);
    expect(ModelGatewayResponse.parse(repairedResponse)).toEqual(repairedResponse);
    expect(ModelGatewayResponse.parse(rejectedResponse)).toEqual(rejectedResponse);

    // providerMeta is the shared P0.9 ProviderMeta — a malformed one (missing required field) is
    // rejected, and its no-secret pin propagates (a secret-bearing providerMeta is rejected).
    expect(() =>
      ModelGatewayResponse.parse({ ...acceptedResponse, providerMeta: { provider: 'x' } }),
    ).toThrow();
    expect(() =>
      ModelGatewayResponse.parse({
        ...acceptedResponse,
        providerMeta: { ...validProviderMeta, apiKey: 'sk-x' },
      }),
    ).toThrow();

    // strict + §14: unknown field rejected; a top-level credential field is unrepresentable.
    expect(() => ModelGatewayResponse.parse({ ...acceptedResponse, bogus: 1 })).toThrow();
    expect(() => ModelGatewayResponse.parse({ ...acceptedResponse, secret: 'x' })).toThrow();
  });

  it('gateway_validationResult_closed', () => {
    // spec(§6): validationResult is the closed 3-member outcome; any other value rejected.
    for (const r of ['accepted', 'repaired', 'rejected'] as const) {
      expect(ValidationResult.parse(r)).toBe(r);
    }
    expect(() => ValidationResult.parse('errored')).toThrow();
    expect(() => ValidationResult.parse('')).toThrow();
    // accepted ⇔ (validationResult !== 'rejected') — the two cannot disagree.
    expect(() =>
      ModelGatewayResponse.parse({ ...acceptedResponse, validationResult: 'rejected' }),
    ).toThrow(); // accepted:true but result rejected
    expect(() => ModelGatewayResponse.parse({ ...rejectedResponse, accepted: true })).toThrow(); // result rejected but accepted:true
    expect(() => ModelGatewayResponse.parse({ ...acceptedResponse, accepted: false })).toThrow(); // result accepted but accepted:false
  });

  it('gateway_rejected_requires_rejection', () => {
    // spec(§6): rejection is present IFF validationResult==='rejected' — a rejection is always
    // explained, and a non-rejected response carrying a rejection is nonsensical (mirrors P0.7).
    const noRejection: Record<string, unknown> = { ...rejectedResponse };
    delete noRejection.rejection;
    expect(() => ModelGatewayResponse.parse(noRejection)).toThrow(); // rejected w/o rejection
    expect(ModelGatewayResponse.parse(rejectedResponse).rejection).toEqual({
      reason: 'schema validation failed after one repair',
    });
    // accepted/repaired need no rejection (already round-trip above) — and MUST NOT carry one (IFF).
    expect(() =>
      ModelGatewayResponse.parse({ ...acceptedResponse, rejection: { reason: 'x' } }),
    ).toThrow();
    // rejection.reason is non-empty.
    expect(() =>
      ModelGatewayResponse.parse({ ...rejectedResponse, rejection: { reason: '' } }),
    ).toThrow();
  });

  it('gateway_response_tool_call_surface_sv10', () => {
    // sv9→10 — when the provider returns finish_reason==='tool_calls', the response surfaces the model's
    // requested calls (the orchestrator executes them, then re-asks). It is NOT a final answer: accepted/
    // 'accepted' with NO output but `toolCallRequests` set is valid (the refine: accepted ⇔ !rejected).
    const toolCallResponse = {
      accepted: true,
      validationResult: 'accepted',
      providerMeta: validProviderMeta,
      toolCallRequests: [
        { id: 'call_1', name: 'web_search', arguments: '{"q":"battery chemistry 2026"}' },
      ],
    };
    expect(ModelGatewayResponse.parse(toolCallResponse)).toEqual(toolCallResponse);
    // it is additive/optional — the existing accepted/rejected responses (no toolCallRequests) still parse.
    expect(ModelGatewayResponse.parse(acceptedResponse)).toEqual(acceptedResponse);
    // an unlisted tool in a surfaced call is rejected (the closed ToolName allowlist, rule #3).
    expect(
      ModelGatewayResponse.safeParse({
        ...toolCallResponse,
        toolCallRequests: [{ id: 'c1', name: 'exec_shell', arguments: '{}' }],
      }).success,
    ).toBe(false);
  });
});
