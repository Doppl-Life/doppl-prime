import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { EventStore } from '../event-store';
import { streamRunEvents, type EventBridgeOptions } from '../sse/event-bridge';

/**
 * P6.9 — the SSE run-event stream (ARCHITECTURE.md §11/§4). `GET /runs/:id/stream` emits the run's
 * events over Server-Sent Events in sequence order, with the SSE `id` set to the event `sequence` so a
 * dropped client resumes gap/dup-free via the standard `Last-Event-ID` reconnect header (a
 * `?lastEventId=` query is the explicit fallback). It carries operation-start MARKERS and completions
 * (the §4/§12 live in-flight window), not only completions.
 *
 * DELIVERY-ONLY / non-authoritative (rule #2): the route only READS (`readByRun`, via the demo-owned
 * {@link streamRunEvents} bridge) — it never appends or mutates a projection; dropping the stream loses
 * no authoritative state, and the client can fall back to polling `GET /events`/replay for the same
 * ordered view. `runId` is an untrusted opaque path param (parameterized into `readByRun`, never
 * concatenated). The bridge options (`sse`) are injected so tests run with no real timers.
 */
export interface RunStreamRoutesDeps {
  store: Pick<EventStore, 'readByRun'>;
  /** Bridge poll options (default = a live stream: real abort-aware sleep + unbounded idle polls). */
  sse?: EventBridgeOptions;
}

/** `-1` = from sequence 0 (absent OR empty cursor). `'invalid'` = present-but-unparseable → 400. */
function parseCursor(request: FastifyRequest): number | 'invalid' {
  const header = request.headers['last-event-id'];
  const query = (request.query as { lastEventId?: string }).lastEventId;
  const raw = Array.isArray(header) ? header[0] : (header ?? query);
  // An ABSENT or EMPTY/whitespace Last-Event-ID = "no cursor" (SSE spec) → deliver from the start
  // (sequence 0), the same as the no-header path. This is distinct from a real numeric `0` (which
  // resumes AFTER seq 0): `Number('') === 0` would otherwise silently skip seq 0 (run.configured).
  if (raw === undefined || raw.trim() === '') return -1;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return 'invalid';
  return parsed;
}

export function registerRunStreamRoutes(app: FastifyInstance, deps: RunStreamRoutesDeps): void {
  app.get('/runs/:id/stream', async (request, reply) => {
    const runId = (request.params as { id: string }).id;

    const fromSequence = parseCursor(request);
    if (fromSequence === 'invalid') {
      return reply
        .status(400)
        .send({ error: 'invalid_cursor', message: 'lastEventId must be a non-negative integer' });
    }

    // Unknown runId → clean 404 (never a partial/hung stream) — checked BEFORE hijacking the reply.
    const existing = await deps.store.readByRun(runId);
    if (existing.length === 0) {
      return reply.status(404).send({ error: 'run_not_found', runId });
    }

    // Take manual control of the response (Fastify v5: reply.hijack) for raw SSE framing.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      // TODO(hosted): drop `connection` under HTTP/2 — it's a forbidden connection-specific header on
      // h2 (harmless under the local h1 demo server). Revisit when fronting the API with an h2 proxy.
      connection: 'keep-alive',
    });

    // Client disconnect → abort the bridge poll loop so the stream ends promptly.
    const controller = new AbortController();
    request.raw.on('close', () => controller.abort());

    try {
      for await (const event of streamRunEvents(deps.store, runId, fromSequence, {
        ...deps.sse,
        signal: controller.signal,
      })) {
        raw.write(`id:${event.sequence}\ndata:${JSON.stringify(event)}\n\n`);
      }
    } finally {
      raw.end();
    }
  });
}
