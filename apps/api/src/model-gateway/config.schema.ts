import { z } from 'zod';
import { ProviderCapability } from '@doppl/contracts';

/**
 * Model-registry config schema + the `defaults<file<env` merge (P2.2, ARCHITECTURE.md §6/§14).
 *
 * Mirrors the validateRunConfig merge discipline (lesson §4) — `deepMerge` is private in the frozen
 * `@doppl/contracts`, so it is mirrored locally (a cross-track frozen-package export isn't warranted
 * for one in-track consumer): deep-merge plain objects, REPLACE arrays/scalars, SKIP JS-internal keys
 * (`__proto__`/`constructor`/`prototype` — pollution-safe), and surface field-identifying errors.
 *
 * Rule #4 credential boundary: `RouteConfig` is a `strictObject` with NO credential field, so a
 * key/secret is structurally unrepresentable (lesson §9 "no-X-field-via-shape" applied to creds) — a
 * logged/persisted config can't leak a credential. Creds load only from env (assertProviderCredentials).
 */

export const RouteConfig = z.strictObject({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  capability: ProviderCapability,
  fallbackRouteIds: z.array(z.string().min(1)).optional(),
});
export type RouteConfig = z.infer<typeof RouteConfig>;

// All 7 ModelRoles are REQUIRED — a missing role fails validation (no silent default).
export const RegistryConfig = z.strictObject({
  population_generator: RouteConfig,
  critic: RouteConfig,
  subtype_check: RouteConfig,
  embedding: RouteConfig,
  final_judge: RouteConfig,
  fusion_synthesis: RouteConfig,
  retrieval: RouteConfig,
});
export type RegistryConfig = z.infer<typeof RegistryConfig>;

// JS-internal keys skipped during merge (lesson §4 footgun — pollution-safe + avoids strictObject
// throwing a confusing "Unrecognized key: constructor").
const INTERNAL_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge `override` onto `base`: nested plain objects merge field-by-field; arrays + scalars REPLACE;
 * JS-internal keys are skipped. Mirrors validateRunConfig's deepMerge (lesson §4).
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (INTERNAL_KEYS.has(key)) continue;
    const existing = result[key];
    result[key] =
      isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return result;
}
