import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { EventStore } from '../event-store';
import { buildOuterBloom, buildOuterBloomForRun } from '../projections/outer-bloom';
import { listRunIds } from '../projections/run-list';

export interface OuterBloomRoutesDeps {
  store: EventStore;
  db: NodePgDatabase;
}

export function registerOuterBloomRoutes(app: FastifyInstance, deps: OuterBloomRoutesDeps): void {
  app.get('/bloom', async () => {
    const ids = await listRunIds(deps.db);
    const islands = [];
    for (const id of ids) {
      const events = await deps.store.readByRun(id);
      if (events.length === 0) continue;
      islands.push(buildOuterBloomForRun(events));
    }
    return buildOuterBloom(islands);
  });
}
