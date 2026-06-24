import type { FastifyInstance } from 'fastify';
import type { RunConfig } from '@doppl/contracts';

/**
 * GET /config/caps (PD.18, ARCHITECTURE.md §11/§5) — serves the boot config's VALIDATED cap maxima
 * (`defaultConfig.caps`, the SAME ceiling `overCapField` enforces on POST /runs, LESSON §84). The
 * RunConfigPanel fetches it to clamp its cap inputs to the REAL maxima — fixing the cap-default 422 when
 * the form's static ceiling exceeds a low `.env` ceiling. Read-only (rule #2; store-free, like
 * `/problem-sets` / `/model-routes`). It is NOT a 2nd cap authority: `overCapField` still rejects an
 * above-maxima override (rule #1). Serves the EXISTING frozen `RunCaps` read-only → ZERO new contract.
 */
export interface CapMaximaRoutesDeps {
  defaultConfig: RunConfig;
}

export function registerCapMaximaRoutes(app: FastifyInstance, deps: CapMaximaRoutesDeps): void {
  app.get('/config/caps', async () => ({ caps: deps.defaultConfig.caps }));
}
