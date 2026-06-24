import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type {
  ModelGatewayRequest,
  ModelRole,
  ModelRoute,
  ProviderCapability,
} from '@doppl/contracts';
import {
  createLiveGateway,
  selectGateway,
  type ModelRegistry,
  type OpenRouterClient,
  type OpenRouterCompletionParams,
  type OpenRouterRawCompletion,
} from '../../../src/model-gateway';
import type {
  OllamaClient,
  OllamaCompletionParams,
  OllamaRawCompletion,
} from '../../../src/model-gateway/adapters/ollama.adapter';

/**
 * FB.1 — `createLiveGateway` becomes PROVIDER-DISPATCHING (ARCHITECTURE.md §6, rules #9/#7). The
 * injected providerCall resolves `route.provider` per request and dispatches to the matching adapter
 * (openrouter → the P2.5 adapter, ollama → the FB.1 adapter). The dispatch map IS the runtime provider
 * allowlist: a genuinely-unknown provider → an honest `ProviderCallError` (mapped to a rejected response
 * by the gateway shell — never a silent fallback). The NON-generation roles (embedding=openai,
 * retrieval=web-search) keep their pre-FB.1 OpenRouter-call path EXACTLY (their real adapters are not
 * yet composed live — pre-existing gap, Future TODO). All clients are faked — no network.
 */

const STRUCTURED: ProviderCapability = { structuredOutputs: true, embeddings: false };

// A mixed-provider test registry: each role pinned to a distinct provider so dispatch is observable.
const ROUTES: Partial<Record<ModelRole, ModelRoute>> = {
  critic: {
    role: 'critic',
    provider: 'openrouter',
    modelId: 'or-model',
    capability: STRUCTURED,
    fallbackRouteIds: [],
  },
  population_generator: {
    role: 'population_generator',
    provider: 'ollama',
    modelId: 'llama3.1',
    capability: STRUCTURED,
    fallbackRouteIds: [],
  },
  embedding: {
    role: 'embedding',
    provider: 'openai',
    modelId: 'text-embedding-3-small',
    capability: { structuredOutputs: false, embeddings: true },
    fallbackRouteIds: [],
  },
  retrieval: {
    role: 'retrieval',
    provider: 'web-search',
    modelId: 'web-search-default',
    capability: { structuredOutputs: false, embeddings: false },
    fallbackRouteIds: [],
  },
  fusion_synthesis: {
    role: 'fusion_synthesis',
    provider: 'anthropic', // a provider NO adapter serves → the allowlist must honest-reject it
    modelId: 'claude-x',
    capability: STRUCTURED,
    fallbackRouteIds: [],
  },
};

const REGISTRY: ModelRegistry = {
  resolve(role) {
    const route = ROUTES[role];
    if (!route) throw new Error(`no route for ${role}`);
    return route;
  },
  capabilityFor(role) {
    return ROUTES[role]!.capability;
  },
};

function orClient(opts: { spy?: (p: OpenRouterCompletionParams) => void } = {}): OpenRouterClient {
  return {
    complete(params): Promise<OpenRouterRawCompletion> {
      opts.spy?.(params);
      return Promise.resolve({
        id: 'or-1',
        model: params.model,
        output: { from: 'openrouter' },
        tokensIn: 3,
        tokensOut: 2,
      });
    },
  };
}

function ollamaClient(
  opts: { spy?: (p: OllamaCompletionParams) => void; output?: unknown } = {},
): OllamaClient {
  return {
    complete(params): Promise<OllamaRawCompletion> {
      opts.spy?.(params);
      return Promise.resolve({
        id: 'ol-1',
        model: params.model,
        output: opts.output ?? { from: 'ollama' },
        tokensIn: 4,
        tokensOut: 3,
      });
    },
  };
}

describe('createLiveGateway — provider dispatch (spec §6, rules #9/#7)', () => {
  test('test_live_gateway_dispatches_by_provider', async () => {
    // spec(§6): a request is served by the adapter matching its resolved route.provider; the dispatch
    // map is the runtime allowlist (an unknown provider → honest reject, no silent fallback). Non-
    // generation roles (openai/web-search) keep their pre-FB.1 OpenRouter-call path.
    const orCalls: OpenRouterCompletionParams[] = [];
    const ollamaCalls: OllamaCompletionParams[] = [];
    const gateway = createLiveGateway({
      registry: REGISTRY,
      client: orClient({ spy: (p) => orCalls.push(p) }),
      ollamaClient: ollamaClient({ spy: (p) => ollamaCalls.push(p) }),
      maxRetries: 0,
      retry: { sleep: () => Promise.resolve() },
    });
    const ask = (role: ModelRole): Promise<unknown> =>
      gateway.call({ role, prompt: 'go' } as ModelGatewayRequest);

    const orRes = await ask('critic');
    expect((orRes as { providerMeta: { provider: string } }).providerMeta.provider).toBe(
      'openrouter',
    );

    const ollamaRes = await ask('population_generator');
    expect((ollamaRes as { providerMeta: { provider: string } }).providerMeta.provider).toBe(
      'ollama',
    );

    // only the ollama client served the ollama route; only the openrouter client served the openrouter route.
    expect(ollamaCalls.map((c) => c.model)).toEqual(['llama3.1']);
    expect(orCalls.map((c) => c.model)).toEqual(['or-model']);

    // non-generation roles ride the legacy OpenRouter path (NOT rejected — pre-FB.1 behavior preserved).
    const embRes = (await ask('embedding')) as {
      accepted: boolean;
      providerMeta: { provider: string };
    };
    expect(embRes.accepted).toBe(true);
    expect(embRes.providerMeta.provider).toBe('openai'); // adapter stamps route.provider; served via orCall
    const retRes = (await ask('retrieval')) as { accepted: boolean };
    expect(retRes.accepted).toBe(true);
    expect(orCalls.map((c) => c.model)).toEqual([
      'or-model',
      'text-embedding-3-small',
      'web-search-default',
    ]);

    // a genuinely-unknown provider → honest reject (mapped from ProviderCallError), 0-token providerMeta.
    const unknownRes = (await ask('fusion_synthesis')) as {
      accepted: boolean;
      validationResult: string;
      providerMeta: { provider: string; tokensIn: number; tokensOut: number };
    };
    expect(unknownRes.accepted).toBe(false);
    expect(unknownRes.validationResult).toBe('rejected');
    expect(unknownRes.providerMeta.provider).toBe('anthropic');
    expect(unknownRes.providerMeta.tokensIn).toBe(0);
    expect(unknownRes.providerMeta.tokensOut).toBe(0);
  });

  test('test_live_gateway_ollama_route_through_validate_repair_reject', async () => {
    // spec(§6) rule #5: an ollama-routed STRUCTURED request flows through createGateway's discipline —
    // a malformed raw output (initial + the ≤1 repair both invalid) is REJECTED, never accepted
    // unvalidated. The gateway shell stays the authoritative validator (UNWEAKENED by the new adapter).
    const schema = z.strictObject({ ok: z.boolean() });
    const gateway = createLiveGateway({
      registry: REGISTRY,
      client: orClient(),
      ollamaClient: ollamaClient({ output: { ok: 'not-a-boolean' } }), // always malformed
      maxRetries: 0,
      retry: { sleep: () => Promise.resolve() },
    });
    const res = await gateway.call({ role: 'population_generator', prompt: 'go', schema });
    expect(res.accepted).toBe(false);
    expect(res.validationResult).toBe('rejected');
    expect(res.providerMeta.provider).toBe('ollama');
  });

  test('test_recorded_gateway_unaffected_by_ollama', async () => {
    // rule #7: the recorded/replay path constructs NO provider client (ollama included). selectGateway's
    // stub branch returns a working gateway with no liveDeps — proving replay calls no provider. The
    // live branch still HONEST-throws without liveDeps (no silent fallback) — unchanged by FB.1.
    const recorded = selectGateway({ useStub: true });
    const res = await recorded.call({ role: 'critic', prompt: 'x' });
    expect(res.accepted).toBe(true); // served from the deterministic fixture, no provider call
    expect(() => selectGateway({ useStub: false })).toThrow(/liveDeps/);
  });
});
