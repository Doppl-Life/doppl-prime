import { isAbsolute, resolve } from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { z } from "zod";
import { SchemaVersionMismatchError } from "../../event-store/scripts/seed-demo.js";
import type { DemoCapOverride } from "../../runtime/demo/demo-cap-override.js";
import {
  CuratedPromptNotFoundError,
  EmptyPromptError,
  InvalidCuratedPromptError,
  buildDemoConfig,
  listCuratedPrompts,
} from "../../runtime/demo/demo-run-config.js";
import { activateLowCapLive, activateReplay } from "../../runtime/demo/fallback-ladder.js";
import {
  findIdempotencyResult,
  hashBody,
  recordIdempotencyResult,
} from "../middleware/idempotency.js";

/**
 * Demo routes (PD.4 + PD.5 + PD.6). Hono sub-app exposing the three
 * fallback-ladder endpoints + a curated-prompt listing. Each handler
 * delegates to the runtime/demo helpers — the routes are thin wrappers
 * that handle HTTP shape, validation, and idempotency.
 *
 * Configured paths (curated prompts dir, replay fixtures dir) are
 * dependency-injected at app construction so tests can point at temp
 * dirs. The defaults match the repo layout (fixtures/ at root).
 */

const CapOverrideSchema = z
  .object({
    maxPopulation: z.number().int().positive().optional(),
    maxGenerations: z.number().int().positive().optional(),
    energyBudget: z.number().int().positive().optional(),
    maxSpawnDepth: z.number().int().positive().optional(),
    maxToolCalls: z.number().int().positive().optional(),
    wallClockTimeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const StartLiveBodySchema = z
  .union([
    z
      .object({
        problemId: z.string().min(1),
        capOverride: CapOverrideSchema.optional(),
      })
      .strict(),
    z
      .object({
        operatorPrompt: z.string().min(1),
        capOverride: CapOverrideSchema.optional(),
      })
      .strict(),
  ])
  .refine(
    (v) => "problemId" in v || "operatorPrompt" in v,
    "either problemId or operatorPrompt is required",
  );

export interface DemoRoutesDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  curatedPromptsDir?: string;
  replayFixturesDir?: string;
}

const DEFAULT_REPLAY_DIR = resolve(process.cwd(), "fixtures/replay");

function compactCapOverride(
  raw: z.infer<typeof CapOverrideSchema> | undefined,
): DemoCapOverride | undefined {
  if (!raw) return undefined;
  const out: DemoCapOverride = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) (out as Record<string, number>)[k] = v;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

export function createDemoRoutesApp(deps: DemoRoutesDeps): Hono {
  const app = new Hono();
  const curatedDir = deps.curatedPromptsDir;
  const replayDir = deps.replayFixturesDir ?? DEFAULT_REPLAY_DIR;

  app.get("/demo/curated-prompts", async (c) => {
    const prompts = await listCuratedPrompts(curatedDir);
    return c.json({ prompts });
  });

  app.post("/demo/runs/live", async (c) => {
    const body = await c.req.text();
    const idempotencyKey = c.req.header("Idempotency-Key") ?? null;

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
    const parseResult = StartLiveBodySchema.safeParse(parsed);
    if (!parseResult.success) {
      return c.json(
        {
          error: "validation_failed",
          issues: parseResult.error.errors.map((e) => ({ path: e.path, message: e.message })),
        },
        400,
      );
    }
    const input = parseResult.data;
    const capOverride = compactCapOverride(input.capOverride);

    try {
      const built =
        "problemId" in input
          ? await buildDemoConfig({
              source: "prepared",
              problemId: input.problemId,
              ...(capOverride ? { capOverride } : {}),
              ...(curatedDir ? { curatedPromptsDir: curatedDir } : {}),
            })
          : await buildDemoConfig({
              source: "operator",
              operatorPrompt: input.operatorPrompt,
              ...(capOverride ? { capOverride } : {}),
            });

      const result = await activateLowCapLive({
        db: deps.db,
        baseConfig: built.config,
      });

      const responseBody = {
        runId: result.runId,
        runMode: result.mode,
        warnings: [...built.warnings, ...result.warnings],
        source: built.source,
      };
      const status = 201;

      if (idempotencyKey) {
        await recordIdempotencyResult(deps.db, {
          key: idempotencyKey,
          runId: result.runId,
          bodyHash: hashBody(body),
          responseBody,
          responseStatus: status,
        });
      }
      return c.json(responseBody, status);
    } catch (err) {
      if (err instanceof CuratedPromptNotFoundError) {
        return c.json({ error: "curated_prompt_not_found", problemId: err.problemId }, 404);
      }
      if (err instanceof InvalidCuratedPromptError) {
        return c.json({ error: "curated_prompt_invalid", problemId: err.problemId }, 422);
      }
      if (err instanceof EmptyPromptError) {
        return c.json({ error: "empty_prompt" }, 400);
      }
      throw err;
    }
  });

  app.post("/demo/runs/replay/:fixtureId", async (c) => {
    const fixtureId = c.req.param("fixtureId");
    if (fixtureId.includes("..") || fixtureId.includes("/") || fixtureId.includes("\\")) {
      return c.json({ error: "invalid_fixture_id" }, 400);
    }
    const fixturePath = isAbsolute(fixtureId) ? fixtureId : resolve(replayDir, `${fixtureId}.json`);

    try {
      const result = await activateReplay({ db: deps.db, fixturePath });
      return c.json(
        {
          runId: result.runId,
          runMode: result.mode,
          eventsLoaded: result.eventsLoaded,
          eventsSkipped: result.eventsSkipped,
        },
        201,
      );
    } catch (err) {
      if (err instanceof SchemaVersionMismatchError) {
        return c.json(
          {
            error: "fixture_schema_version_mismatch",
            fixtureVersion: err.fixtureVersion,
            currentVersion: err.currentVersion,
          },
          409,
        );
      }
      if (err instanceof Error && /ENOENT|no such file/i.test(err.message)) {
        return c.json({ error: "fixture_not_found", fixtureId }, 404);
      }
      throw err;
    }
  });

  return app;
}
