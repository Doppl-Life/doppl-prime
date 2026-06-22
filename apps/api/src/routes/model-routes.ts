import type { FastifyInstance } from 'fastify';
import type { ModelRoute } from '@doppl/contracts';

/**
 * GET /model-routes (ARCHITECTURE.md §11/§6) — serves the configured `ModelRoute` set (roles incl.
 * retrieval/final_judge, capability flags, fallbackRouteIds) from the server's injected boot config.
 * Read-only; carries NO credential (routes are config metadata — keys load from env only, §14).
 */
export interface ModelRoutesDeps {
  modelRoutes: readonly ModelRoute[];
}

export function registerModelRoutes(app: FastifyInstance, deps: ModelRoutesDeps): void {
  app.get('/model-routes', async () => ({ modelRoutes: deps.modelRoutes }));
}
