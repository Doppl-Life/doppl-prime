import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ModelGatewayResponse, validProviderCapability, validProviderMeta } from '@doppl/contracts';
import { createGateway } from '../../../src/model-gateway/gateway';
import type { ProviderResult } from '../../../src/model-gateway/structured-output';
import type { ModelGateway, ModelGatewayRequest } from '../../../src/model-gateway';

/**
 * P2.4 gateway shell — composes the ModelGateway port (P2.1) with the structured-output discipline
 * around an injected provider-call fn. Proves the discipline is reachable + testable now; the registry
 * (P2.2) and real OpenRouter adapter (P2.5) inject the real provider-call later.
 */

const schema = z.object({ answer: z.string() });

function makeProviderCall(result: ProviderResult) {
  return vi.fn((request: ModelGatewayRequest): Promise<ProviderResult> => {
    void request;
    return Promise.resolve(result);
  });
}

describe('createGateway — shell composing port + discipline', () => {
  test('test_gateway_call_runs_discipline_accepted', async () => {
    const providerCall = makeProviderCall({
      output: { answer: 'ok' },
      providerMeta: validProviderMeta,
    });
    const gateway: ModelGateway = createGateway({
      providerCall,
      capabilityFor: () => validProviderCapability,
      resolveSchema: () => schema,
    });
    const res = await gateway.call({ role: 'critic', prompt: 'q' });
    expect(res.validationResult).toBe('accepted');
    expect(ModelGatewayResponse.safeParse(res).success).toBe(true);
    expect(providerCall).toHaveBeenCalledTimes(1); // no repair on a valid output
  });

  test('test_gateway_call_delegates_repair', async () => {
    const providerCall = makeProviderCall({
      output: { answer: 'default' },
      providerMeta: validProviderMeta,
    });
    providerCall.mockResolvedValueOnce({ output: { wrong: 1 }, providerMeta: validProviderMeta }); // initial invalid
    providerCall.mockResolvedValueOnce({
      output: { answer: 'fixed' },
      providerMeta: validProviderMeta,
    }); // repair valid
    const gateway = createGateway({
      providerCall,
      capabilityFor: () => validProviderCapability,
      resolveSchema: () => schema,
    });
    const res = await gateway.call({ role: 'critic', prompt: 'q' });
    expect(res.validationResult).toBe('repaired');
    expect(providerCall).toHaveBeenCalledTimes(2); // initial + exactly one repair
  });

  test('test_gateway_capability_passthrough', () => {
    const gateway = createGateway({
      providerCall: makeProviderCall({ output: { answer: 'ok' }, providerMeta: validProviderMeta }),
      capabilityFor: () => validProviderCapability,
      resolveSchema: () => schema,
    });
    expect(gateway.capabilityFor('embedding')).toBe(validProviderCapability);
  });

  test('test_tool_call_response_short_circuits_discipline', async () => {
    // sv10 (TU.4) — when the provider returns tool-call requests, createGateway surfaces them WITHOUT
    // running the structured-output discipline (there is no final answer to validate yet). The
    // orchestrator executes the tools then re-asks. A schema IS set — it must NOT trigger a repair.
    const providerCall = makeProviderCall({
      output: undefined, // a tool-call turn has no final answer (the provider's message content is null)
      providerMeta: validProviderMeta,
      toolCallRequests: [{ id: 'call_1', name: 'web_search', arguments: '{"query":"x"}' }],
    });
    const gateway = createGateway({
      providerCall,
      capabilityFor: () => validProviderCapability,
      resolveSchema: () => schema,
    });
    const res = await gateway.call({ role: 'population_generator', prompt: 'q' });
    expect(res.accepted).toBe(true);
    expect(res.validationResult).toBe('accepted');
    expect(res.toolCallRequests).toEqual([
      { id: 'call_1', name: 'web_search', arguments: '{"query":"x"}' },
    ]);
    expect(res.output).toBeUndefined();
    expect(ModelGatewayResponse.safeParse(res).success).toBe(true);
    expect(providerCall).toHaveBeenCalledTimes(1); // no discipline, no repair
  });

  test('test_no_tool_calls_runs_discipline_unchanged', async () => {
    // rule #6 — a response with NO toolCallRequests (every critic/judge call) flows the discipline exactly
    // as pre-sv10 (byte-identical): a valid output is accepted on a single provider call.
    const providerCall = makeProviderCall({
      output: { answer: 'ok' },
      providerMeta: validProviderMeta,
    });
    const gateway = createGateway({
      providerCall,
      capabilityFor: () => validProviderCapability,
      resolveSchema: () => schema,
    });
    const res = await gateway.call({ role: 'critic', prompt: 'q' });
    expect(res.validationResult).toBe('accepted');
    expect(res.toolCallRequests).toBeUndefined();
    expect(providerCall).toHaveBeenCalledTimes(1);
  });
});
