import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  createModelRegistry,
  selectGateway,
  type ModelRegistry,
  type OpenRouterClient,
  type OpenRouterRawCompletion,
} from '../../../src/model-gateway';
import { DEFAULT_MODEL_REGISTRY } from '../../../src/config/model-registry.config';

/**
 * PD.9 — selectGateway is a thin recorded-vs-live multiplexer (spec §6/§17). `useStub:true` → the
 * recorded fake (unchanged); `useStub:false` + liveDeps → createLiveGateway; `useStub:false` with NO
 * liveDeps → an honest throw (never a silent fallback to the fake that would mask a misconfig).
 */

const REGISTRY: ModelRegistry = createModelRegistry(DEFAULT_MODEL_REGISTRY);
const OK_SCHEMA = z.strictObject({ ok: z.boolean() });

function spyClient(onCall: () => void): OpenRouterClient {
  return {
    complete(params): Promise<OpenRouterRawCompletion> {
      onCall();
      return Promise.resolve({ id: 'i', model: params.model, output: { ok: true }, tokensIn: 1, tokensOut: 1 });
    },
  };
}

describe('selectGateway — recorded-vs-live multiplexer (spec §6/§17)', () => {
  // recorded default UNCHANGED: useStub:true → the deterministic recorded fake (drives any role with no
  // live deps / no client).
  test('select_use_stub_returns_recorded_fake', async () => {
    const gateway = selectGateway({ useStub: true });
    const res = await gateway.call({ role: 'critic', prompt: 'x' });
    expect(res.accepted).toBe(true); // the recorded fake satisfies the discipline with canned fixtures
  });

  // the live path is now WIRED: useStub:false + liveDeps → a gateway that calls the injected client.
  test('select_live_with_deps_delegates_to_live', async () => {
    let called = false;
    const gateway = selectGateway(
      { useStub: false },
      { registry: REGISTRY, client: spyClient(() => (called = true)) },
    );
    const res = await gateway.call({ role: 'critic', prompt: 'x', schema: OK_SCHEMA });
    expect(called).toBe(true); // delegated to createLiveGateway → the injected client was driven
    expect(res.accepted).toBe(true);
  });

  // honest-throw posture: useStub:false with NO liveDeps → throws, naming the missing live deps; never
  // silently returns a fake (which would mask a live misconfiguration as a passing recorded run).
  test('select_live_without_deps_throws_honest', () => {
    expect(() => selectGateway({ useStub: false })).toThrow(/live|deps|registry|client/i);
  });
});
