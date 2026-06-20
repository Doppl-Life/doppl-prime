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
      parsed.error.errors.map((e) => ({ path: e.path, message: e.message })),
      raw,
    );
  }
  return parsed.data;
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
}

export function createRunClient(options: RunClientOptions = {}): RunClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listRuns() {
      const path = "/runs";
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(RunListResponse, path, data?.parsed);
    },
    async getRun(runId) {
      const path = `/runs/${encodeURIComponent(runId)}`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      // Server returns { runId, headSequence, sequenceThrough, currentState }
      // — currentState is internal; keep as unknown so panels parse the
      // slices they care about.
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
      const path = `/runs/${encodeURIComponent(runId)}/events${
        params.size > 0 ? `?${params.toString()}` : ""
      }`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(EventsListResponse, path, data?.parsed);
    },
    async getLineage(runId) {
      const path = `/runs/${encodeURIComponent(runId)}/lineage`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(LineageGraphProjection, path, data?.parsed);
    },
    async getReplay(runId) {
      const path = `/runs/${encodeURIComponent(runId)}/replay`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return data?.parsed ?? null;
    },
    async getCandidate(runId, candidateId) {
      const path = `/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(candidateId)}`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return data?.parsed ?? null;
    },
    async getHealth(runId) {
      const path = `/runs/${encodeURIComponent(runId)}/health`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(RunHealth, path, data?.parsed);
    },
    async getModelRoutes() {
      const path = "/model-routes";
      const { data } = await fetchJson(fetchImpl, baseUrl, path);
      return safeParse(ModelRoutesResponse, path, data?.parsed);
    },
    async startRun(config, opts) {
      const path = "/runs";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (opts?.idempotencyKey) {
        headers["Idempotency-Key"] = opts.idempotencyKey;
      }
      const { data } = await fetchJson(fetchImpl, baseUrl, path, {
        method: "POST",
        headers,
        body: JSON.stringify(config),
      });
      const parsed = z
        .object({ runId: z.string().min(1) })
        .strict()
        .safeParse(data?.parsed);
      if (!parsed.success) {
        throw new ClientValidationError(
          path,
          parsed.error.errors.map((e) => ({ path: e.path, message: e.message })),
          data?.parsed,
        );
      }
      return parsed.data;
    },
    async stopRun(runId) {
      const path = `/runs/${encodeURIComponent(runId)}/stop`;
      const { data } = await fetchJson(fetchImpl, baseUrl, path, { method: "POST" });
      return data?.parsed ?? null;
    },
  };
}
