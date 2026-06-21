import { describe, expect, test } from 'vitest';
import { ModelRoute } from '@doppl/contracts';
import type { ModelRole } from '@doppl/contracts';
import {
  assertProviderCredentials,
  createModelRegistry,
  loadModelRegistry,
  type RegistryConfig,
} from '../../../src/model-gateway';
import { DEFAULT_MODEL_REGISTRY } from '../../../src/config/model-registry.config';

/**
 * P2.2 model registry — role→route resolution + Zod-validated config (defaults<file<env, fail-fast) +
 * the credential boundary (rule #4): creds env-only, never in the registry config object. spec(§6)
 * routing/tiering; spec(§14) credential boundary.
 */

const ALL_ROLES: ModelRole[] = [
  'population_generator',
  'critic',
  'subtype_check',
  'embedding',
  'final_judge',
  'fusion_synthesis',
  'retrieval',
];

const VALID_ENV = {
  OPENROUTER_API_KEY: 'or-key',
  OPENAI_API_KEY: 'oai-key',
  DATABASE_URL: 'postgres://localhost/db',
};

function cloneDefault(): RegistryConfig {
  return structuredClone(DEFAULT_MODEL_REGISTRY);
}

describe('model registry — resolve + config validation + credential boundary', () => {
  // spec(§6) — every role resolves to a valid ModelRoute.
  test('test_resolve_returns_route_for_each_role', () => {
    const registry = createModelRegistry(loadModelRegistry({ defaults: DEFAULT_MODEL_REGISTRY }));
    for (const role of ALL_ROLES) {
      const route = registry.resolve(role);
      expect(ModelRoute.safeParse(route).success, role).toBe(true);
      expect(route.role, role).toBe(role);
    }
  });

  // spec(§6) — a registry missing a role fails validation (no silent default).
  test('test_unmapped_role_is_boot_error', () => {
    const partial = cloneDefault() as Partial<RegistryConfig>;
    delete partial.retrieval;
    expect(() => loadModelRegistry({ defaults: partial })).toThrow();
  });

  // spec(§6/§15) — env overrides file overrides defaults for an overridable key.
  test('test_config_precedence_defaults_file_env', () => {
    const registry = createModelRegistry(
      loadModelRegistry({
        defaults: DEFAULT_MODEL_REGISTRY,
        file: { critic: { modelId: 'from-file' } },
        env: { critic: { modelId: 'from-env' } },
      }),
    );
    expect(registry.resolve('critic').modelId).toBe('from-env');
  });

  // spec(§6/§15) — an invalid registry fails fast with a field-identifying error.
  test('test_invalid_registry_fails_fast', () => {
    const bad = cloneDefault();
    (bad.population_generator as { provider: string }).provider = '';
    expect(() => loadModelRegistry({ defaults: bad })).toThrow(/provider/i);
  });

  // spec(§14) rule #4 — no credential value in the config object; an embedded key is rejected.
  test('test_credentials_never_in_config_object', () => {
    // the default registry carries no credential-like value
    expect(JSON.stringify(DEFAULT_MODEL_REGISTRY)).not.toMatch(
      /api[_-]?key|secret|password|bearer/i,
    );
    // a config with an embedded credential is rejected (strict schema)
    const withKey = cloneDefault();
    (withKey.critic as Record<string, unknown>).apiKey = 'sk-should-not-be-here';
    expect(() => loadModelRegistry({ defaults: withKey })).toThrow();
  });

  // spec(§14/§15) — a missing required credential env var aborts with a named error.
  test('test_required_env_fail_fast', () => {
    expect(() => assertProviderCredentials({})).toThrow(/OPENROUTER_API_KEY/);
    expect(() =>
      assertProviderCredentials({ OPENROUTER_API_KEY: 'x', OPENAI_API_KEY: 'y' }),
    ).toThrow(/DATABASE_URL/);
    expect(() => assertProviderCredentials(VALID_ENV)).not.toThrow();
  });

  // spec(§6) — default role→provider routing.
  test('test_role_provider_defaults', () => {
    const registry = createModelRegistry(loadModelRegistry({ defaults: DEFAULT_MODEL_REGISTRY }));
    for (const role of [
      'population_generator',
      'critic',
      'final_judge',
      'fusion_synthesis',
    ] as const) {
      expect(registry.resolve(role).provider, role).toBe('openrouter');
    }
    const embedding = registry.resolve('embedding');
    expect(embedding.provider).toBe('openai');
    expect(embedding.modelId).toBe('text-embedding-3-small');
    expect(registry.resolve('retrieval').provider).toBe('web-search');
  });

  // spec(§6) — a fallbackRouteId referencing an unregistered route is a config error.
  test('test_dangling_fallback_rejected', () => {
    const dangling = cloneDefault();
    dangling.critic.fallbackRouteIds = ['no-such-route'];
    expect(() => loadModelRegistry({ defaults: dangling })).toThrow();
    // a fallback referencing a registered role is accepted
    const valid = cloneDefault();
    valid.critic.fallbackRouteIds = ['final_judge'];
    expect(() => loadModelRegistry({ defaults: valid })).not.toThrow();
  });

  // spec(§6) — model tiering is expressible per role (cheaper for population/critic, stronger for
  //  final_judge/synthesis); reflected in the resolved route's modelId.
  test('test_model_tiering_expressible', () => {
    const registry = createModelRegistry(loadModelRegistry({ defaults: DEFAULT_MODEL_REGISTRY }));
    expect(registry.resolve('population_generator').modelId).not.toBe(
      registry.resolve('final_judge').modelId,
    );
    // a per-role override changes the resolved modelId (tier is configurable).
    const tuned = createModelRegistry(
      loadModelRegistry({
        defaults: DEFAULT_MODEL_REGISTRY,
        env: { population_generator: { modelId: 'premium/model' } },
      }),
    );
    expect(tuned.resolve('population_generator').modelId).toBe('premium/model');
  });
});
