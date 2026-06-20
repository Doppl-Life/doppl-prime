import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { formatSseFrame, nextEventsAfter } from "../sse/event-bridge.js";

/**
 * GET /runs/:runId/stream (P6.9). SSE event stream.
 *
 * Catch-up: events with sequence > Last-Event-ID stream out first.
 * Live: a polling loop fetches new events every
 * DOPPL_SSE_POLLING_FALLBACK_MS (default 250). The polling fallback
 * IS the MVP primary path — a future iteration can swap in LISTEN /
 * NOTIFY without changing the route shape.
 *
 * Closing the client connection breaks the polling loop. Reconnect
 * with Last-Event-ID resumes exactly from the persisted cursor with
 * no gap and no duplicate.
 */

const POLLING_INTERVAL_MS = Number(process.env.DOPPL_SSE_POLLING_FALLBACK_MS ?? "250");

export interface StreamRouteDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  /** Stop the polling loop after this many ms (test-only). */
  testMaxDurationMs?: number;
}

async function runExists(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>,
  runId: string,
): Promise<boolean> {
  const result = await db.execute<{ id: string }>(
    sql`SELECT id FROM runs WHERE id = ${runId} LIMIT 1`,
  );
  return result.rows.length > 0;
}

function parseLastEventId(value: string | null | undefined): number {
  if (!value) return -1;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

export function createStreamRouteApp(deps: StreamRouteDeps): Hono {
  const app = new Hono();
  app.get("/runs/:runId/stream", async (c) => {
    const runId = c.req.param("runId");
    if (!(await runExists(deps.db, runId))) {
      return c.json({ error: "run_not_found", runId }, 404);
    }

    const headerCursor = parseLastEventId(c.req.header("Last-Event-ID"));
    const queryCursor = parseLastEventId(c.req.query("lastEventId") ?? null);
    let cursor = Math.max(headerCursor, queryCursor);

    const startedAt = Date.now();

    return streamSSE(c, async (stream) => {
      // Catch-up phase
      const initial = await nextEventsAfter(deps, runId, cursor);
      for (const event of initial) {
        await stream.writeSSE({
          id: String(event.sequence),
          event: event.type,
          data: JSON.stringify(event),
        });
        cursor = event.sequence;
      }

      // Live phase via polling
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(POLLING_INTERVAL_MS);
        if (stream.aborted || stream.closed) break;
        const fresh = await nextEventsAfter(deps, runId, cursor);
        for (const event of fresh) {
          await stream.writeSSE({
            id: String(event.sequence),
            event: event.type,
            data: JSON.stringify(event),
          });
          cursor = event.sequence;
        }
        if (deps.testMaxDurationMs && Date.now() - startedAt > deps.testMaxDurationMs) {
          break;
        }
      }
    });
  });
  return app;
}

export { formatSseFrame };
