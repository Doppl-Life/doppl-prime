import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isPrivateHost, type ToolExecutorDeps } from '../model-gateway';

/**
 * Real tool-execution IO seams (tool-use TU.5, KEY SAFETY RULE #3 — the live counterpart of the injected
 * `ToolExecutorDeps`). These close the SSRF-hardening obligations the pure executors documented:
 *  - `resolveHostIsPublic`: resolves a hostname to ALL its A/AAAA records and requires EVERY one to be
 *    public (a single private record fails the check — defeats split-horizon / multi-record rebinding);
 *    an IP-literal input is canonicalized through the same private-range guard; a lookup error fails closed.
 *  - `httpGet`: fetches with `redirect:'manual'` so a public URL can NEVER 30x-redirect to a private host
 *    (the executor guards + resolves only the INITIAL url); a per-call timeout bounds it (finiteness).
 *  - `webSearch`: a grounded search via OpenRouter's `web` plugin (Option A — no new keys), the key
 *    env-only (rule #4) and closed over the seam, never returned.
 * Every primitive (fetch / dns lookup) is INJECTED so the seams are deterministically unit-testable.
 *
 * RESIDUAL (accepted for the MVP): a resolve→connect TOCTOU window remains — `httpGet` re-resolves the
 * hostname when it connects, so a hostile DNS could answer public to the resolver and private to the fetch.
 * Closing it fully needs connecting to the validated IP with a Host header (a hardening follow-up); the
 * manual-redirect + all-records-resolve already block the common SSRF vectors.
 */

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 30_000;
const DEFAULT_WEB_SEARCH_MODEL = 'openai/gpt-4o-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
/** Bound the raw body we read into memory (the tool registry truncates further before re-injection). */
const MAX_FETCH_BODY_BYTES = 256 * 1024;

export type DnsLookupAll = (hostname: string) => Promise<readonly { address: string }[]>;

/** resolveHostIsPublic — all-records DNS check + IP-literal canonicalization; fail-closed (rule #3). */
export function createResolveHostIsPublic(
  lookupAll: DnsLookupAll,
): (hostname: string) => Promise<boolean> {
  return async (hostname) => {
    if (isIP(hostname) !== 0) return !isPrivateHost(hostname); // an IP literal — canonicalize, no DNS needed
    let records: readonly { address: string }[];
    try {
      records = await lookupAll(hostname);
    } catch {
      return false; // a resolution error fails closed
    }
    if (records.length === 0) return false;
    return records.every((record) => !isPrivateHost(record.address)); // EVERY A/AAAA must be public
  };
}

/** httpGet — a redirect-non-following, timeout-bounded, body-size-bounded GET (the executor SSRF-guards
 *  the url first). The body is STREAM-read with a hard byte cap so a large/hostile endpoint can never
 *  buffer more than `MAX_FETCH_BODY_BYTES` into memory (the timeout alone doesn't bound bandwidth). */
export function createSafeHttpGet(
  fetchFn: typeof fetch,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): (url: string) => Promise<{ status: number; text: string }> {
  return async (url) => {
    const response = await fetchFn(url, {
      redirect: 'manual', // NEVER follow a redirect to an unguarded host (redirect-SSRF)
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      return { status: response.status, text: '[redirect not followed — SSRF guard]' };
    }
    const text = await readBounded(response, MAX_FETCH_BODY_BYTES);
    return { status: response.status, text };
  };
}

/** Stream-read a Response body, stopping at `maxBytes` (never buffers the whole body — DoS bound). Falls
 *  back to `text()` when no stream body is exposed (e.g. a test fake), still capping the result. */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const stream = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (stream === null || stream === undefined || typeof stream.getReader !== 'function') {
    return (await response.text()).slice(0, maxBytes);
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        total += value.length;
        text += decoder.decode(value, { stream: true });
        if (total >= maxBytes) {
          await reader.cancel(); // stop pulling bytes — bound the memory footprint
          break;
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  text += decoder.decode();
  return text.slice(0, maxBytes);
}

/** webSearch — a grounded OpenRouter completion with the `web` plugin (Option A; key env-only, rule #4). */
export function createWebSearch(deps: {
  fetchFn: typeof fetch;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}): (query: string) => Promise<string> {
  const model = deps.model ?? DEFAULT_WEB_SEARCH_MODEL;
  const baseUrl = deps.baseUrl ?? OPENROUTER_BASE_URL;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_WEB_SEARCH_TIMEOUT_MS;
  return async (query) => {
    const response = await deps.fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: query }],
        plugins: [{ id: 'web' }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  };
}

export interface ToolSeamConfig {
  /** Outbound fetch primitive (default the global `fetch`). Injected for tests. */
  readonly fetchFn?: typeof fetch;
  /** All-records DNS lookup (default `dns.lookup` with `{all:true}`). Injected for tests. */
  readonly lookupAll?: DnsLookupAll;
  /** The OpenRouter key for `webSearch` (env-only, rule #4). Absent → no `webSearch` seam (a web_search
   *  tool call then fails safe to `tool_unavailable`). */
  readonly openRouterApiKey?: string;
  readonly webSearchModel?: string;
}

/** Assemble the live {@link ToolExecutorDeps} from injected primitives (the boot root supplies env-derived ones). */
export function createToolExecutorSeams(config: ToolSeamConfig = {}): ToolExecutorDeps {
  const fetchFn = config.fetchFn ?? fetch;
  const lookupAll: DnsLookupAll =
    config.lookupAll ?? ((hostname) => dnsLookup(hostname, { all: true }));
  const httpGet = createSafeHttpGet(fetchFn);
  const resolveHostIsPublic = createResolveHostIsPublic(lookupAll);
  if (config.openRouterApiKey !== undefined && config.openRouterApiKey !== '') {
    return {
      httpGet,
      resolveHostIsPublic,
      webSearch: createWebSearch({
        fetchFn,
        apiKey: config.openRouterApiKey,
        ...(config.webSearchModel !== undefined ? { model: config.webSearchModel } : {}),
      }),
    };
  }
  return { httpGet, resolveHostIsPublic };
}
