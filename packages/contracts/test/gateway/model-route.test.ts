// P0.11 — ModelRoute: a role→provider routing entry (ARCHITECTURE.md §6). spec(§6): the schema does
// NOT force a single provider (embeddings pin direct-OpenAI while others route via OpenRouter — both
// must validate); fallbackRouteIds MAY be empty (multi-hop fallback added later). Strict.
import { describe, it, expect } from 'vitest';
import { ModelRoute } from '@doppl/contracts';

const validRoute = {
  role: 'critic',
  provider: 'openrouter',
  modelId: 'anthropic/claude-3.5',
  capability: { structuredOutputs: true, embeddings: false },
  fallbackRouteIds: ['route_fallback_1'],
};

const REQUIRED_KEYS = ['role', 'provider', 'modelId', 'capability', 'fallbackRouteIds'] as const;

describe('ModelRoute — role→provider routing (spec §6)', () => {
  it('model_route_strict_and_multiprovider', () => {
    // positive guard first (lesson §10): full route round-trips; fallbackRouteIds:[] ok.
    expect(ModelRoute.parse(validRoute)).toEqual(validRoute);
    expect(ModelRoute.parse({ ...validRoute, fallbackRouteIds: [] }).fallbackRouteIds).toEqual([]);
    // §6: no single-provider forcing — an embedding route on OpenAI AND a critic route on OpenRouter
    // both parse (the schema does not pin a provider).
    const embeddingRoute = {
      role: 'embedding',
      provider: 'openai',
      modelId: 'text-embedding-3-small',
      capability: { structuredOutputs: false, embeddings: true },
      fallbackRouteIds: [],
    };
    expect(ModelRoute.parse(embeddingRoute)).toEqual(embeddingRoute);
    expect(ModelRoute.parse(validRoute).provider).toBe('openrouter');
    // strict + closed sub-types: unknown rejected; bad role + malformed capability rejected.
    expect(() => ModelRoute.parse({ ...validRoute, bogus: 1 })).toThrow();
    expect(() => ModelRoute.parse({ ...validRoute, role: 'judge' })).toThrow();
    expect(() =>
      ModelRoute.parse({ ...validRoute, capability: { structuredOutputs: true } }),
    ).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validRoute };
      delete clone[k];
      expect(() => ModelRoute.parse(clone), `missing ${k}`).toThrow();
    }
    expect(REQUIRED_KEYS).toHaveLength(5);
  });
});
