import type { FastifyInstance } from 'fastify';
import type { ModelRouteOverrideAllowlist } from '../model-gateway/model-route-override';

/**
 * GET /config/model-route-overrides (FB.2, ARCHITECTURE.md §11/§5/§6) — serves the FROZEN per-run
 * model-route override ALLOWLIST: which `{provider, modelId}` a run may override each GENERATION role TO
 * (the SAME allowlist `modelRouteOverrideViolation` enforces on POST /runs, rule #1). `final_judge` is
 * deliberately absent (rule #6 — the held-out judge model is not run-swappable). The RunConfigPanel reads
 * this to populate the model-override picker so it only offers permitted targets (defense-in-depth; the
 * route + the kernel-bound overlay stay the real enforcers).
 *
 * Read-only (rule #2; store-free, like `/config/caps`). Carries NO credential — the allowlist is config
 * metadata (keys load from env only, §14). DISTINCT from `GET /model-routes` (the CONFIGURED route set).
 * Serves the existing `ModelRouteOverrideAllowlist` read-only → ZERO new frozen-contract surface.
 */
export interface ModelRouteOverridesDeps {
  allowlist: ModelRouteOverrideAllowlist;
}

export function registerModelRouteOverridesRoutes(
  app: FastifyInstance,
  deps: ModelRouteOverridesDeps,
): void {
  app.get('/config/model-route-overrides', async () => ({ allowlist: deps.allowlist }));
}
