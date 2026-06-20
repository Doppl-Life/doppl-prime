import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { buildRunHealth } from "../../projections/run-health.js";

/**
 * GET /runs/:runId/health (P6.8) — runtime-signal endpoint.
 * 200 with the RunHealth shape; 404 when the run does not exist.
 */

export interface HealthRouteDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
}

export function createHealthRouteApp(deps: HealthRouteDeps): Hono {
  const app = new Hono();
  app.get("/runs/:runId/health", async (c) => {
    const runId = c.req.param("runId");
    const health = await buildRunHealth({ db: deps.db, runId });
    if (!health) return c.json({ error: "run_not_found", runId }, 404);
    return c.json(health);
  });
  return app;
}
