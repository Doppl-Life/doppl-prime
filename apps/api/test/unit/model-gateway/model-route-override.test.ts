import { describe, expect, test } from 'vitest';
import type {
  ModelRole,
  ModelRoute,
  ModelRouteOverride,
  ProviderCapability,
} from '@doppl/contracts';
import {
  createLiveGateway,
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
import {
  applyRouteOverride,
  createRegistryOverlay,
  modelRouteOverrideViolation,
  type ModelRouteOverrideAllowlist,
} from '../../../src/model-gateway/model-route-override';
import { MODEL_ROUTE_OVERRIDE_ALLOWLIST } from '../../../src/config/model-route-allowlist.config';

/**
 * FB.2 — per-run modelRouteOverride clamped to a FROZEN per-role allowlist (ARCHITECTURE.md §5/§6, KEY
 * SAFETY RULES #1 + #6 + #4 + #7). The override is a clamp-as-hint (rule #1, like caps): only an
 * allowlist-permitted {provider, modelId} may replace a role's route; `final_judge` is EXCLUDED (rule
 * #6 — the held-out judge model is not run-swappable); the entry carries no credential (rule #4). The
 * honored override is applied via a per-run registry overlay → FB.1's provider-dispatch routes it.
 */

const STRUCTURED: ProviderCapability = { structuredOutputs: true, embeddings: false };

const ALLOWLIST: ModelRouteOverrideAllowlist = {
  population_generator: [
    { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
    { provider: 'ollama', modelId: 'llama3.1' },
  ],
  fusion_synthesis: [{ provider: 'ollama', modelId: 'llama3.1' }],
  // final_judge intentionally ABSENT (rule #6); critic/subtype_check/embedding/retrieval absent (MVP).
};

const BASE_ROUTES: Partial<Record<ModelRole, ModelRoute>> = {
  population_generator: {
    role: 'population_generator',
    provider: 'openrouter',
    modelId: 'openai/gpt-4o-mini',
    capability: STRUCTURED,
    fallbackRouteIds: ['fusion_synthesis'],
  },
  fusion_synthesis: {
    role: 'fusion_synthesis',
    provider: 'openrouter',
    modelId: 'openai/gpt-4o',
    capability: STRUCTURED,
    fallbackRouteIds: [],
  },
  final_judge: {
    role: 'final_judge',
    provider: 'openrouter',
    modelId: 'openai/gpt-4o',
    capability: STRUCTURED,
    fallbackRouteIds: [],
  },
};

const baseRegistry: ModelRegistry = {
  resolve(role) {
    const r = BASE_ROUTES[role];
    if (!r) throw new Error(`no base route for ${role}`);
    return r;
  },
  capabilityFor(role) {
    return BASE_ROUTES[role]!.capability;
  },
};

describe('FB.2 — modelRouteOverrideViolation (rule #1 clamp, rule #6 judge-exclusion, rule #4 no-credential)', () => {
  test('test_override_violation_detects_unpermitted_model', () => {
    // rule #1: an override whose {provider,modelId} is not in that role's allowlist is a violation
    // (named); a fully-permitted override returns null. Mirrors overCapField.
    expect(
      modelRouteOverrideViolation(
        { population_generator: { provider: 'ollama', modelId: 'llama3.1' } },
        ALLOWLIST,
      ),
    ).toBeNull();
    const v = modelRouteOverrideViolation(
      { population_generator: { provider: 'ollama', modelId: 'NOT-ALLOWED' } },
      ALLOWLIST,
    );
    expect(v).not.toBeNull();
    expect(v).toMatchObject({
      role: 'population_generator',
      provider: 'ollama',
      modelId: 'NOT-ALLOWED',
    });
  });

  test('test_override_violation_rejects_final_judge', () => {
    // rule #6: ANY override targeting final_judge is a violation — the held-out judge model is not
    // run-swappable (its allowlist entry is absent). The bedrock fitness anchor cannot be moved here.
    const v = modelRouteOverrideViolation(
      { final_judge: { provider: 'ollama', modelId: 'llama3.1' } },
      ALLOWLIST,
    );
    expect(v).not.toBeNull();
    expect(v?.role).toBe('final_judge');
    // even the judge's OWN boot model is not an allowed override (the role is simply not overridable).
    expect(
      modelRouteOverrideViolation(
        { final_judge: { provider: 'openrouter', modelId: 'openai/gpt-4o' } },
        ALLOWLIST,
      ),
    ).not.toBeNull();
  });

  test('test_override_carries_no_credential', () => {
    // rule #4: the override entry shape is {provider, modelId} only (FB.0 strict) — a credential field
    // is structurally absent from the value the helper inspects (and from the allowlist entries).
    const entry = ALLOWLIST.population_generator![0]!;
    expect(Object.keys(entry).sort()).toEqual(['modelId', 'provider']);
    // the live frozen allowlist also carries no credential-shaped key on any entry.
    for (const entries of Object.values(MODEL_ROUTE_OVERRIDE_ALLOWLIST)) {
      for (const e of entries ?? []) {
        expect(Object.keys(e).sort()).toEqual(['modelId', 'provider']);
      }
    }
  });

  test('test_frozen_allowlist_excludes_final_judge', () => {
    // rule #6 pin on the SHIPPED config: final_judge is not a key in the frozen boot allowlist.
    expect('final_judge' in MODEL_ROUTE_OVERRIDE_ALLOWLIST).toBe(false);
  });
});

describe('FB.2 — applyRouteOverride + registry overlay (honor; capability inherited)', () => {
  test('test_apply_override_replaces_provider_model_inherits_capability', () => {
    // the override narrows provider/model only — capability + fallbackRouteIds are INHERITED from the
    // base route (it never fabricates a capability the base route didn't have).
    const overridden = applyRouteOverride(BASE_ROUTES.population_generator!, {
      provider: 'ollama',
      modelId: 'llama3.1',
    });
    expect(overridden).toEqual({
      role: 'population_generator',
      provider: 'ollama',
      modelId: 'llama3.1',
      capability: STRUCTURED,
      fallbackRouteIds: ['fusion_synthesis'],
    });
  });

  test('test_registry_overlay_applies_permitted_ignores_unpermitted', () => {
    // rule #1 (kernel-bound, defense-in-depth): the overlay applies an ALLOWLIST-PERMITTED entry and
    // IGNORES a non-permitted entry (a direct-append bypass of the route 422 can never widen — falls
    // back to the base route). Deterministic: rebuilding the overlay yields the identical effective
    // route (replay re-applies the persisted override identically — rule #7).
    const override: ModelRouteOverride = {
      population_generator: { provider: 'ollama', modelId: 'llama3.1' }, // permitted
      fusion_synthesis: { provider: 'ollama', modelId: 'NOT-ALLOWED' }, // NOT permitted → ignored
    };
    const overlay = createRegistryOverlay(baseRegistry, override, ALLOWLIST);
    expect(overlay.resolve('population_generator')).toMatchObject({
      provider: 'ollama',
      modelId: 'llama3.1',
    });
    expect(overlay.resolve('fusion_synthesis')).toMatchObject({
      provider: 'openrouter',
      modelId: 'openai/gpt-4o',
    });
    // capabilityFor delegates to the base.
    expect(overlay.capabilityFor('population_generator')).toEqual(STRUCTURED);
    // determinism — a second overlay over the same inputs resolves identically (replay-faithful).
    const overlay2 = createRegistryOverlay(baseRegistry, override, ALLOWLIST);
    expect(overlay2.resolve('population_generator')).toEqual(
      overlay.resolve('population_generator'),
    );
  });

  test('test_honored_override_routes_to_overridden_provider', () => {
    // Step-7.5 reachability of the HONOR: a permitted population_generator → ollama override, applied as
    // a registry overlay, makes FB.1's provider-dispatch route that role to the OLLAMA adapter (the OR
    // client never serves it). Proven through the real createLiveGateway → createGateway composition.
    const orCalls: OpenRouterCompletionParams[] = [];
    const ollamaCalls: OllamaCompletionParams[] = [];
    const orClient: OpenRouterClient = {
      complete(params): Promise<OpenRouterRawCompletion> {
        orCalls.push(params);
        return Promise.resolve({
          id: 'or',
          model: params.model,
          output: { from: 'or' },
          tokensIn: 1,
          tokensOut: 1,
        });
      },
    };
    const ollamaClient: OllamaClient = {
      complete(params): Promise<OllamaRawCompletion> {
        ollamaCalls.push(params);
        return Promise.resolve({
          id: 'ol',
          model: params.model,
          output: { from: 'ollama' },
          tokensIn: 1,
          tokensOut: 1,
        });
      },
    };
    const overlay = createRegistryOverlay(
      baseRegistry,
      { population_generator: { provider: 'ollama', modelId: 'llama3.1' } },
      ALLOWLIST,
    );
    const gateway = createLiveGateway({
      registry: overlay,
      client: orClient,
      ollamaClient,
      maxRetries: 0,
      retry: { sleep: () => Promise.resolve() },
    });
    return gateway.call({ role: 'population_generator', prompt: 'go' }).then((res) => {
      expect(res.providerMeta.provider).toBe('ollama'); // routed to the overridden provider
      expect(ollamaCalls.map((c) => c.model)).toEqual(['llama3.1']);
      expect(orCalls).toEqual([]); // the OpenRouter client never served the overridden role
    });
  });
});
