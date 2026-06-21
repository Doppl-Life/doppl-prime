import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { RunConfig } from '@doppl/contracts';
import type { EventStore } from './event-store';
import { registerRunRoutes } from './routes/runs';

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

/** Default run configuration; its `caps` are the maxima a POST /runs request may lower but not exceed. */
export const DEFAULT_RUN_CONFIG: RunConfig = {
  seed: 'default-scenario',
  enabledSubtypes: ['cross_domain_transfer', 'zeitgeist_synthesis'],
  caps: {
    maxPopulation: 20,
    maxGenerations: 10,
    energyBudget: 100_000,
    maxSpawnDepth: 5,
    maxToolCalls: 200,
    wallClockTimeoutMs: 600_000,
  },
  modelProfile: 'default',
  scoringPolicyVersion: 'scoring-v1',
  rngSeed: 0,
};

export interface BuildServerDeps {
  store: EventStore;
  /** Defaults + cap maxima (defaults to {@link DEFAULT_RUN_CONFIG}). */
  defaultConfig?: RunConfig;
  /** Injected unique-id generator. */
  newId: () => string;
  /** Request-body ingestion limit in bytes (defaults to {@link DEFAULT_BODY_LIMIT}). */
  bodyLimit?: number;
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
    newId: deps.newId,
  });
  return app;
}
