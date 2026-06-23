import type { ModelRole, ModelRoute, ProviderCapability } from '@doppl/contracts';
import { deepMerge, RegistryConfig } from './config.schema';

/**
 * Role-keyed model registry (P2.2, ARCHITECTURE.md §6/§14). `resolve(role)` returns the role's
 * `ModelRoute`; the config is Zod-validated at boot with `defaults<file<env` precedence and fails
 * fast. Provides `createGateway`'s `capabilityFor` + the adapters' route resolution. Credentials are
 * env-only (assertProviderCredentials) and never in the config object (rule #4).
 */

export interface RegistryConfigSources {
  defaults: unknown;
  file?: unknown;
  env?: unknown;
}

// Required provider credentials — env-only, fail-fast at boot (rule #4 / §14). A retrieval/web-search
// key (if P2.7's retrieval adapter needs one) is that slice's concern, not here.
export const REQUIRED_CREDENTIAL_ENV = [
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'DATABASE_URL',
] as const;

/**
 * Fail-fast credential check (rule #4 / §14). Required provider creds load ONLY from env; aborts boot
 * with a named error listing any missing var. Creds are NEVER part of the registry config object.
 * `env` is injected (IO at the boundary, lesson §4); the boot path passes `process.env`.
 */
export function assertProviderCredentials(env: Record<string, string | undefined>): void {
  const missing = REQUIRED_CREDENTIAL_ENV.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(`Missing required credential env var(s): ${missing.join(', ')}`);
  }
}

/**
 * Load + validate the registry config (`defaults<file<env`), fail-fast. Validates against
 * `RegistryConfig` (all 7 roles, strict — a missing role OR an embedded credential fails), then checks
 * every `fallbackRouteId` references a registered route (route id = role; a kernel rule, not the
 * contract — lesson §6).
 */
export function loadModelRegistry(sources: RegistryConfigSources): RegistryConfig {
  const defaults = (sources.defaults ?? {}) as Record<string, unknown>;
  const file = (sources.file ?? {}) as Record<string, unknown>;
  const env = (sources.env ?? {}) as Record<string, unknown>;
  const merged = deepMerge(deepMerge(defaults, file), env);

  const result = RegistryConfig.safeParse(merged);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid model registry configuration — ${details}`);
  }
  const config = result.data;

  const registeredRoles = new Set(Object.keys(config));
  for (const [role, route] of Object.entries(config)) {
    for (const fallbackId of route.fallbackRouteIds ?? []) {
      if (!registeredRoles.has(fallbackId)) {
        throw new Error(
          `Invalid model registry configuration — route '${role}' references unregistered fallbackRouteId '${fallbackId}'`,
        );
      }
    }
  }
  return config;
}

export interface ModelRegistry {
  resolve(role: ModelRole): ModelRoute;
  capabilityFor(role: ModelRole): ProviderCapability;
}

export function createModelRegistry(config: RegistryConfig): ModelRegistry {
  return {
    resolve(role: ModelRole): ModelRoute {
      const route = config[role];
      return {
        role,
        provider: route.provider,
        modelId: route.modelId,
        capability: route.capability,
        fallbackRouteIds: route.fallbackRouteIds ?? [],
      };
    },
    capabilityFor(role: ModelRole): ProviderCapability {
      return config[role].capability;
    },
  };
}
