import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { EventStore } from '../event-store';
import {
  buildCaseStudyGraph,
  buildCurrentState,
  buildLineageGraph,
  buildReplaySummary,
  buildResearchNotes,
  buildRunSummary,
  type RunSummaryItem,
} from '../projections';
import { listCaseStudyRunIds, listRunIds } from '../projections/run-list';
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
  // GET /runs — the enriched run list backing the Runs table: per run the status + selected winner +
  // creation time + problem + activity counts (buildRunSummary), sorted newest-first (createdAt desc, a
  // run missing a creation time sorts last). Rebuild-on-read over the same per-run readByRun the status
  // summary already used (no extra DB cost); read-only (rule #2).
  app.get('/runs', async () => {
    const ids = await listRunIds(deps.db);
    const runs: RunSummaryItem[] = [];
    for (const id of ids) {
      const events = await deps.store.readByRun(id);
      if (events.length === 0) continue;
      runs.push(buildRunSummary(events));
    }
    runs.sort((a, b) => {
      if (a.createdAt === b.createdAt) return 0;
      if (a.createdAt === null) return 1;
      if (b.createdAt === null) return -1;
      return a.createdAt < b.createdAt ? 1 : -1; // descending: newest first
    });
    return { runs };
  });

  // GET /case-studies/:id/graph — the Islands-pivot cross-run graph: a case study → its runs → each run's
  // doppels (crowned winners), recovered by JOIN on the caseStudyId (A1). Composes N per-run current-state
  // folds (never a mixed-run fold — LESSONS §51). Read-only (rule #2). An unknown / run-less caseStudyId
  // returns a valid EMPTY graph (200, runs:[]) — a case study with no runs yet is a valid empty island, not
  // a 404 (case studies are not yet first-class persisted entities — that lands in Increment B).
  app.get('/case-studies/:id/graph', async (request) => {
    const caseStudyId = (request.params as { id: string }).id;
    const runIds = await listCaseStudyRunIds(deps.db, caseStudyId);
    const runEventLists = [];
    for (const id of runIds) {
      const events = await deps.store.readByRun(id);
      if (events.length > 0) runEventLists.push(events);
    }
    return buildCaseStudyGraph(caseStudyId, runEventLists);
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

  // GET /runs/:id/knowledge — the ResearchNote knowledge graph (KB slice 1): the agents' research
  // folded from tool_call.finished into notes + lineage edges (the stigmergy substrate). Rebuild-on-read.
  app.get('/runs/:id/knowledge', async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const events = await deps.store.readByRun(runId);
    if (events.length === 0) return reply.status(404).send({ error: 'run_not_found', runId });
    return reply.send(buildResearchNotes(events));
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
