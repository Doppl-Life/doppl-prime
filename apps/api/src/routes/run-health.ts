import type { FastifyInstance } from 'fastify';
import type { EventStore } from '../event-store';
import { buildRunHealth } from '../projections';

/**
 * GET /runs/:id/health (ARCHITECTURE.md §11/§12) — the read-only runtime-signal endpoint. Rebuilds the
 * run-health projection from the persisted log on each request (rebuild-on-read, consistent with P6.7);
 * an unknown runId yields a clean 404. Read-only (no append, no projection write — rule #2). The runId
 * path param is untrusted opaque bytes — passed to the parameterized `readByRun`.
 */
export interface RunHealthRoutesDeps {
  store: EventStore;
}

export function registerRunHealthRoutes(app: FastifyInstance, deps: RunHealthRoutesDeps): void {
  app.get('/runs/:id/health', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) {
      return reply.status(404).send({ error: 'run_not_found', runId });
    }
    return reply.send(buildRunHealth(events));
  });
}
