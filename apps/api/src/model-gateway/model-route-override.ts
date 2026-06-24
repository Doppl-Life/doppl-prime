import type { ModelRole, ModelRoute, ModelRouteOverride } from '@doppl/contracts';
import type { ModelRegistry } from './registry';

/**
 * Per-run model-route override clamp (FB.2, ARCHITECTURE.md §5/§6, KEY SAFETY RULES #1 + #6 + #4 + #7).
 *
 * `RunConfig.modelRouteOverride` (FB.0's `{provider, modelId}` per-role shape) lets a run pick a
 * different model for a role — but ONLY within a FROZEN boot allowlist (rule #1, exactly like caps: the
 * kernel bounds what a run may select). `final_judge` is EXCLUDED from the allowlist (rule #6 — the
 * held-out judge model is not run-swappable, so the fitness anchor can't be moved here). The entry
 * carries only `{provider, modelId}` — no credential is representable (rule #4, FB.0 strict shape).
 *
 * Two enforcement points: the route rejects a non-permitted override 422 BEFORE the append (the loud
 * primary gate, rule #2), and the per-run registry OVERLAY re-clamps to the allowlist (the kernel-bound
 * fail-safe — a direct-append `run.configured` that bypasses the route can never widen; it falls back
 * to the base route, mirroring the caps re-clamp). The overlay is a pure deterministic function of the
 * persisted override + boot registry, so replay re-applies it identically with no provider call (rule #7).
 */

/** A per-role override target — provider + modelId only (no credential; mirrors FB.0's strict shape). */
export interface ModelRouteOverrideEntry {
  provider: string;
  modelId: string;
}

/** The frozen per-role allowlist of permitted override targets. A role absent ⇒ not overridable. */
export type ModelRouteOverrideAllowlist = Partial<
  Record<ModelRole, ReadonlyArray<ModelRouteOverrideEntry>>
>;

/** The first non-permitted override entry (named), for the route's 422 body. */
export interface ModelRouteOverrideViolation {
  role: ModelRole;
  provider: string;
  modelId: string;
  reason: string;
}

function isPermitted(
  allowlist: ModelRouteOverrideAllowlist,
  role: ModelRole,
  entry: ModelRouteOverrideEntry,
): boolean {
  const permitted = allowlist[role];
  if (permitted === undefined) return false;
  return permitted.some((p) => p.provider === entry.provider && p.modelId === entry.modelId);
}

/**
 * Return the FIRST override entry that is not permitted (an unlisted/excluded role, or a `{provider,
 * modelId}` not in that role's allowlist), or `null` if every entry is permitted. Pure — mirrors
 * `overCapField`. `final_judge` (and any unlisted role) has no allowlist entry → always a violation.
 */
export function modelRouteOverrideViolation(
  override: ModelRouteOverride,
  allowlist: ModelRouteOverrideAllowlist,
): ModelRouteOverrideViolation | null {
  for (const [roleKey, entry] of Object.entries(override)) {
    if (entry === undefined) continue;
    const role = roleKey as ModelRole;
    if (allowlist[role] === undefined) {
      return {
        role,
        provider: entry.provider,
        modelId: entry.modelId,
        reason: role === 'final_judge' ? 'judge_not_overridable' : 'role_not_overridable',
      };
    }
    if (!isPermitted(allowlist, role, entry)) {
      return {
        role,
        provider: entry.provider,
        modelId: entry.modelId,
        reason: 'model_not_permitted',
      };
    }
  }
  return null;
}

/**
 * Apply an override to a base route — replace `provider`/`modelId`, INHERIT `capability` +
 * `fallbackRouteIds` from the base (the override narrows provider/model, never fabricates a capability).
 */
export function applyRouteOverride(base: ModelRoute, entry: ModelRouteOverrideEntry): ModelRoute {
  return { ...base, provider: entry.provider, modelId: entry.modelId };
}

/**
 * Build a per-run registry OVERLAY that resolves an allowlist-PERMITTED override to its overridden route
 * and everything else (incl. a non-permitted entry — the kernel-bound fail-safe, rule #1) to the base
 * route. `capabilityFor` delegates to the base. Pure + deterministic → replay rebuilds the identical
 * effective route from the persisted override with no provider call (rule #7).
 */
export function createRegistryOverlay(
  base: ModelRegistry,
  override: ModelRouteOverride,
  allowlist: ModelRouteOverrideAllowlist,
): ModelRegistry {
  return {
    resolve(role: ModelRole): ModelRoute {
      const baseRoute = base.resolve(role);
      const entry = override[role];
      if (entry !== undefined && isPermitted(allowlist, role, entry)) {
        return applyRouteOverride(baseRoute, entry);
      }
      return baseRoute;
    },
    capabilityFor(role: ModelRole) {
      return base.capabilityFor(role);
    },
  };
}
