import type { FastifyInstance } from 'fastify';
import type { RunCaps, RunConfig } from '@doppl/contracts';
import { createFallbackLadder, type RungDescriptor } from '../runtime/demo';
import type { ProblemSets } from '../runtime/config/configSchema';

/**
 * PD.12 — the read-only demo fallback-ladder route (ARCHITECTURE.md §17/§11). `GET /demo/fallback-ladder`
 * assembles the operator ladder from boot config (maxima · a demo low-cap lowering · a prepared problem ·
 * the committed replay fixture) via `createFallbackLadder` and returns the 3 serializable rung descriptors
 * the web operator panel consumes (the web cannot import `apps/api` internals — layer rule). Read-only: it
 * appends NO event (rule #2) and starts/replays nothing — the controller is pure (PD.4). This is the
 * production entry that makes `createFallbackLadder` + the `runtime/demo` types reachable.
 */

/** The demo low-cap lowering for rung 1 (a fast live demo within the boot maxima). */
const DEMO_LOW_CAPS: Partial<RunCaps> = { maxPopulation: 3, maxGenerations: 2 };

/** The committed replay fixture run id for rung 3's labeled replay (PD.8a `demo-recorded-001`). */
const DEMO_REPLAY_RUN_ID = 'demo-recorded-001';

export interface DemoLadderRoutesDeps {
  /** The boot run-config — `caps` are the maxima rung 1 lowers within; the base for the prepared rung. */
  defaultConfig: RunConfig;
  /** The boot prepared-problem catalog — rung 2's seed comes from the first prepared problem (if any). */
  problemSets: ProblemSets;
}

export function registerDemoLadderRoutes(app: FastifyInstance, deps: DemoLadderRoutesDeps): void {
  app.get('/demo/fallback-ladder', async (_request, reply) => {
    const ladder = createFallbackLadder({
      maxima: deps.defaultConfig.caps,
      demoOverrides: DEMO_LOW_CAPS,
      preparedRunConfig: {
        ...deps.defaultConfig,
        seed: deps.problemSets[0]?.prompt ?? deps.defaultConfig.seed,
      },
      replayRunId: DEMO_REPLAY_RUN_ID,
    });
    // Read each rung descriptor (select returns the frozen descriptor; mutates only the in-memory active
    // pointer — no event, no store). Order: low-cap-live → prepared → replay.
    const rungs: RungDescriptor[] = [
      ladder.select('low-cap-live'),
      ladder.select('prepared'),
      ladder.select('replay'),
    ];
    return reply.send({ rungs });
  });
}
