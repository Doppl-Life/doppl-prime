import { z } from 'zod';
import {
  CandidateIdea,
  LineageGraphProjection,
  ModelRoute,
  Run,
  RunEventEnvelope,
} from './contracts';
import type { RunConfig } from './contracts';
import { RunHealth } from './health';
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
  listRuns(): Promise<Run[]>;
  getRun(runId: string): Promise<Run>;
  getEvents(runId: string, opts?: { sinceSequence?: number }): Promise<RunEventEnvelope[]>;
  getLineage(runId: string): Promise<LineageGraphProjection>;
  getReplay(runId: string): Promise<RunEventEnvelope[]>;
  getCandidate(runId: string, candidateId: string): Promise<CandidateIdea>;
  listModelRoutes(): Promise<ModelRoute[]>;
  startRun(config: RunConfig, opts?: { idempotencyKey?: string }): Promise<Run>;
  stopRun(runId: string): Promise<Run>;
  /**
   * GET /runs/:id/health (P6.8) — validated through the WEB-LOCAL `RunHealth` schema (no frozen
   * contract yet; reconcile/promote at the demo→cody merge).
   */
  getRunHealth(runId: string): Promise<RunHealth>;
}

const RunArray = z.array(Run);
const RunEventEnvelopeArray = z.array(RunEventEnvelope);
const ModelRouteArray = z.array(ModelRoute);

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
  const postInit = (body?: unknown, idempotencyKey?: string): FetchRequestInit => ({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const eventsPath = (runId: string, sinceSequence?: number): string =>
    `/runs/${enc(runId)}/events${sinceSequence !== undefined ? `?sinceSequence=${sinceSequence}` : ''}`;

  return {
    listRuns: () => getJson('/runs', RunArray),
    getRun: (runId) => getJson(`/runs/${enc(runId)}`, Run),
    getEvents: (runId, opts) =>
      getJson(eventsPath(runId, opts?.sinceSequence), RunEventEnvelopeArray),
    getLineage: (runId) => getJson(`/runs/${enc(runId)}/lineage`, LineageGraphProjection),
    getReplay: (runId) => getJson(`/runs/${enc(runId)}/replay`, RunEventEnvelopeArray),
    getCandidate: (runId, candidateId) =>
      getJson(`/runs/${enc(runId)}/candidates/${enc(candidateId)}`, CandidateIdea),
    listModelRoutes: () => getJson('/model-routes', ModelRouteArray),
    startRun: (config, opts) => getJson('/runs', Run, postInit(config, opts?.idempotencyKey)),
    stopRun: (runId) => getJson(`/runs/${enc(runId)}/stop`, Run, postInit()),
    getRunHealth: (runId) => getJson(`/runs/${enc(runId)}/health`, RunHealth),
  };
}
