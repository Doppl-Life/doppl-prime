import type { FastifyInstance } from 'fastify';
import type { ProblemSets } from '../runtime/config/configSchema';

/**
 * GET /problem-sets (PD.5a, ARCHITECTURE.md §11/§17) — serves the boot prepared-problem catalog
 * (config.problemSets) so the PD.5b operator panel can populate its prepared-problem selector (the
 * selected prompt becomes RunConfig.seed on the existing POST /runs partial-{seed} path). Read-only: the
 * route takes ONLY the injected catalog — no event store / db — so it cannot mutate authoritative state
 * (rule #2); an empty catalog is a valid 200 {problemSets: []}, never a 404. Mirrors the store-free
 * GET /model-routes pattern. ZERO new contract surface (ProblemSet is a runtime config schema, not Appendix-A).
 */
export interface ProblemSetsRoutesDeps {
  problemSets: ProblemSets;
}

export function registerProblemSetsRoutes(app: FastifyInstance, deps: ProblemSetsRoutesDeps): void {
  app.get('/problem-sets', async () => ({ problemSets: deps.problemSets }));
}
