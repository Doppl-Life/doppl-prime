import { z } from 'zod';
import { ProviderCapability } from '@doppl/contracts';

/**
 * Model-registry config schema (P2.2, ARCHITECTURE.md §6/§14).
 *
 * The `defaults<file<env` merge is the shared in-track `deepMerge` (P3.1 single-sourced it at the 2nd
 * consumer — LESSON 27; this module re-exports it so `registry.ts`'s import stays stable): deep-merge
 * plain objects, REPLACE arrays/scalars, SKIP JS-internal keys (pollution-safe).
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

// Single-sourced `defaults<file<env` merge (P3.1, LESSON 27). Re-exported so `registry.ts`'s existing
// `import { deepMerge } from './config.schema'` stays stable.
export { deepMerge } from '../shared/deep-merge';
