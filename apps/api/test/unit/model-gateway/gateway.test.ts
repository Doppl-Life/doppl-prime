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
});
