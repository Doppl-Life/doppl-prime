import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import type { GatewayRegistry } from "../model-gateway/default-routes.js";
import { attachErrorHandler } from "./middleware/error.js";
import { createHealthRouteApp } from "./routes/health.js";
import { createModelRoutesApp } from "./routes/model-routes.js";
import { createRunsReadApp } from "./routes/runs-read.js";
import { createRunsWriteApp } from "./routes/runs-write.js";
import { createStreamRouteApp } from "./routes/stream.js";

/**
 * createServer (P6 bridge) — composes the Hono application from the
 * Phase 6 route + middleware modules. Returns a fully-wired Hono
 * instance ready to mount on @hono/node-server.
 *
 * Routes:
 *   POST /runs                           (idempotent)
 *   POST /runs/:id/stop                  (idempotent)
 *   GET  /runs                           list
 *   GET  /runs/:id                       current-state
 *   GET  /runs/:id/events                cursor-paginated
 *   GET  /runs/:id/lineage               LineageGraphProjection
 *   GET  /runs/:id/replay                ReplaySummary
 *   GET  /runs/:id/candidates/:cid       candidate view
 *   GET  /runs/:id/health                runtime-signal
 *   GET  /runs/:id/stream                SSE
 *   GET  /model-routes                   gateway routes
 *   GET  /healthz                        liveness (no run context)
 */

export interface CreateServerDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  /** Optional gateway registry — when absent the /model-routes path
   *  responds with an empty list. */
  registry?: GatewayRegistry;
  testStreamMaxDurationMs?: number;
}

export function createServer(deps: CreateServerDeps): Hono {
  const app = new Hono();
  attachErrorHandler(app);

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.route("/", createRunsWriteApp({ db: deps.db }));
  app.route("/", createRunsReadApp({ db: deps.db }));
  app.route("/", createHealthRouteApp({ db: deps.db }));
  app.route(
    "/",
    createStreamRouteApp({
      db: deps.db,
      ...(deps.testStreamMaxDurationMs !== undefined
        ? { testMaxDurationMs: deps.testStreamMaxDurationMs }
        : {}),
    }),
  );
  if (deps.registry) {
    app.route("/", createModelRoutesApp({ registry: deps.registry }));
  } else {
    // Empty fallback so the route shape stays stable even without a
    // registry — Phase 7 dashboard can render an empty "not configured"
    // state instead of a 404.
    app.get("/model-routes", (c) => c.json({ routes: [] }));
  }

  return app;
}
