import { describe, expect, test } from 'vitest';
import { EvidenceRef } from '@doppl/contracts';
import type { ModelRole, ModelRoute, ProviderCapability } from '@doppl/contracts';
import type { ModelRegistry } from '../../../../src/model-gateway/registry';
import { createGateway } from '../../../../src/model-gateway/gateway';
import {
  createRetrievalProviderCall,
  retrievalEvidenceRef,
} from '../../../../src/model-gateway/adapters/retrieval.adapter';
import type {
  RetrievalOutput,
  RetrievalResultItem,
  RetrievalSearchClient,
} from '../../../../src/model-gateway/adapters/retrieval.adapter';
import type { CuratedCorpus } from '../../../../src/model-gateway/adapters/curated-corpus';
import type { RetrievalKind } from '../../../../src/model-gateway/adapters/retrieval.adapter';
import type { RetryDeps } from '../../../../src/model-gateway/adapters/retry';

/**
 * P2.7 retrieval/web-search adapter (ARCHITECTURE.md §6/§13/§14, KEY SAFETY RULES #7 + #8 + #9).
 *
 * A pluggable live-search seam (no vendor pinned) with an operator-curated corpus fallback. DIVERGES
 * from the lesson-28 generation/embedding pattern: a terminal live failure FALLS BACK to curated
 * (tagged fallbackSourced) and NEVER throws/rejects (rehearsed demo-safety, §6 RISK-004/005). Results
 * are EvidenceRef-resolvable within the Postgres tier (anchored by eventId, rule #7); failed live
 * attempts surface in output.failures and debit NO energy (rule #8).
 */

const RETRIEVAL_ROLE: ModelRole = 'retrieval';

const NO_WAIT: RetryDeps = {
  sleep: () => Promise.resolve(),
  timeoutSignal: () => new Promise<never>(() => {}),
};

const NONE: ProviderCapability = { structuredOutputs: false, embeddings: false };

function makeRegistry(): ModelRegistry {
  const route: ModelRoute = {
    role: RETRIEVAL_ROLE,
    provider: 'web-search',
    modelId: 'web-search-default',
    capability: NONE,
    fallbackRouteIds: [],
  };
  return {
    resolve(role: ModelRole): ModelRoute {
      if (role !== RETRIEVAL_ROLE) throw new Error(`test registry has no route for ${role}`);
      return route;
    },
    capabilityFor(): ProviderCapability {
      return NONE;
    },
  };
}

const TEST_CORPUS: CuratedCorpus = [
  {
    label: 'Cross-domain transfer in ML',
    snippet: 'Applying a technique from one domain to a problem in another.',
    uri: 'https://example.test/transfer',
    keywords: ['transfer', 'domain'],
  },
];

type LiveBehavior =
  | {
      kind: 'success';
      results: { label: string; snippet: string; uri?: string }[];
      costEstimate?: number;
      requestId?: string;
    }
  | { kind: 'error'; message: string };

function makeLiveClient(behaviors: LiveBehavior[]): RetrievalSearchClient {
  let index = 0;
  return {
    search() {
      const behavior = behaviors[Math.min(index, behaviors.length - 1)];
      index += 1;
      if (!behavior) throw new Error('test fake: no behavior configured');
      if (behavior.kind === 'success') {
        return Promise.resolve({
          results: behavior.results,
          ...(behavior.costEstimate !== undefined ? { costEstimate: behavior.costEstimate } : {}),
          ...(behavior.requestId !== undefined ? { requestId: behavior.requestId } : {}),
        });
      }
      return Promise.reject(new Error(behavior.message));
    },
  };
}

const retrievalRequest = { role: RETRIEVAL_ROLE, prompt: 'transfer learning domain' } as const;

describe('retrieval adapter — live success path (§6/§13)', () => {
  // spec(§6/§13) — a live-search success returns results tagged NOT fallback, and providerMeta carries
  // the web-search tool-call cost in costEstimate (so the kernel accounts tool-call energy on success).
  test('retrieval_live_success_tagged_not_fallback', async () => {
    const client = makeLiveClient([
      {
        kind: 'success',
        results: [{ label: 'Live hit', snippet: 'fresh grounding', uri: 'https://live.test/x' }],
        costEstimate: 0.004,
        requestId: 'ret-req-1',
      },
    ]);
    const providerCall = createRetrievalProviderCall({
      registry: makeRegistry(),
      client,
      corpus: TEST_CORPUS,
      retry: NO_WAIT,
    });
    const result = await providerCall(retrievalRequest);
    const output = result.output as RetrievalOutput;
    expect(output.fallbackSourced).toBe(false);
    expect(output.results.map((r) => r.label)).toEqual(['Live hit']);
    expect(result.providerMeta.costEstimate).toBe(0.004);
    expect(result.providerMeta.tokensIn).toBe(0);
    expect(result.providerMeta.tokensOut).toBe(0);
  });

  // spec(§6/§13 / rule #8) — a live success AFTER a transient retry still surfaces the pre-success
  // failure in output.failures (for the caller's provider_call_failed events) while fallbackSourced
  // stays false; cost (energy-bearing) is reported ONLY for the successful call, not the failed attempt.
  test('retrieval_live_success_after_retry_surfaces_failures', async () => {
    const client = makeLiveClient([
      { kind: 'error', message: 'transient 500' },
      { kind: 'success', results: [{ label: 'Live hit', snippet: 'g' }], costEstimate: 0.002 },
    ]);
    const providerCall = createRetrievalProviderCall({
      registry: makeRegistry(),
      client,
      corpus: TEST_CORPUS,
      retry: NO_WAIT,
    });
    const result = await providerCall(retrievalRequest);
    const output = result.output as RetrievalOutput;
    expect(output.fallbackSourced).toBe(false); // live success, not fallback
    expect(output.failures.length).toBe(1); // the pre-success transient is surfaced
    expect(result.providerMeta.costEstimate).toBe(0.002); // cost only on the successful call
  });
});

describe('retrieval adapter — curated fallback (never rejects) (§6 RISK-004/005 / rule #8)', () => {
  // spec(§6) — NO live client configured → curated-corpus results tagged fallbackSourced; providerMeta
  // tokens 0 + costEstimate absent (no external tool call → no tool-call energy); no throw.
  test('retrieval_no_live_client_falls_back_to_curated', async () => {
    const providerCall = createRetrievalProviderCall({
      registry: makeRegistry(),
      corpus: TEST_CORPUS,
      retry: NO_WAIT,
    });
    const result = await providerCall(retrievalRequest);
    const output = result.output as RetrievalOutput;
    expect(output.fallbackSourced).toBe(true);
    expect(output.results.length).toBeGreaterThan(0);
    expect(result.providerMeta.tokensIn).toBe(0);
    expect(result.providerMeta.tokensOut).toBe(0);
    expect(result.providerMeta.costEstimate).toBeUndefined();
  });

  // spec(§6 RISK-004/005 / rule #8) — live client terminally fails (bounded retry exhausted) → FALLS
  // BACK to curated, NEVER throws; output.failures carries the per-attempt {attempt,reason} list.
  test('retrieval_live_terminal_failure_falls_back_not_rejects', async () => {
    const client = makeLiveClient([{ kind: 'error', message: 'search 503' }]);
    const providerCall = createRetrievalProviderCall({
      registry: makeRegistry(),
      client,
      corpus: TEST_CORPUS,
      retry: NO_WAIT,
    });
    const result = await providerCall(retrievalRequest); // must NOT reject
    const output = result.output as RetrievalOutput;
    expect(output.fallbackSourced).toBe(true);
    expect(output.failures.length).toBe(3); // 1 + 2 retries, all failed
    expect(output.failures.every((f) => typeof f.attempt === 'number' && f.reason.length > 0)).toBe(
      true,
    );
  });

  // spec(rule #8) — failed live attempts debit NO energy: fallback providerMeta has zero tokens + no
  // costEstimate; the failures are surfaced (>=1) for the caller's provider_call_failed events.
  test('retrieval_failed_attempts_debit_no_energy', async () => {
    const client = makeLiveClient([{ kind: 'error', message: 'rate limited' }]);
    const providerCall = createRetrievalProviderCall({
      registry: makeRegistry(),
      client,
      corpus: TEST_CORPUS,
      retry: NO_WAIT,
    });
    const result = await providerCall(retrievalRequest);
    const output = result.output as RetrievalOutput;
    expect(result.providerMeta.tokensIn).toBe(0);
    expect(result.providerMeta.tokensOut).toBe(0);
    expect(result.providerMeta.costEstimate).toBeUndefined();
    expect(output.failures.length).toBeGreaterThanOrEqual(1);
    const serialized = JSON.stringify(result);
    expect(serialized.toLowerCase()).not.toContain('energy');
  });

  // spec(§6) — a query with no curated hit returns results:[] still fallbackSourced, no throw.
  test('retrieval_empty_curated_match_returns_empty_valid', async () => {
    const providerCall = createRetrievalProviderCall({
      registry: makeRegistry(),
      corpus: TEST_CORPUS,
      retry: NO_WAIT,
    });
    const result = await providerCall({ role: RETRIEVAL_ROLE, prompt: 'zzzznomatchxyz' });
    const output = result.output as RetrievalOutput;
    expect(output.results).toEqual([]);
    expect(output.fallbackSourced).toBe(true);
  });
});

describe('retrieval adapter — EvidenceRef anchored in Postgres (rule #7 / §4)', () => {
  const item: RetrievalResultItem = {
    kind: 'prior_art',
    label: 'Cross-domain transfer in ML',
    snippet: 'Applying a technique from one domain to another.',
    uri: 'https://example.test/transfer',
  };

  // spec(§4) — the built ref is a frozen EvidenceRef anchored by eventId (Postgres-resolvable), with
  // uri/label retained as provenance — consumes the frozen P0.5 contract (never redefines it).
  test('retrieval_evidence_ref_anchored_by_event_id', () => {
    const ref = retrievalEvidenceRef(item, 'evt-123', 'prior_art');
    expect(EvidenceRef.parse(ref)).toEqual(ref); // frozen-contract conformance
    expect(ref.kind).toBe('prior_art');
    expect(ref.eventId).toBe('evt-123');
    expect(ref.uri).toBe('https://example.test/transfer'); // provenance carried
    expect(ref.label).toBe('Cross-domain transfer in ML');
  });

  // spec(rule #7) — the ref ALWAYS carries eventId (never an external-only pointer); signal kind is
  // accepted; an unsupported kind is rejected (only the two retrieval kinds are valid here).
  test('retrieval_evidence_ref_never_external_only', () => {
    const priorArt = retrievalEvidenceRef(item, 'evt-1', 'prior_art');
    const signal = retrievalEvidenceRef(item, 'evt-2', 'signal');
    expect(priorArt.eventId).toBe('evt-1');
    expect(signal.kind).toBe('signal');
    expect(signal.eventId).toBe('evt-2');
    // an item without an eventId is not a valid output of this helper
    expect(() => retrievalEvidenceRef(item, '', 'prior_art')).toThrow();
    // unsupported (non-retrieval) kind rejected, even though EvidenceKind allows it elsewhere
    expect(() => retrievalEvidenceRef(item, 'evt-3', 'trace' as RetrievalKind)).toThrow();
  });
});

describe('retrieval adapter — gateway no-schema conformance (lesson 24 / §20)', () => {
  // spec(§6/§20) — injected into the REAL createGateway (capability NONE → no-schema path), a retrieval
  // request resolves to an accepted response carrying the RetrievalOutput; the adapter never throws.
  test('retrieval_provider_call_fits_gateway_no_schema_path', async () => {
    const registry = makeRegistry();
    const providerCall = createRetrievalProviderCall({
      registry,
      corpus: TEST_CORPUS,
      retry: NO_WAIT,
    });
    const gateway = createGateway({
      providerCall,
      capabilityFor: (role) => registry.capabilityFor(role),
    });
    const response = await gateway.call(retrievalRequest);
    expect(response.accepted).toBe(true);
    expect(response.validationResult).toBe('accepted');
    const output = response.output as RetrievalOutput;
    expect(output.fallbackSourced).toBe(true);
    expect(output.query).toBe('transfer learning domain');
  });
});
