import { EvidenceRef } from '@doppl/contracts';
import type { ModelGatewayRequest, ModelRole, ProviderMeta } from '@doppl/contracts';
import type { ProviderCallFn, ProviderResult } from '../structured-output';
import type { ModelRegistry } from '../registry';
import { withRetry } from './retry';
import type { AttemptFailure, RetryDeps, RetryPolicy } from './retry';
import { loadCuratedCorpus, searchCuratedCorpus } from './curated-corpus';
import type { CuratedCorpus, RetrievalKind, RetrievalResultItem } from './curated-corpus';

export type { RetrievalKind, RetrievalResultItem } from './curated-corpus';

/**
 * Retrieval / web-search adapter (P2.7, ARCHITECTURE.md §6/§13/§14, KEY SAFETY RULES #7 + #8 + #9).
 *
 * A PLUGGABLE live-search seam (no vendor pinned — deferred to the §6 spike) with an operator-curated
 * corpus fallback. It mirrors the lesson-28 pattern (reuses `withRetry`, the `ProviderCallFn` seam) but
 * DIVERGES on terminal failure: instead of throwing `ProviderCallError` (→ gateway-rejected, like
 * generation/embedding), it FALLS BACK to the curated corpus tagged `fallbackSourced` and NEVER rejects
 * (rehearsed demo-safety, §6 RISK-004/005). Live failures surface in `output.failures` and debit NO
 * energy (rule #8); the web-search tool-call cost is reported in `providerMeta.costEstimate` on success
 * ONLY. Results are returned self-contained so the caller persists them into the originating event and
 * grounding resolves from Postgres on replay with zero web calls (rule #7); the pure `retrievalEvidenceRef`
 * builds an `EvidenceRef` anchored by `eventId` (never an external-only pointer). No vendor SDK is
 * imported in this slice (rule #9 — pluggable seam).
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_KIND: RetrievalKind = 'prior_art';
// Non-empty gatewayRequestId sentinels (ProviderMeta.gatewayRequestId is string.min(1)).
const CURATED_FALLBACK_ID = 'curated-fallback';
const LIVE_REQUEST_ID = 'web-search';

const RETRIEVAL_KINDS = new Set<RetrievalKind>(['prior_art', 'signal']);

/** A query to the live-search seam (contract-shaped; vendor-free). */
export interface RetrievalSearchParams {
  query: string;
  maxResults: number;
}

/** The live-search seam's response. `costEstimate` is the web-search tool-call cost (success only). */
export interface RetrievalSearchResponse {
  results: { label: string; snippet: string; uri?: string }[];
  costEstimate?: number;
  requestId?: string;
}

/**
 * The injected live-search seam — OUR vendor-free interface. A concrete provider is deferred to the §6
 * retrieval spike (LEAD/USER directive: pluggable, no vendor pin now); until one is wired the adapter is
 * built with `client: undefined` and the curated corpus is the always-available fallback.
 */
export interface RetrievalSearchClient {
  search(
    params: RetrievalSearchParams,
    opts: { timeoutMs: number },
  ): Promise<RetrievalSearchResponse>;
}

/** The adapter-local retrieval output (NOT an Appendix-A contract); the caller maps items → EvidenceRef. */
export interface RetrievalOutput {
  query: string;
  results: RetrievalResultItem[];
  fallbackSourced: boolean;
  /** Failed live attempts surfaced for the caller's provider_call_failed events (debit no energy). */
  failures: AttemptFailure[];
}

export interface RetrievalAdapterDeps {
  /** Role → route resolution (P2.2); the retrieval route is provider `web-search`, capability NONE. */
  registry: ModelRegistry;
  /** Optional live-search seam; when absent OR terminally failing, the curated corpus is used. */
  client?: RetrievalSearchClient;
  /** Curated fallback corpus; defaults to the operator `DEFAULT_PRIOR_ART_CORPUS`. */
  corpus?: CuratedCorpus;
  /** The kind to tag this providerCall's results (instance-config — the request carries no kind). */
  kind?: RetrievalKind;
  /** Max results per call; default {@link DEFAULT_MAX_RESULTS}. */
  maxResults?: number;
  /** Retries after the first live attempt; default 2 (passed through to {@link withRetry}). */
  maxRetries?: number;
  /** Per-role per-attempt timeout; default {@link DEFAULT_TIMEOUT_MS}. Not a contract field. */
  timeoutMsForRole?: (role: ModelRole) => number;
  /** Injected backoff + timeout seams for deterministic tests. */
  retry?: RetryDeps;
}

/**
 * Build the retrieval `providerCall` the gateway injects. NEVER throws: a live success returns live
 * results; no-client or terminal live failure returns curated-corpus results tagged `fallbackSourced`.
 * Fits the gateway's no-schema path (retrieval capability = NONE).
 */
export function createRetrievalProviderCall(deps: RetrievalAdapterDeps): ProviderCallFn {
  const corpus = loadCuratedCorpus(deps.corpus);
  const kind = deps.kind ?? DEFAULT_KIND;
  const maxResults = deps.maxResults ?? DEFAULT_MAX_RESULTS;
  const timeoutFor = deps.timeoutMsForRole ?? (() => DEFAULT_TIMEOUT_MS);

  return async (request: ModelGatewayRequest): Promise<ProviderResult> => {
    const route = deps.registry.resolve(request.role);
    const query = request.prompt ?? request.messages?.map((m) => m.content).join('\n') ?? '';

    const curatedFallback = (failures: AttemptFailure[]): ProviderResult => {
      const results = searchCuratedCorpus(corpus, query, { kind, maxResults });
      const output: RetrievalOutput = { query, results, fallbackSourced: true, failures };
      // No external tool call → zero tokens + no costEstimate (rule #8: no energy on the fallback).
      const providerMeta: ProviderMeta = {
        provider: route.provider,
        modelId: route.modelId,
        gatewayRequestId: CURATED_FALLBACK_ID,
        tokensIn: 0,
        tokensOut: 0,
      };
      return { output, providerMeta };
    };

    if (!deps.client) {
      return curatedFallback([]);
    }
    const client = deps.client;
    const timeoutMs = timeoutFor(request.role);

    const policy: RetryPolicy<RetrievalSearchResponse> = { timeoutMs };
    if (deps.maxRetries !== undefined) policy.maxRetries = deps.maxRetries;
    if (deps.retry?.sleep) policy.sleep = deps.retry.sleep;
    if (deps.retry?.timeoutSignal) policy.timeoutSignal = deps.retry.timeoutSignal;

    const outcome = await withRetry(
      () => client.search({ query, maxResults }, { timeoutMs }),
      policy,
    );

    if (outcome.ok) {
      const response = outcome.value;
      const results: RetrievalResultItem[] = response.results.map((hit) => {
        const item: RetrievalResultItem = { kind, label: hit.label, snippet: hit.snippet };
        if (hit.uri !== undefined) item.uri = hit.uri;
        return item;
      });
      // Surface any pre-success transient failures (provider_call_failed) even though the call
      // succeeded; only the successful call is energy-bearing (costEstimate below).
      const output: RetrievalOutput = {
        query,
        results,
        fallbackSourced: false,
        failures: outcome.failures,
      };
      const providerMeta: ProviderMeta = {
        provider: route.provider,
        modelId: route.modelId,
        gatewayRequestId: response.requestId ?? LIVE_REQUEST_ID,
        tokensIn: 0,
        tokensOut: 0,
      };
      if (response.costEstimate !== undefined) {
        providerMeta.costEstimate = response.costEstimate; // tool-call cost — success-only energy
      }
      return { output, providerMeta };
    }

    // Terminal live failure → curated fallback, NEVER throw. THE divergence from P2.5/P2.6.
    return curatedFallback(outcome.failures);
  };
}

/**
 * Build a frozen `EvidenceRef` (frozen P0.5 contract — consumed, never redefined) anchored by the
 * originating `eventId` so grounding resolves WITHIN the Postgres tier (rule #7) — `uri`/`label` are
 * retained only as provenance. `eventId` is MANDATORY here (a kernel rule layered over the permissive
 * frozen schema, lesson §6): an external-only ref is never a valid output. `kind` is restricted to the
 * two retrieval kinds even though `EvidenceKind` allows more elsewhere.
 */
export function retrievalEvidenceRef(
  item: RetrievalResultItem,
  originatingEventId: string,
  kind: RetrievalKind,
): EvidenceRef {
  if (!RETRIEVAL_KINDS.has(kind)) {
    throw new Error(`retrievalEvidenceRef: unsupported kind '${kind}' (expected prior_art|signal)`);
  }
  if (originatingEventId.trim().length === 0) {
    throw new Error(
      'retrievalEvidenceRef: originatingEventId is required (Postgres-anchored, never external-only)',
    );
  }
  const ref: Record<string, unknown> = { kind, eventId: originatingEventId };
  if (item.uri !== undefined) ref.uri = item.uri;
  if (item.label.length > 0) ref.label = item.label;
  return EvidenceRef.parse(ref);
}
