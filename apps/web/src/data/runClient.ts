import { z } from 'zod';
import { CandidateIdea, LineageGraphProjection, ModelRoute, RunEventEnvelope } from './contracts';
import type { RunConfig } from './contracts';
import { RunHealth } from './health';
import { ProblemSetsResponse, type ProblemSet } from './operatorPromptClient';
import { FallbackLadderResponse, type RungDescriptor } from './fallbackLadderClient';
import { parseOrThrow, TransportError } from './errors';

export { PayloadValidationError, TransportError } from './errors';

/**
 * Read-only REST seam over the §11 endpoints (ARCHITECTURE.md §11/§12). Every projection read is
 * Zod-validated before it returns (an invalid payload becomes a typed `PayloadValidationError`,
 * never corrupt view state). The surface exposes ONLY the contract endpoints — 7 GET projections +
 * the 2 idempotent commands — so no arbitrary URL/method is representable. The transport is
 * INJECTED (a `fetch`-like), defaulting to the browser global, so the client is network-free +
 * deterministic in tests. The dashboard never mutates authoritative state except via the two
 * idempotent commands (safety rule #2); it imports no `apps/api` internals and fetches no secret
 * (safety rules #4/#9).
 */

/** The minimal structural shape of a `fetch` Response this client depends on. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface FetchRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type FetchLike = (url: string, init?: FetchRequestInit) => Promise<FetchResponseLike>;

export interface RunClientOptions {
  baseUrl: string;
  /** Injected transport; defaults to the browser `fetch`. Tests pass a recording fake. */
  fetch?: FetchLike;
}

export interface RunClient {
  listRuns(): Promise<RunSummary[]>;
  getRun(runId: string): Promise<RunStateView>;
  getEvents(runId: string, opts?: { sinceSequence?: number }): Promise<RunEventEnvelope[]>;
  getLineage(runId: string): Promise<LineageGraphProjection>;
  getReplay(runId: string): Promise<RunStateView>;
  getCandidate(runId: string, candidateId: string): Promise<CandidateIdea>;
  listModelRoutes(): Promise<ModelRoute[]>;
  startRun(config: RunConfig, opts?: { idempotencyKey?: string }): Promise<StartRunResult>;
  stopRun(runId: string): Promise<StopRunResult>;
  /**
   * GET /runs/:id/health (P6.8) — validated through the WEB-LOCAL `RunHealth` schema (no frozen
   * contract yet; reconcile/promote at the demo→cody merge).
   */
  getRunHealth(runId: string): Promise<RunHealth>;
  /**
   * GET /problem-sets (PD.5a) — the boot prepared-problem catalog, validated through the WEB-LOCAL
   * `ProblemSet` mirror (no frozen contract yet; parallel to RunHealth). Returns the catalog array.
   */
  getProblemSets(): Promise<ProblemSet[]>;
  /**
   * POST /runs with a PARTIAL `{ seed }` (PD.5b) — the demo operator-prompt start path; the api
   * deep-merges defaults (the panel never sends caps → the boot ceiling applies). PD.10 isolates the seed.
   */
  startDemoRun(
    partial: { seed: string },
    opts?: { idempotencyKey?: string },
  ): Promise<StartRunResult>;
  /**
   * GET /demo/fallback-ladder (PD.12) — the operator 3-rung demo ladder descriptors, validated through
   * the WEB-LOCAL `RungDescriptor` mirror (api runtime config, no frozen contract — parallel to ProblemSet).
   */
  getFallbackLadder(): Promise<RungDescriptor[]>;
}

const RunEventEnvelopeArray = z.array(RunEventEnvelope);
const ModelRouteArray = z.array(ModelRoute);

// PD.15 — WEB-LOCAL response shapes for the API's real REST wrappers (the PD.14 Finding fix, option C).
// These are web data-client types, NOT Appendix-A models (the dashboard defines no frozen contract).
// The no-`.nullable()` rule is the FROZEN contract's — fixed api-side via the omit-null wire serializer
// for envelopes; here a run summary's `status` is genuinely nullable (a run with no current-state
// status), so `.nullable()` on this web-local type is correct.
export const RunSummary = z.object({
  runId: z.string(),
  status: z.string().nullable(),
  sequenceThrough: z.number(),
});
export type RunSummary = z.infer<typeof RunSummary>;
const RunSummariesResponse = z.object({ runs: z.array(RunSummary) });

// GET /runs/:id and /runs/:id/replay return the current-state / replay-summary wrapper. `state` is the
// API's current-state projection (no frozen contract; the dashboard renders the headline via the
// lineage/candidate projections, not this) → kept permissive rather than over-modeling an unconsumed shape.
export const RunStateView = z.object({
  runId: z.string(),
  sequenceThrough: z.number(),
  state: z.unknown(),
});
export type RunStateView = z.infer<typeof RunStateView>;

// GET /runs/:id/events returns `{ runId, events }` — the client unwraps `.events` (null-free post the
// API omit-null serializer, so the frozen RunEventEnvelope re-parses).
const EventsResponse = z.object({ runId: z.string(), events: RunEventEnvelopeArray });

// PD.16 — WEB-LOCAL command-response shapes (the PD.15 read-path fix, command side; NOT Appendix-A
// models). POST /runs → `{ runId }` (201) or `{ runId, idempotent: true }` (200 duplicate key);
// POST /runs/:id/stop → `{ runId, status, stopped }` (200 already-terminal no-op) or
// `{ runId, stopRequested }` (202 signaled async — apps/api LESSON §85). The caller needs only the
// runId to switch the observed run; the run's full state arrives via the GET/SSE path.
export const StartRunResult = z.object({ runId: z.string(), idempotent: z.boolean().optional() });
export type StartRunResult = z.infer<typeof StartRunResult>;
export const StopRunResult = z.object({
  runId: z.string(),
  status: z.string().optional(),
  stopped: z.boolean().optional(),
  stopRequested: z.boolean().optional(),
});
export type StopRunResult = z.infer<typeof StopRunResult>;

export function createRunClient(options: RunClientOptions): RunClient {
  const { baseUrl } = options;
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  // IDs are opaque/untrusted bytes — percent-encode every id path segment, never raw-concatenate
  // (carry-forward: parameterize id fields; ARCHITECTURE.md §14).
  const enc = encodeURIComponent;

  async function getJson<T>(
    path: string,
    schema: z.ZodType<T>,
    init?: FetchRequestInit,
  ): Promise<T> {
    const endpoint = `${init?.method ?? 'GET'} ${path}`;
    const res = await doFetch(`${baseUrl}${path}`, init);
    // Gate on HTTP status BEFORE parsing: a non-2xx body is a transport error, never a projection
    // (so an error body that satisfies a schema can't be false-accepted as valid view state).
    if (!res.ok) {
      throw new TransportError(endpoint, res.status);
    }
    const body = await res.json();
    return parseOrThrow(schema, endpoint, body);
  }

  // The optional Idempotency-Key lets the API dedup a duplicate submit (the client never
  // re-implements the dedup — §11); the API + kernel remain the authoritative idempotency guard.
  // PD.16 — set `content-type: application/json` ONLY when there's a body: a bodyless POST (stopRun)
  // claiming application/json makes Fastify reject the empty body with a 400 (FST_ERR_CTP_EMPTY_JSON_BODY),
  // which broke the operator Stop against the real API (the smoke caught it).
  const postInit = (body?: unknown, idempotencyKey?: string): FetchRequestInit => ({
    method: 'POST',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const eventsPath = (runId: string, sinceSequence?: number): string =>
    `/runs/${enc(runId)}/events${sinceSequence !== undefined ? `?since=${sinceSequence}` : ''}`;

  return {
    listRuns: async () => (await getJson('/runs', RunSummariesResponse)).runs,
    getRun: (runId) => getJson(`/runs/${enc(runId)}`, RunStateView),
    getEvents: async (runId, opts) =>
      (await getJson(eventsPath(runId, opts?.sinceSequence), EventsResponse)).events,
    getLineage: (runId) => getJson(`/runs/${enc(runId)}/lineage`, LineageGraphProjection),
    getReplay: (runId) => getJson(`/runs/${enc(runId)}/replay`, RunStateView),
    getCandidate: (runId, candidateId) =>
      getJson(`/runs/${enc(runId)}/candidates/${enc(candidateId)}`, CandidateIdea),
    listModelRoutes: () => getJson('/model-routes', ModelRouteArray),
    startRun: (config, opts) =>
      getJson('/runs', StartRunResult, postInit(config, opts?.idempotencyKey)),
    stopRun: (runId) => getJson(`/runs/${enc(runId)}/stop`, StopRunResult, postInit()),
    getRunHealth: (runId) => getJson(`/runs/${enc(runId)}/health`, RunHealth),
    getProblemSets: async () => (await getJson('/problem-sets', ProblemSetsResponse)).problemSets,
    startDemoRun: (partial, opts) =>
      getJson('/runs', StartRunResult, postInit(partial, opts?.idempotencyKey)),
    getFallbackLadder: async () =>
      (await getJson('/demo/fallback-ladder', FallbackLadderResponse)).rungs,
  };
}
