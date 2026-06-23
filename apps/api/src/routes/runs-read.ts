import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { EventStore } from '../event-store';
import { buildCurrentState, buildLineageGraph, buildReplaySummary } from '../projections';
import { listRunIds } from '../projections/run-list';
import { serializeEnvelope } from './_support/serializeEnvelope';

/**
 * The REST read surface (ARCHITECTURE.md §11/§9). All GET, all READ-ONLY (no append, no projection
 * write — rule #2). Each read serves a FRESHLY-rebuilt projection (the P6.2/6.3/6.4 builders fold over
 * `readByRun`; rebuild-on-read MVP — cache + watermark-staleness deferred). An unknown runId/candidateId
 * yields a clean 404 (never a partial/empty 200). `runId`/`candidateId` path params are untrusted opaque
 * bytes — passed to the parameterized `readByRun` / used as object-key lookups, never concatenated.
 */
export interface RunReadRoutesDeps {
  store: EventStore;
  db: NodePgDatabase;
}

export function registerRunReadRoutes(app: FastifyInstance, deps: RunReadRoutesDeps): void {
  // GET /runs — list runs (id + current-state summary) via the demo listRunIds reader.
  app.get('/runs', async () => {
    const ids = await listRunIds(deps.db);
    const runs: Array<{ runId: string; status: string | null; sequenceThrough: number }> = [];
    for (const id of ids) {
      const events = await deps.store.readByRun(id);
      if (events.length === 0) continue;
      const { state, sequenceThrough } = buildCurrentState(events);
      runs.push({ runId: id, status: state.runs[id]?.status ?? null, sequenceThrough });
    }
    return { runs };
  });

  // GET /runs/:id — the current-state projection.
  app.get('/runs/:id', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) return reply.status(404).send({ error: 'run_not_found', runId });
    const { state, sequenceThrough } = buildCurrentState(events);
    return reply.send({ runId, sequenceThrough, state });
  });

  // GET /runs/:id/events?since=N — ordered by sequence; resume from a numeric cursor (sequence > since).
  app.get('/runs/:id/events', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const sinceRaw = (request.query as { since?: string }).since;
    let since: number | null = null;
    if (sinceRaw !== undefined) {
      const parsed = Number(sinceRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return reply
          .status(400)
          .send({ error: 'invalid_cursor', message: 'since must be a non-negative integer' });
      }
      since = parsed;
    }
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) return reply.status(404).send({ error: 'run_not_found', runId });
    const filtered = since === null ? events : events.filter((event) => event.sequence > since);
    // PD.15 — omit null/undefined optionals on the wire so the frozen RunEventEnvelope re-parses on
    // the consumer (the web getEvents no longer PayloadValidationErrors on DB-null optionals).
    return reply.send({ runId, events: filtered.map(serializeEnvelope) });
  });

  // GET /runs/:id/lineage — the LineageGraphProjection (P6.3).
  app.get('/runs/:id/lineage', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) return reply.status(404).send({ error: 'run_not_found', runId });
    return reply.send(buildLineageGraph(buildCurrentState(events)));
  });

  // GET /runs/:id/replay — the replay summary (P6.4).
  app.get('/runs/:id/replay', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) return reply.status(404).send({ error: 'run_not_found', runId });
    return reply.send(buildReplaySummary(events));
  });

  // GET /runs/:id/candidates/:cid — the candidate projection incl. its evidenceRefs (as stored;
  // full dereference is P1.7).
  app.get('/runs/:id/candidates/:cid', async (request, reply) => {
    const { id: runId, cid } = request.params as { id: string; cid: string };
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) return reply.status(404).send({ error: 'run_not_found', runId });
    const candidate = buildCurrentState(events).state.candidateIdeas[cid];
    if (candidate === undefined) {
      return reply.status(404).send({ error: 'candidate_not_found', runId, candidateId: cid });
    }
    return reply.send(candidate);
  });
}
