import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { replayReader } from "../../event-store/replay-reader.js";
import { buildCurrentState } from "../../projections/current-state.js";
import { buildLineageGraph } from "../../projections/lineage-graph.js";
import { buildReplaySummary } from "../../projections/replay-summary.js";
import { createWatermarkCache } from "../../projections/watermark.js";

/**
 * Read endpoints (P6.7). Hono sub-app exposing:
 *  - GET /runs              — list (id, status, configuredAt)
 *  - GET /runs/:id          — current-state projection
 *  - GET /runs/:id/events   — events with `?afterSequence=&limit=`
 *  - GET /runs/:id/lineage  — LineageGraphProjection
 *  - GET /runs/:id/replay   — replay summary
 *  - GET /runs/:id/candidates/:cid — single candidate view
 *
 * Read-only by construction; never mutate authoritative state. Each
 * projection rebuild is short-circuited by a watermark cache when the
 * run head sequence hasn't advanced.
 */

const DEFAULT_EVENTS_PAGE = 100;
const MAX_EVENTS_PAGE = 500;

export interface RunsReadDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
}

interface RunRowResult extends Record<string, unknown> {
  id: string;
  status: string;
  mode: string;
  configured_at: Date | string;
  problem_title: string | null;
  completed_at: Date | string | null;
  terminal_summary: string | null;
}

async function fetchRunsList(deps: RunsReadDeps): Promise<RunRowResult[]> {
  // Pulls the problem title out of the JSON config so the Runs list can show
  // human-readable labels without a per-row roundtrip to fetch each config.
  const result = await deps.db.execute<RunRowResult>(
    sql`SELECT id, status, mode, configured_at, completed_at, terminal_summary,
               config->>'problemTitle' AS problem_title
        FROM runs ORDER BY configured_at DESC`,
  );
  return result.rows;
}

async function fetchRunStatus(
  deps: RunsReadDeps,
  runId: string,
): Promise<{ id: string; status: string; mode: string } | null> {
  const result = await deps.db.execute<{ id: string; status: string; mode: string }>(
    sql`SELECT id, status, mode FROM runs WHERE id = ${runId} LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

async function fetchHeadSequence(deps: RunsReadDeps, runId: string): Promise<number> {
  const result = await deps.db.execute<{ max: string | null }>(
    sql`SELECT MAX(sequence)::text AS max FROM run_events WHERE run_id = ${runId}`,
  );
  const raw = result.rows[0]?.max;
  return raw === null || raw === undefined ? -1 : Number(raw);
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export function createRunsReadApp(deps: RunsReadDeps): Hono {
  const app = new Hono();
  const currentStateCache = createWatermarkCache<Awaited<ReturnType<typeof buildCurrentState>>>();
  const lineageCache = createWatermarkCache<Awaited<ReturnType<typeof buildLineageGraph>>>();
  const replayCache = createWatermarkCache<Awaited<ReturnType<typeof buildReplaySummary>>>();

  app.get("/runs", async (c) => {
    const rows = await fetchRunsList(deps);
    return c.json({
      runs: rows.map((r) => ({
        id: r.id,
        status: r.status,
        runMode: r.mode,
        configuredAt:
          r.configured_at instanceof Date ? r.configured_at.toISOString() : r.configured_at,
        completedAt:
          r.completed_at instanceof Date
            ? r.completed_at.toISOString()
            : r.completed_at ?? null,
        problemTitle: r.problem_title,
        terminalSummary: r.terminal_summary,
      })),
    });
  });

  app.get("/runs/:runId", async (c) => {
    const runId = c.req.param("runId");
    const row = await fetchRunStatus(deps, runId);
    if (!row) return c.json({ error: "run_not_found", runId }, 404);
    const head = await fetchHeadSequence(deps, runId);
    let built = currentStateCache.get(runId, head);
    if (!built) {
      built = await buildCurrentState({ db: deps.db, runId });
      currentStateCache.put(runId, built.sequenceThrough, built);
    }
    return c.json({
      runId,
      runMode: row.mode,
      headSequence: head,
      sequenceThrough: built.sequenceThrough,
      currentState: built.state,
    });
  });

  app.get("/runs/:runId/events", async (c) => {
    const runId = c.req.param("runId");
    const row = await fetchRunStatus(deps, runId);
    if (!row) return c.json({ error: "run_not_found", runId }, 404);

    const afterSequence = Number.parseInt(c.req.query("afterSequence") ?? "-1", 10);
    const after = Number.isNaN(afterSequence) ? -1 : afterSequence;
    const limit = parsePositiveInt(c.req.query("limit"), DEFAULT_EVENTS_PAGE, MAX_EVENTS_PAGE);

    const events: unknown[] = [];
    for await (const envelope of replayReader(deps.db).events(runId)) {
      if (envelope.sequence <= after) continue;
      events.push({
        id: envelope.id,
        sequence: envelope.sequence,
        type: envelope.type,
        actor: envelope.actor,
        occurredAt: envelope.occurredAt,
        runId: envelope.runId,
        candidateId: envelope.candidateId,
        agenomeId: envelope.agenomeId,
        generationId: envelope.generationId,
        correlationId: envelope.correlationId,
        payload: envelope.payload,
      });
      if (events.length >= limit) break;
    }
    return c.json({ runId, events, count: events.length });
  });

  app.get("/runs/:runId/lineage", async (c) => {
    const runId = c.req.param("runId");
    const row = await fetchRunStatus(deps, runId);
    if (!row) return c.json({ error: "run_not_found", runId }, 404);
    const head = await fetchHeadSequence(deps, runId);
    let built = lineageCache.get(runId, head);
    if (!built) {
      built = await buildLineageGraph({ db: deps.db, runId });
      lineageCache.put(runId, built.sequenceThrough, built);
    }
    return c.json(built.graph);
  });

  app.get("/runs/:runId/replay", async (c) => {
    const runId = c.req.param("runId");
    const row = await fetchRunStatus(deps, runId);
    if (!row) return c.json({ error: "run_not_found", runId }, 404);
    const head = await fetchHeadSequence(deps, runId);
    let built = replayCache.get(runId, head);
    if (!built) {
      built = await buildReplaySummary({ db: deps.db, runId });
      replayCache.put(runId, built.sequenceThrough, built);
    }
    return c.json(built.summary);
  });

  app.get("/runs/:runId/candidates/:candidateId", async (c) => {
    const runId = c.req.param("runId");
    const candidateId = c.req.param("candidateId");
    const row = await fetchRunStatus(deps, runId);
    if (!row) return c.json({ error: "run_not_found", runId }, 404);

    const built = await buildCurrentState({ db: deps.db, runId });
    const candidate = built.state.candidates[candidateId];
    if (!candidate) {
      return c.json({ error: "candidate_not_found", runId, candidateId }, 404);
    }
    const reviews = Object.values(built.state.criticReviews).filter(
      (r) => r.candidateId === candidateId,
    );
    const checks = Object.values(built.state.checkResults).filter(
      (r) => r.candidateId === candidateId,
    );
    const novelty = Object.values(built.state.noveltyScores).find(
      (n) => n.candidateId === candidateId,
    );
    const fitness = Object.values(built.state.fitnessScores).find(
      (f) => f.candidateId === candidateId,
    );
    return c.json({
      runId,
      candidate,
      criticReviews: reviews,
      checkResults: checks,
      noveltyScore: novelty,
      fitnessScore: fitness,
    });
  });

  return app;
}
