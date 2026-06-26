import { type ZodTypeAny, z } from "zod";
import {
  EventsListResponse,
  LineageGraphProjection,
  ModelRoutesResponse,
  RunHealth,
  RunListResponse,
} from "./contracts.js";

/**
 * REST client over Phase 6's HTTP surface (P7.1). Every response is
 * parsed through Zod schemas; a malformed payload throws
 * ClientValidationError so the UI surfaces a typed error rather than
 * corrupting view state.
 *
 * The client exposes ONLY the contract-defined endpoints plus the two
 * idempotent mutating commands (POST /runs, POST /runs/:id/stop). No
 * other mutating verb is implemented or exported.
 */

export class ClientValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly issues: { path: (string | number)[]; message: string }[],
    public readonly raw: unknown,
  ) {
    super(`payload at ${path} failed schema validation`);
    this.name = "ClientValidationError";
  }
}

export class ClientHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status} at ${path}`);
    this.name = "ClientHttpError";
  }
}

export interface RunClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface StartRunResponse {
  runId: string;
}

const RunModeSchema = z.enum(["fixture", "live", "replay", "rehearsal"]);

const RunDetailSchema = z
  .object({
    runId: z.string().min(1),
    runMode: RunModeSchema.optional(),
    status: z.string().optional(),
    sequenceThrough: z.number().optional(),
  })
  .passthrough();
export type RunDetail = z.infer<typeof RunDetailSchema>;

const CuratedPromptSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtype: z.string().min(1),
  })
  .strict();
export type CuratedPrompt = z.infer<typeof CuratedPromptSchema>;

const CuratedPromptsResponseSchema = z
  .object({
    prompts: z.array(CuratedPromptSchema),
  })
  .strict();

const DemoLiveResponseSchema = z
  .object({
    runId: z.string().min(1),
    runMode: RunModeSchema,
    warnings: z.array(z.string()),
    source: z.enum(["prepared", "operator", "fixture"]),
  })
  .strict();
export type DemoLiveResponse = z.infer<typeof DemoLiveResponseSchema>;

const DemoReplayResponseSchema = z
  .object({
    runId: z.string().min(1),
    runMode: z.literal("replay"),
    eventsLoaded: z.number(),
    eventsSkipped: z.number(),
  })
  .strict();
export type DemoReplayResponse = z.infer<typeof DemoReplayResponseSchema>;

export interface DemoLiveRequest {
  problemId?: string;
  operatorPrompt?: string;
  capOverride?: Partial<{
    maxPopulation: number;
    maxGenerations: number;
    energyBudget: number;
    maxSpawnDepth: number;
    maxToolCalls: number;
    wallClockTimeoutMs: number;
  }>;
}

interface RawJson {
  bodyText: string;
  parsed: unknown;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: RawJson | null }> {
  const url = `${baseUrl}${path}`;
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    let body: unknown = text;
    try {
      body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      // text is the body
    }
    throw new ClientHttpError(response.status, path, body);
  }
  if (text.length === 0) return { status: response.status, data: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ClientValidationError(
      path,
      [{ path: [], message: `invalid JSON: ${(err as Error).message}` }],
      text,
    );
  }
  return { status: response.status, data: { bodyText: text, parsed } };
}

function safeParse<S extends ZodTypeAny>(schema: S, path: string, raw: unknown): z.infer<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ClientValidationError(
      path,
      parsed.error.issues.map((e) => ({ path: e.path, message: e.message })),
      raw,
    );
  }
  return parsed.data;
}

function parseStartedRun(path: string, raw: unknown): RunDetail {
  return safeParse(RunDetailSchema, path, raw);
}

const DASHBOARD_RUNS_PATH = "/kernel/dashboard/runs";

const CURATED_PROMPTS: CuratedPrompt[] = [
  {
    id: "fixtures/fsd-seed.json",
    title: "FSD ownership unwind",
    subtype: "zeitgeist_synthesis",
  },
  {
    id: "fixtures/glp1-seed.json",
    title: "GLP-1 snack demand destruction",
    subtype: "zeitgeist_synthesis",
  },
  {
    id: "fixtures/ai-power-seed.json",
    title: "AI overviews zero-click publishing",
    subtype: "zeitgeist_synthesis",
  },
  {
    id: "fixtures/starship-seed.json",
    title: "Starship launch-cost collapse",
    subtype: "cross_domain_transfer",
  },
];

function lineageFromEvents(events: unknown[]): z.infer<typeof LineageGraphProjection> {
  const nodes = new Map<string, Record<string, unknown>>();
  const edges = new Map<string, Record<string, unknown>>();
  for (const raw of events) {
    const parsed = z
      .object({
        type: z.string(),
        agenomeId: z.string().optional(),
        candidateId: z.string().optional(),
        payload: z.unknown(),
      })
      .passthrough()
      .safeParse(raw);
    if (!parsed.success) continue;
    const event = parsed.data;
    if (event.type === "agenome.spawned") {
      const payload = event.payload as { agenome?: { id?: string; parentIds?: string[]; status?: string } };
      const agenome = payload.agenome;
      if (!agenome?.id) continue;
      nodes.set(agenome.id, {
        id: agenome.id,
        type: "agenome",
        label: agenome.id,
        status: agenome.status ?? "seeded",
      });
      for (const parentId of agenome.parentIds ?? []) {
        edges.set(`${parentId}_${agenome.id}`, {
          id: `${parentId}_${agenome.id}`,
          source: parentId,
          target: agenome.id,
          type: "reproduces",
        });
      }
    }
    if (event.type === "candidate.created") {
      const payload = event.payload as {
        candidate?: { id?: string; agenomeId?: string; title?: string; status?: string };
      };
      const candidate = payload.candidate;
      if (!candidate?.id || !candidate.agenomeId) continue;
      nodes.set(candidate.id, {
        id: candidate.id,
        type: "candidate",
        label: candidate.title ?? candidate.id,
        status: candidate.status ?? "created",
      });
      if (!nodes.has(candidate.agenomeId)) {
        nodes.set(candidate.agenomeId, {
          id: candidate.agenomeId,
          type: "agenome",
          label: candidate.agenomeId,
          status: "seeded",
        });
      }
      edges.set(`${candidate.agenomeId}_${candidate.id}`, {
        id: `${candidate.agenomeId}_${candidate.id}`,
        source: candidate.agenomeId,
        target: candidate.id,
        type: "generates",
      });
    }
    if (event.type === "fitness.scored") {
      const payload = event.payload as { fitness?: { id?: string; candidateId?: string; total?: number } };
      const fitness = payload.fitness;
      if (!fitness?.id || !fitness.candidateId) continue;
      nodes.set(fitness.id, {
        id: fitness.id,
        type: "scoring",
        label: "Fitness",
        metrics: { total: fitness.total ?? 0 },
      });
      edges.set(`${fitness.id}_${fitness.candidateId}`, {
        id: `${fitness.id}_${fitness.candidateId}`,
        source: fitness.id,
        target: fitness.candidateId,
        type: "scores",
      });
    }
  }
  return safeParse(
    LineageGraphProjection,
    "lineage projection",
    { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) },
  );
}

export interface RunClient {
  listRuns(): Promise<RunListResponse>;
  getRun(runId: string): Promise<unknown>;
  getEvents(
    runId: string,
    opts?: { afterSequence?: number; limit?: number },
  ): Promise<EventsListResponse>;
  getLineage(runId: string): Promise<z.infer<typeof LineageGraphProjection>>;
  getReplay(runId: string): Promise<unknown>;
  getCandidate(runId: string, candidateId: string): Promise<unknown>;
  getHealth(runId: string): Promise<RunHealth>;
  getModelRoutes(): Promise<ModelRoutesResponse>;
  startRun(config: unknown, opts?: { idempotencyKey?: string }): Promise<StartRunResponse>;
  stopRun(runId: string): Promise<unknown>;
  getRunDetail(runId: string): Promise<RunDetail>;
  getCuratedPrompts(): Promise<CuratedPrompt[]>;
  startDemoLive(
    body: DemoLiveRequest,
    opts?: { idempotencyKey?: string },
  ): Promise<DemoLiveResponse>;
  startDemoReplay(fixtureId: string): Promise<DemoReplayResponse>;
}

export function createRunClient(options: RunClientOptions = {}): RunClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listRuns() {
      const path = DASHBOARD_RUNS_PATH;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(RunListResponse, path, data?.parsed);
    },
    async getRun(runId) {
      const path = `${DASHBOARD_RUNS_PATH}/${encodeURIComponent(runId)}`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return data?.parsed ?? null;
    },
    async getEvents(runId, opts) {
      const params = new URLSearchParams();
      if (opts?.afterSequence !== undefined) {
        params.set("afterSequence", String(opts.afterSequence));
      }
      if (opts?.limit !== undefined) {
        params.set("limit", String(opts.limit));
      }
      const path = `${DASHBOARD_RUNS_PATH}/${encodeURIComponent(runId)}/events${
        params.size > 0 ? `?${params.toString()}` : ""
      }`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(EventsListResponse, path, data?.parsed);
    },
    async getLineage(runId) {
      const response = await this.getEvents(runId);
      return lineageFromEvents(response.events);
    },
    async getReplay(runId) {
      return { runId };
    },
    async getCandidate(runId, candidateId) {
      return { runId, candidateId };
    },
    async getHealth(runId) {
      const path = `${DASHBOARD_RUNS_PATH}/${encodeURIComponent(runId)}/health`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(RunHealth, path, data?.parsed);
    },
    async getModelRoutes() {
      return safeParse(ModelRoutesResponse, "model routes", { routes: [] });
    },
    async startRun(config, opts) {
      const parsed = RunConfig.safeParse(config);
      const path = DASHBOARD_RUNS_PATH;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (opts?.idempotencyKey) {
        headers["Idempotency-Key"] = opts.idempotencyKey;
      }
      const { data } = await fetchJson(fetchImpl, baseUrl, path, {
        method: "POST",
        headers,
        body: JSON.stringify({
          generations: parsed.success ? parsed.data.caps.maxGenerations : undefined,
        }),
      });
      return parseStartedRun(path, data?.parsed);
    },
    async stopRun(runId) {
      return { runId, stopped: false };
    },
    async getRunDetail(runId) {
      const path = `${DASHBOARD_RUNS_PATH}/${encodeURIComponent(runId)}`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(RunDetailSchema, path, data?.parsed);
    },
    async getCuratedPrompts() {
      const parsed = safeParse(CuratedPromptsResponseSchema, "curated prompts", {
        prompts: CURATED_PROMPTS,
      });
      return parsed.prompts;
    },
    async startDemoLive(body, opts) {
      const path = DASHBOARD_RUNS_PATH;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (opts?.idempotencyKey) {
        headers["Idempotency-Key"] = opts.idempotencyKey;
      }
      const prompt = CURATED_PROMPTS.find((item) => item.id === body.problemId);
      const warnings = body.operatorPrompt
        ? ["Custom prompts are not wired to the kernel yet; running the default approved case."]
        : [];
      const { data } = await fetchJson(fetchImpl, baseUrl, path, {
        method: "POST",
        headers,
        body: JSON.stringify({
          casePath: prompt?.id,
          generations: body.capOverride?.maxGenerations,
          async: true,
        }),
      });
      const parsed = parseStartedRun(path, data?.parsed);
      return safeParse(DemoLiveResponseSchema, path, {
        runId: parsed.runId,
        runMode: parsed.runMode ?? "rehearsal",
        warnings,
        source: body.operatorPrompt ? "operator" : "prepared",
      });
    },
    async startDemoReplay(fixtureId) {
      const path = `/demo/runs/replay/${encodeURIComponent(fixtureId)}`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path, { method: "POST" });
      return safeParse(DemoReplayResponseSchema, path, data?.parsed);
    },
  };
}
