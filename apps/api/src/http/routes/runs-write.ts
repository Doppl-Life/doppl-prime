import { RunConfig as RunConfigSchema } from "@doppl/contracts";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { appendEvent } from "../../event-store/append.js";
import { startRun } from "../../runtime/start-run.js";
import {
  findIdempotencyResult,
  hashBody,
  recordIdempotencyResult,
} from "../middleware/idempotency.js";

/**
 * POST /runs + POST /runs/:id/stop (P6.6). Hono sub-app composed by
 * the top-level server. Idempotency middleware sits inline here for
 * the runs creation path; the stop endpoint is naturally idempotent
 * via the terminal-state guard.
 */

export interface RunsWriteDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
}

interface StoredRunRow {
  id: string;
  status: string;
}

async function fetchRunRow(deps: RunsWriteDeps, runId: string): Promise<StoredRunRow | null> {
  const result = await deps.db.execute<{ id: string; status: string }>(
    sql`SELECT id, status FROM runs WHERE id = ${runId} LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, status: row.status };
}

const TERMINAL_STATUSES = new Set(["completed", "stopped", "failed", "cancelled"]);

export function createRunsWriteApp(deps: RunsWriteDeps): Hono {
  const app = new Hono();

  app.post("/runs", async (c) => {
    const body = await c.req.text();
    const idempotencyKey = c.req.header("Idempotency-Key") ?? null;

    // Idempotency lookup
    if (idempotencyKey) {
      const existing = await findIdempotencyResult(deps.db, idempotencyKey);
      if (existing) {
        const bodyHash = hashBody(body);
        if (existing.bodyHash !== bodyHash) {
          return c.json(
            { error: "idempotency_key_conflict", detail: "body differs from prior request" },
            422,
          );
        }
        return c.json(
          existing.responseBody as Record<string, unknown>,
          existing.responseStatus as 200 | 201,
        );
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parseResult = RunConfigSchema.safeParse(parsed);
    if (!parseResult.success) {
      return c.json(
        {
          error: "validation_failed",
          issues: parseResult.error.errors.map((e) => ({
            path: e.path,
            message: e.message,
          })),
        },
        400,
      );
    }

    // startRun throws RunAlreadyActiveError → caught by error middleware
    const { runId } = await startRun(deps.db, parseResult.data);
    const responseBody = { runId };
    const status = 201;

    if (idempotencyKey) {
      await recordIdempotencyResult(deps.db, {
        key: idempotencyKey,
        runId,
        bodyHash: hashBody(body),
        responseBody,
        responseStatus: status,
      });
    }
    return c.json(responseBody, status);
  });

  app.post("/runs/:runId/stop", async (c) => {
    const runId = c.req.param("runId");
    const row = await fetchRunRow(deps, runId);
    if (!row) return c.json({ error: "run_not_found", runId }, 404);

    if (TERMINAL_STATUSES.has(row.status)) {
      return c.json({ runId, status: row.status, alreadyTerminal: true }, 200);
    }

    await appendEvent(deps.db, {
      runId,
      type: "run.stopped",
      actor: "operator",
      payload: { completedAt: new Date().toISOString(), reason: "operator_stop" },
    });

    return c.json({ runId, status: "stopped", alreadyTerminal: false }, 200);
  });

  return app;
}
