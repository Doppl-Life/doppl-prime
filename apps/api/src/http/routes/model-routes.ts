import { ModelRoleValues } from "@doppl/contracts";
import { Hono } from "hono";
import type { GatewayRegistry } from "../../model-gateway/default-routes.js";

/**
 * GET /model-routes (P6.7) — surfaces the configured ModelRoute set
 * (role, provider, modelId, capabilities, fallbackRouteIds) so the
 * dashboard can render which routes are wired without leaking provider
 * credentials.
 */

export interface ModelRoutesDeps {
  registry: GatewayRegistry;
}

export function createModelRoutesApp(deps: ModelRoutesDeps): Hono {
  const app = new Hono();
  app.get("/model-routes", (c) => {
    const routes = ModelRoleValues.map((role) => {
      try {
        const route = deps.registry.resolveRoute(role);
        return {
          role,
          provider: route.provider,
          modelId: route.modelId,
          capabilities: route.capabilities,
          fallbackRouteIds: route.fallbackRouteIds,
        };
      } catch (_err) {
        return { role, error: "not_configured" };
      }
    });
    return c.json({ routes });
  });
  return app;
}
