import { z } from 'zod';
import {
  CandidateIdea,
  LineageGraphProjection,
  ModelRoute,
  RunCaps,
  RunEventEnvelope,
} from './contracts';
import type { RunConfig } from './contracts';
import { RunHealth } from './health';
import { KnowledgeGraph } from './knowledge';
import { ProblemSetsResponse, type ProblemSet } from './operatorPromptClient';
import { FallbackLadderResponse, type RungDescriptor } from './fallbackLadderClient';
import { OuterBloomProjection } from './outerBloom';
import type { OuterBloomProjection as OuterBloomProjectionType } from './outerBloom';
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
   * GET /runs/:id/knowledge (KB slice 2) — the ResearchNote knowledge graph (the agents' research folded
   * from the log), validated through the WEB-LOCAL `KnowledgeGraph` schema (no frozen contract yet).
   */
  getKnowledge(runId: string): Promise<KnowledgeGraph>;
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
  /**
   * GET /config/caps (PD.18) — the API's validated cap maxima (`defaultConfig.caps`, the ceiling
   * `overCapField` enforces). The RunConfigPanel clamps its inputs to this REAL ceiling (fixes the
   * cap-default 422). Serves the frozen `RunCaps` read-only — no new contract surface.
   */
  getCapMaxima(): Promise<RunCaps>;
  /** GET /bloom — read-only outer-view projection over all known runs. */
  getOuterBloom(): Promise<OuterBloomProjectionType>;
  /**
   * GET /config/model-route-overrides (FB.2) — the per-run model-route override ALLOWLIST: which
   * `{provider, modelId}` a run may override each generation role TO (`final_judge` is never present —
   * rule #6). The RunConfigPanel's model picker reads it so it only offers permitted targets. WEB-LOCAL
   * shape (no frozen contract); the POST /runs validation + kernel overlay stay the real enforcers.
   */
  getModelRouteOverrides(): Promise<ModelRouteOverrideAllowlist>;
}

const RunEventEnvelopeArray = z.array(RunEventEnvelope);
const ModelRouteArray = z.array(ModelRoute);

// PD.18 — GET /config/caps returns `{ caps }` (the frozen RunCaps, served read-only); the client unwraps
// `.caps`. WEB-LOCAL wrapper (not an Appendix-A model); the caps value reuses the frozen RunCaps schema.
const CapMaximaResponse = z.object({ caps: RunCaps });

// FB.2 — GET /config/model-route-overrides returns `{ allowlist }`: the per-role list of permitted override
// `{provider, modelId}` targets (a generation-role-keyed record; `final_judge` is never present — rule #6).
// WEB-LOCAL + forward-tolerant (an api with more roles/models never rejects); the picker reads it to offer
// only permitted models. The kernel-bound overlay + the POST /runs 422 stay the real enforcers (rule #1).
const ModelRouteOverrideEntry = z.object({ provider: z.string(), modelId: z.string() });
export const ModelRouteOverrideAllowlist = z.record(z.string(), z.array(ModelRouteOverrideEntry));
export type ModelRouteOverrideAllowlist = z.infer<typeof ModelRouteOverrideAllowlist>;
const ModelRouteOverridesResponse = z.object({ allowlist: ModelRouteOverrideAllowlist });

// PD.15 — WEB-LOCAL response shapes for the API's real REST wrappers (the PD.14 Finding fix, option C).
// These are web data-client types, NOT Appendix-A models (the dashboard defines no frozen contract).
// The no-`.nullable()` rule is the FROZEN contract's — fixed api-side via the omit-null wire serializer
// for envelopes; here a run summary's `status` is genuinely nullable (a run with no current-state
// status), so `.nullable()` on this web-local type is correct.
export const RunSummary = z.object({
  runId: z.string(),
  status: z.string().nullable(),
  sequenceThrough: z.number(),
  // Enriched run-summary fields (the Runs table). All OPTIONAL so an older api (pre-enrichment) still
  // parses; the current api always sends them. createdAt/problem/finalIdea* are nullable (a run may have
  // no winner / no recorded creation time); the counts default to 0 in the view when absent.
  createdAt: z.string().nullable().optional(),
  problem: z.string().nullable().optional(),
  finalIdeaTitle: z.string().nullable().optional(),
  finalIdeaSummary: z.string().nullable().optional(),
  generations: z.number().optional(),
  candidates: z.number().optional(),
  reproductions: z.number().optional(),
  culls: z.number().optional(),
  mutations: z.number().optional(),
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
    getKnowledge: (runId) => getJson(`/runs/${enc(runId)}/knowledge`, KnowledgeGraph),
    getProblemSets: async () => (await getJson('/problem-sets', ProblemSetsResponse)).problemSets,
    startDemoRun: (partial, opts) =>
      getJson('/runs', StartRunResult, postInit(partial, opts?.idempotencyKey)),
    getFallbackLadder: async () =>
      (await getJson('/demo/fallback-ladder', FallbackLadderResponse)).rungs,
    getCapMaxima: async () => (await getJson('/config/caps', CapMaximaResponse)).caps,
    getOuterBloom: () => getJson('/bloom', OuterBloomProjection),
    getModelRouteOverrides: async () =>
      (await getJson('/config/model-route-overrides', ModelRouteOverridesResponse)).allowlist,
  };
}
