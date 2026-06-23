import Fastify from 'fastify';
import { describe, expect, test } from 'vitest';
import { registerProblemSetsRoutes } from '../../../src/routes/problem-sets';
import type { ProblemSets } from '../../../src/runtime/config/configSchema';

/**
 * PD.5a — GET /problem-sets (ARCHITECTURE.md §11/§17). A read-only projection of the boot prepared-problem
 * catalog (config.problemSets) so the PD.5b operator panel can populate its selector. The route is built
 * with ONLY the injected catalog — no event store / db — so it is read-only BY CONSTRUCTION (rule #2).
 */

const CATALOG: ProblemSets = [
  {
    id: 'demo-1',
    title: 'Cross-domain transfer demo',
    prompt: 'Find a technique from one domain that solves a problem in another.',
  },
  {
    id: 'demo-2',
    title: 'Zeitgeist synthesis demo',
    prompt: 'Synthesize a current cultural signal into a novel, testable idea.',
  },
];

async function appWith(problemSets: ProblemSets) {
  const app = Fastify();
  registerProblemSetsRoutes(app, { problemSets });
  await app.ready();
  return app;
}

describe('GET /problem-sets (PD.5a — read the boot prepared-problem catalog, spec §11/§17)', () => {
  // §11/§17 — the route returns the injected boot catalog verbatim (each entry {id,title,prompt}).
  test('get_problem_sets_returns_boot_catalog', async () => {
    const app = await appWith(CATALOG);
    try {
      const res = await app.inject({ method: 'GET', url: '/problem-sets' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ problemSets: CATALOG });
    } finally {
      await app.close();
    }
  });

  // rule #2 — read-only: the route is built with NO event store / db dependency (it cannot mutate
  // authoritative state) and repeated GETs return the same catalog (idempotent).
  test('get_problem_sets_is_read_only', async () => {
    const app = await appWith(CATALOG);
    try {
      const first = await app.inject({ method: 'GET', url: '/problem-sets' });
      const second = await app.inject({ method: 'GET', url: '/problem-sets' });
      expect(first.json()).toEqual(second.json()); // idempotent
      expect(second.json()).toEqual({ problemSets: CATALOG });
    } finally {
      await app.close();
    }
  });

  // an empty catalog is a valid state → 200 {problemSets: []}, NOT a 404.
  test('get_problem_sets_empty_catalog', async () => {
    const app = await appWith([]);
    try {
      const res = await app.inject({ method: 'GET', url: '/problem-sets' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ problemSets: [] });
    } finally {
      await app.close();
    }
  });
});
