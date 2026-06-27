import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ModelRoute, RunConfig } from '@doppl/contracts';
import type { EventStore } from './event-store';
import type { ModelRouteOverrideAllowlist } from './model-gateway/model-route-override';
import { registerRunRoutes } from './routes/runs';
import { registerRunReadRoutes } from './routes/runs-read';
import { registerModelRoutes } from './routes/model-routes';
import { registerModelRouteOverridesRoutes } from './routes/model-route-overrides';
import { registerProblemSetsRoutes } from './routes/problem-sets';
import { registerDemoLadderRoutes } from './routes/demo-ladder';
import { registerCapMaximaRoutes } from './routes/cap-maxima';
import { registerRunHealthRoutes } from './routes/run-health';
import { registerRunStreamRoutes } from './routes/run-stream';
import type { EventBridgeOptions } from './sse/event-bridge';
import { DEFAULT_CAPS, type ProblemSets } from './runtime/config/configSchema';

/**
 * The Fastify server bootstrap (ARCHITECTURE.md §11/§14). Stands up the HTTP layer and registers the
 * REST write path (P6.6); the read endpoints (P6.7) + SSE (P6.9) register on this same instance next.
 *
 * `bodyLimit` is the §14 ingestion gate — an over-limit request body is rejected at ingestion (413),
 * BEFORE the per-type payload-DoS ceiling (P0.10) runs on the append path. The server is dependency-
 * injected (store / config / id generator) so it is fully testable via Fastify `inject` (no listen).
 * The listen()/boot wiring (real config load + kernel execution pickup) lands at P3/PD integration.
 */

/** Default request-body ingestion limit (1 MiB) — pairs with the P0.10 MAX_PAYLOAD_BYTES ceiling. */
export const DEFAULT_BODY_LIMIT = 1_048_576;

/** Default run configuration; its `caps` are the maxima a POST /runs request may lower but not exceed.
 *  These maxima are deliberately GENEROUS (≥ the boot ceiling) — this is the standalone/test default;
 *  production overrides `defaultConfig` with the live boot caps (main.ts). The two research-bounded fields
 *  are single-sourced from the boot ceiling (`DEFAULT_CAPS`) so this ceiling can never drift BELOW the boot
 *  caps a recorded `run.configured` carries: B1 raised `DEFAULT_CAPS` (tool-calls 64→600, wall-clock 10→20
 *  min) but left this copy stale at 200 tool-calls / 10-min wall-clock, so boot-derived POST bodies 422'd
 *  themselves against this ceiling. The other four stay generous, all already ≥ the boot defaults. */
export const DEFAULT_RUN_CONFIG: RunConfig = {
  seed: 'default-scenario',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: {
    maxPopulation: 20,
    maxGenerations: 10,
    energyBudget: 100_000,
    maxSpawnDepth: 5,
    maxToolCalls: DEFAULT_CAPS.maxToolCalls,
    wallClockTimeoutMs: DEFAULT_CAPS.wallClockTimeoutMs,
  },
  modelProfile: 'default',
  scoringPolicyVersion: 'scoring-v1',
  rngSeed: 0,
};

export interface BuildServerDeps {
  store: EventStore;
  /** Drizzle handle backing the demo `listRunIds` reader (GET /runs). */
  db: NodePgDatabase;
  /** Defaults + cap maxima (defaults to {@link DEFAULT_RUN_CONFIG}). */
  defaultConfig?: RunConfig;
  /** FB.2 — the frozen per-role model-route override allowlist (defaults to `{}` = fail-closed, no
   *  override permitted). `main.ts` injects the boot `MODEL_ROUTE_OVERRIDE_ALLOWLIST`. */
  modelRouteOverrideAllowlist?: ModelRouteOverrideAllowlist;
  /** Injected unique-id generator. */
  newId: () => string;
  /** Request-body ingestion limit in bytes (defaults to {@link DEFAULT_BODY_LIMIT}). */
  bodyLimit?: number;
  /** The configured ModelRoute set served by GET /model-routes (defaults to empty). */
  modelRoutes?: readonly ModelRoute[];
  /** PD.5a — the boot prepared-problem catalog served by GET /problem-sets (defaults to empty). Wired from
   *  `main.ts` `config.problemSets`; the PD.5b operator panel reads it to populate its selector. */
  problemSets?: ProblemSets;
  /**
   * SSE bridge poll options for GET /runs/:id/stream (P6.9). Defaults to a live stream (real
   * abort-aware sleep + unbounded idle polls); tests inject a no-op sleep + bounded maxIdlePolls.
   */
  sse?: EventBridgeOptions;
  /** P5.11 — additive optional execution trigger passed to POST /runs (the boot `createStartRun`). Absent
   *  → append-only, no execution (today's behavior). Fire-and-forget; the 201 does not block on the run. */
  onRunConfigured?: (runId: string) => void;
  /** PD.3 — latch an operator stop (the boot `operatorStopRegistry.request`); `POST /runs/:id/stop` signals
   *  the in-flight worker through it. Absent → a no-op default (the route still 202s; nothing drains). */
  requestStop?: (runId: string) => void;
}

export function buildServer(deps: BuildServerDeps): FastifyInstance {
  const app = Fastify({ bodyLimit: deps.bodyLimit ?? DEFAULT_BODY_LIMIT });
  // Boundary error hygiene: a 5xx (e.g. an unexpected ProjectionError from reading a foreign-producer
  // log with an unsupported schemaVersion) must never leak an internal error message at the trust
  // boundary. 4xx (validation / bodyLimit-413) pass through with their code. The route handlers send
  // their own 4xx via reply.status() (not throws), so those keep their custom bodies.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error);
      return reply.status(500).send({ error: 'internal_error' });
    }
    return reply
      .status(statusCode)
      .send({ error: error.code ?? error.name, message: error.message });
  });
  registerRunRoutes(app, {
    store: deps.store,
    defaultConfig: deps.defaultConfig ?? DEFAULT_RUN_CONFIG,
    modelRouteOverrideAllowlist: deps.modelRouteOverrideAllowlist ?? {},
    newId: deps.newId,
    requestStop: deps.requestStop ?? ((): void => {}),
    ...(deps.onRunConfigured !== undefined ? { onRunConfigured: deps.onRunConfigured } : {}),
  });
  registerRunReadRoutes(app, { store: deps.store, db: deps.db });
  registerRunHealthRoutes(app, { store: deps.store });
  registerRunStreamRoutes(app, {
    store: deps.store,
    ...(deps.sse !== undefined ? { sse: deps.sse } : {}),
  });
  registerModelRoutes(app, { modelRoutes: deps.modelRoutes ?? [] });
  registerProblemSetsRoutes(app, { problemSets: deps.problemSets ?? [] });
  registerDemoLadderRoutes(app, {
    defaultConfig: deps.defaultConfig ?? DEFAULT_RUN_CONFIG,
    problemSets: deps.problemSets ?? [],
  });
  // PD.18 — serve the validated cap maxima (defaultConfig.caps) so the RunConfigPanel clamps to the
  // REAL ceiling (fixing the cap-default 422). Read-only; overCapField stays the sole cap authority.
  registerCapMaximaRoutes(app, { defaultConfig: deps.defaultConfig ?? DEFAULT_RUN_CONFIG });
  // FB.2 — serve the per-run model-route override ALLOWLIST so the RunConfigPanel's model picker only
  // offers permitted targets (final_judge excluded, rule #6). Read-only; the POST /runs validation +
  // the kernel-bound overlay stay the real enforcers (rule #1).
  registerModelRouteOverridesRoutes(app, {
    allowlist: deps.modelRouteOverrideAllowlist ?? {},
  });
  return app;
}
