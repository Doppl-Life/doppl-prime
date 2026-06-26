import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import {
  assertSafeFetchUrl,
  isPrivateHost,
  unbracketHost,
  type ToolExecutorDeps,
} from '../model-gateway';
import { mapLimit } from '../concurrency/pLimit';

/**
 * Real tool-execution IO seams (tool-use TU.5, KEY SAFETY RULE #3 — the live counterpart of the injected
 * `ToolExecutorDeps`). These close the SSRF-hardening obligations the pure executors documented:
 *  - `resolveAddresses` / `resolveHostIsPublic`: resolve a hostname to ALL its A/AAAA records and require
 *    EVERY one to be public (a single private record fails — defeats split-horizon / multi-record rebinding);
 *    an IP-literal input is canonicalized through the same private-range guard; a lookup error fails closed.
 *    `resolveAddresses` additionally RETURNS the validated public IPs so the fetch can pin to one.
 *  - `httpGet`: FOLLOWS redirects safely — it re-runs the literal SSRF gate AND the all-records DNS check on
 *    EVERY hop (so a public URL can never 30x-redirect into a private host), bounds the hop count + body
 *    size + per-call time, and pins each connection to the freshly-validated IP.
 *  - `webSearch`: a grounded search via OpenRouter's `web` plugin (Option A — no new keys), the key
 *    env-only (rule #4) and closed over the seam, never returned.
 * Every primitive (pinned fetch / dns lookup) is INJECTED so the seams are deterministically unit-testable.
 *
 * The resolve→connect TOCTOU is now CLOSED: `createPinnedFetch` connects to the exact IP that
 * `resolveAddresses` validated (node's `lookup` hook) while the TLS SNI + Host header keep the hostname, so a
 * rebinding DNS that answered "public" to the resolver cannot be re-resolved to a private IP at connect time.
 */

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
/** Max 30x hops a single fetch_url will follow before giving up (loop bound). */
const DEFAULT_MAX_REDIRECTS = 5;
/** A browser-ish UA so content sites don't serve a bot-block page to the agent's reader. */
const FETCH_USER_AGENT =
  'Mozilla/5.0 (compatible; DopplResearchBot/1.0; +https://github.com/doppl)';
const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 30_000;
const DEFAULT_WEB_SEARCH_MODEL = 'openai/gpt-4o-mini';
/** TU.7 — the web plugin enables BOTH web + X search for xAI models (live-verified: grok-4.3 + the `web`
 *  plugin returns real X post citations). `grok-4.1-fast` was DEPRECATED → a silent 404 = x_search "returned
 *  nothing"; keep this pinned to a current xAI model (the silent-empty is now also thrown loudly below). */
const DEFAULT_X_SEARCH_MODEL = 'x-ai/grok-4.3';
/** Frame the agent's topic for X — grok+web only pulls actual X posts when the query targets X discussion
 *  (live-verified: a bare topic → a generic web explainer; an X-framed query → real x.com post citations). */
const X_SEARCH_QUERY_PREFIX =
  'On X (Twitter), find the current posts, discussion, reactions, and sentiment about the following topic, ' +
  'and cite the specific posts you find. Topic: ';
/** TU.7 — Gemini natively INGESTS a YouTube `video_url` (live-verified: it transcribes the real audio,
 *  e.g. returns exact sung lyrics — not a hallucinated summary). Also used for grounded URL discovery. */
const DEFAULT_YOUTUBE_MODEL = 'google/gemini-2.5-flash';
/** How many SUCCESSFULLY-transcribed videos to surface (the model can't ingest some videos — live-verified
 *  it's video-specific, not random — so we want a few good transcripts, not a fixed attempt count). */
const DEFAULT_YOUTUBE_MAX_VIDEOS = 2;
/** How many discovered candidates to ATTEMPT (> maxVideos so a couple of un-ingestable videos don't starve
 *  the result; each is a separate native-video model call, bounded by maxToolCalls upstream). */
const DEFAULT_YOUTUBE_DISCOVER_COUNT = 4;
/** Max videos ingested concurrently (each is one provider round-trip; bounded for rate-limit politeness). */
const DEFAULT_YOUTUBE_CONCURRENCY = 2;
/** Per-video transcript cap so a few long videos can't crowd out the others before the 8 KB registry cap. */
const YOUTUBE_PER_VIDEO_MAX_CHARS = 2_500;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
/** Bound the raw body we read into memory (the tool registry truncates further before re-injection). */
const MAX_FETCH_BODY_BYTES = 256 * 1024;

export type DnsLookupAll = (hostname: string) => Promise<readonly { address: string }[]>;

/** A single pinned GET: connect to `pinnedIp`, do NOT follow redirects, return status + Location + body. */
export type PinnedFetch = (
  url: string,
  pinnedIp: string,
) => Promise<{ status: number; location?: string; text: string }>;

/**
 * resolveAddresses — the DNS-rebinding primitive that ALSO returns the validated IPs (for connection
 * pinning). All-records public → the addresses; ANY private record / IP-literal-private / lookup error /
 * empty → null (fail-closed, rule #3). An IP literal is canonicalized without DNS.
 */
export function createResolveAddresses(
  lookupAll: DnsLookupAll,
): (hostname: string) => Promise<string[] | null> {
  return async (hostname) => {
    if (isIP(hostname) !== 0) return isPrivateHost(hostname) ? null : [hostname]; // IP literal — no DNS
    let records: readonly { address: string }[];
    try {
      records = await lookupAll(hostname);
    } catch {
      return null; // a resolution error fails closed
    }
    if (records.length === 0) return null;
    if (records.some((record) => isPrivateHost(record.address))) return null; // EVERY A/AAAA must be public
    return records.map((record) => record.address);
  };
}

/** resolveHostIsPublic — the boolean view of {@link createResolveAddresses} (single-sourced; rule #3). */
export function createResolveHostIsPublic(
  lookupAll: DnsLookupAll,
): (hostname: string) => Promise<boolean> {
  const resolveAddresses = createResolveAddresses(lookupAll);
  return async (hostname) => (await resolveAddresses(hostname)) !== null;
}

/**
 * httpGet — a SAFE redirect-FOLLOWING GET (rule #3). The executor SSRF-guards the initial URL; this seam
 * then, on every hop: (1) re-runs the literal {@link assertSafeFetchUrl} gate, (2) re-runs the all-records
 * DNS publicness check via `resolveAddresses`, and (3) calls `fetchPinned` PINNED to the freshly-validated
 * IP (closing the resolve→connect TOCTOU). A blocked hop / exhausted redirect budget throws (the executor
 * maps it to `fetch_failed`, ok:false — no energy). Pure over the two injected primitives → unit-testable.
 */
export function createSafeHttpGet(deps: {
  resolveAddresses: (hostname: string) => Promise<string[] | null>;
  fetchPinned: PinnedFetch;
  maxRedirects?: number;
}): (url: string) => Promise<{ status: number; text: string }> {
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  return async (url) => {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const guard = assertSafeFetchUrl(current); // literal gate EACH hop (scheme / creds / IP-literal host)
      if (!guard.ok) throw new Error(`blocked: ${guard.reason}`);
      const addresses = await deps.resolveAddresses(unbracketHost(new URL(guard.url).hostname));
      if (addresses === null || addresses.length === 0)
        throw new Error('blocked: private_host (resolved)');
      const response = await deps.fetchPinned(guard.url, addresses[0]!); // pin to a validated IP (TOCTOU close)
      if (response.status >= 300 && response.status < 400 && response.location !== undefined) {
        current = new URL(response.location, guard.url).href; // resolve relative; re-validated next iteration
        continue;
      }
      return { status: response.status, text: response.text };
    }
    throw new Error('blocked: too_many_redirects');
  };
}

/**
 * createPinnedFetch — the real {@link PinnedFetch}: a node http/https GET whose socket is PINNED to the
 * pre-validated IP via the `lookup` hook (so connect performs NO second DNS resolution — the TOCTOU close)
 * while the request's Host header + TLS SNI keep the original hostname. Redirects are NOT followed (the loop
 * re-validates each hop). The body is stream-read with a hard byte cap (a slow/huge endpoint can't exhaust
 * memory) and a per-call timeout bounds it (finiteness). This is the un-injected IO leaf (faked in tests).
 */
export function createPinnedFetch(opts?: { timeoutMs?: number; maxBytes?: number }): PinnedFetch {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = opts?.maxBytes ?? MAX_FETCH_BODY_BYTES;
  return (url, pinnedIp) =>
    new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const transport = parsed.protocol === 'https:' ? https : http;
      const family = isIP(pinnedIp) === 6 ? 6 : 4; // 0 only on a malformed IP, which the resolver never returns
      const request = transport.request(
        url,
        {
          method: 'GET',
          // Pin the socket to the validated IP — node calls this INSTEAD of a fresh DNS resolution at connect.
          // `net` may invoke it with `{all:true}` (→ array callback) or the scalar form; support both.
          lookup: (
            _hostname: string,
            options: { all?: boolean | undefined },
            callback: unknown,
          ) => {
            if (options.all === true) {
              (callback as (e: null, a: { address: string; family: number }[]) => void)(null, [
                { address: pinnedIp, family },
              ]);
            } else {
              (callback as (e: null, a: string, f: number) => void)(null, pinnedIp, family);
            }
          },
          headers: { 'user-agent': FETCH_USER_AGENT, accept: 'text/html,*/*' },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          const chunks: Buffer[] = [];
          let total = 0;
          let settled = false;
          const finish = (): void => {
            if (settled) return;
            settled = true;
            resolve({
              status,
              ...(location !== undefined ? { location } : {}),
              text: Buffer.concat(chunks).toString('utf-8').slice(0, maxBytes),
            });
          };
          response.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total <= maxBytes) chunks.push(chunk);
            else {
              chunks.push(chunk.subarray(0, Math.max(0, maxBytes - (total - chunk.length))));
              response.destroy(); // stop pulling bytes — bound the memory footprint
              finish(); // 'end' won't fire after destroy → resolve with what we have
            }
          });
          response.on('end', finish);
          response.on('close', finish); // also covers the destroy path
          response.on('error', (error) => {
            if (!settled) reject(error);
          });
        },
      );
      request.setTimeout(timeoutMs, () => request.destroy(new Error('fetch_timeout')));
      request.on('error', reject);
      request.end();
    });
}

/**
 * A grounded OpenRouter completion with the `web` plugin (Option A — NO new keys; key env-only, rule #4,
 * in the Authorization header only). web_search / x_search / youtube_search all use this, differing only by
 * model (and an optional query prefix / extra body params, e.g. xAI's `x_search_filter`). The `web` plugin
 * additionally enables X search for xAI models + web grounding for Gemini. Per-call timeout (finiteness).
 */
export function createGroundedSearch(deps: {
  fetchFn: typeof fetch;
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  queryPrefix?: string;
  extraBody?: Record<string, unknown>;
}): (query: string) => Promise<string> {
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
        model: deps.model,
        messages: [{ role: 'user', content: `${deps.queryPrefix ?? ''}${query}` }],
        plugins: [{ id: 'web' }],
        ...(deps.extraBody ?? {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await response.json()) as GroundedCompletion;
    // FAIL LOUDLY on an API error (e.g. a DEPRECATED model → 404). The old `content ?? ''` swallowed this
    // to an empty string, so x_search silently "returned nothing" for months. Throwing → the executor
    // surfaces `<tool>_failed` (ok:false → no energy debit, rule #8) instead of a silent void. The thrown
    // message is the provider's own (no key — rule #4) and is discarded by the executor's catch.
    if (data.error !== undefined) {
      throw new Error(
        `grounded_search_error${data.error.code !== undefined ? ` ${data.error.code}` : ''}: ${
          data.error.message ?? 'unknown'
        }`,
      );
    }
    const message = data.choices?.[0]?.message;
    return appendCitationSources(message?.content ?? '', message?.annotations);
  };
}

/** The (partial) OpenRouter chat-completion shape this seam reads — content + web-plugin `url_citation`s. */
interface GroundedCompletion {
  readonly error?: { readonly message?: string; readonly code?: number | string };
  readonly choices?: {
    readonly message?: { readonly content?: string; readonly annotations?: unknown };
  }[];
}

/** Pull the URLs out of the web plugin's `url_citation` annotations (shape `{type, url_citation:{url}}`). */
export function extractCitationUrls(annotations: unknown): string[] {
  if (!Array.isArray(annotations)) return [];
  const urls: string[] = [];
  for (const annotation of annotations) {
    const url = (annotation as { url_citation?: { url?: unknown } })?.url_citation?.url;
    if (typeof url === 'string' && url.length > 0 && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/** Append a deduped `Sources:` list of the grounding citation URLs so the agent gets concrete links to cite. */
function appendCitationSources(content: string, annotations: unknown): string {
  const urls = extractCitationUrls(annotations);
  if (urls.length === 0) return content;
  const sources = `Sources:\n${urls.map((url) => `- ${url}`).join('\n')}`;
  return content.length > 0 ? `${content}\n\n${sources}` : sources;
}

/** webSearch — a grounded web completion (the default `web_search` seam). */
export function createWebSearch(deps: {
  fetchFn: typeof fetch;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}): (query: string) => Promise<string> {
  return createGroundedSearch({ ...deps, model: deps.model ?? DEFAULT_WEB_SEARCH_MODEL });
}

/** Matches every YouTube video form (watch?…v= / youtu.be / shorts / embed / v) anchored to a YouTube host
 *  so a non-YouTube `?v=<11chars>` (e.g. `example.com/watch?v=notyoutube1`) is NOT mistaken for a video. */
const YOUTUBE_VIDEO_RE =
  /(?:youtube\.com\/watch\?[^\s"')]*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/gi;

/** Extract the YouTube video ids from arbitrary text + canonicalize to watch URLs, deduped (any URL form). */
export function extractYoutubeUrls(text: string): string[] {
  if (typeof text !== 'string') return [];
  const ids: string[] = [];
  for (const match of text.matchAll(YOUTUBE_VIDEO_RE)) {
    const id = match[1];
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => `https://www.youtube.com/watch?v=${id}`);
}

/** The TRUSTED, candidate-independent instruction for native video ingestion. NO "if you can't, say X"
 *  escape hatch — live-verified that offering one makes Gemini FALSELY decline (VIDEO_UNAVAILABLE) even
 *  when it can transcribe; a direct "report the actual content" prompt reliably transcribes the real audio. */
const YOUTUBE_INGEST_INSTRUCTION =
  'You are watching the linked YouTube video. Report its ACTUAL content: transcribe or closely paraphrase ' +
  'the key spoken points, and list the concrete claims, facts, figures, techniques, and notable quotes as ' +
  'they are really presented. Be specific and faithful to what is actually said or shown in the video.';

function truncatePerVideo(text: string): string {
  return text.length <= YOUTUBE_PER_VIDEO_MAX_CHARS
    ? text
    : `${text.slice(0, YOUTUBE_PER_VIDEO_MAX_CHARS)}…[truncated]`;
}

/** Detects the model DECLINING to ingest a video ("I cannot access/watch/process this video …") near the
 *  start of its reply, so a refusal is never surfaced as if it were a real transcript. Live-verified: some
 *  videos are reliably un-ingestable, and Gemini answers with this kind of prose rather than failing. */
const VIDEO_REFUSAL_RE =
  /\b(cannot|can'?t|unable to|not able to|do(?:es)? not have|don'?t have|no ability|my (?:current )?capabilities)\b[^.]{0,60}\b(access|process|watch|play|view|video|link|external|directly)\b/i;
export function isVideoRefusal(content: string): boolean {
  return VIDEO_REFUSAL_RE.test(content.slice(0, 300));
}

/**
 * youtube_search seam (TU.7). The OLD seam asked Gemini to "find and summarize" videos → ungrounded model
 * summaries (NOT transcripts). This rewrite mirrors how a human researches video: (1) DISCOVER real watch
 * URLs via a web-grounded search (the `web` plugin returns current, real videos — not hallucinated ids),
 * then (2) INGEST each video IN PARALLEL through Gemini's native `video_url` part (the model watches the
 * actual video — live-verified it transcribes real audio, e.g. exact lyrics), then (3) COMBINE. Each step
 * is an injected-`fetchFn` HTTP call (key env-only, rule #4) → deterministic + unit-testable. A per-video
 * failure is isolated (skipped, never sinks the batch); replay reads the persisted tool result (rule #7).
 */
export function createYoutubeResearch(deps: {
  fetchFn: typeof fetch;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxVideos?: number;
  discoverCount?: number;
  concurrency?: number;
}): (query: string) => Promise<string> {
  const model = deps.model ?? DEFAULT_YOUTUBE_MODEL;
  const baseUrl = deps.baseUrl ?? OPENROUTER_BASE_URL;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_WEB_SEARCH_TIMEOUT_MS;
  const maxVideos = deps.maxVideos ?? DEFAULT_YOUTUBE_MAX_VIDEOS;
  const discoverCount = deps.discoverCount ?? DEFAULT_YOUTUBE_DISCOVER_COUNT;
  const concurrency = deps.concurrency ?? DEFAULT_YOUTUBE_CONCURRENCY;

  // Discovery reuses the grounded-search seam (web plugin + loud-on-error); the prompt asks for real watch
  // URLs, which `extractYoutubeUrls` parses out of the returned text (incl. any appended citation sources).
  const discover = createGroundedSearch({
    fetchFn: deps.fetchFn,
    apiKey: deps.apiKey,
    model,
    baseUrl,
    timeoutMs,
    queryPrefix:
      `Find up to ${discoverCount} real, currently-available YouTube videos that best explain or demonstrate ` +
      'the topic below. Return ONLY their full https://www.youtube.com/watch?v=… URLs, one per line.\n\nTopic: ',
  });

  /** Ingest ONE video via Gemini's native `video_url` part. Fail-soft: any error / empty / VIDEO_UNAVAILABLE
   *  → null (skipped) so a single bad video never sinks the whole batch. No web plugin (direct ingestion). */
  const ingestVideo = async (url: string): Promise<string | null> => {
    try {
      const response = await deps.fetchFn(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: YOUTUBE_INGEST_INSTRUCTION },
                { type: 'video_url', video_url: { url } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = (await response.json()) as GroundedCompletion;
      if (data.error !== undefined) return null;
      const content = data.choices?.[0]?.message?.content ?? '';
      // A blank reply OR a refusal ("I cannot watch this video…") is NOT a transcript → skip it, so refusal
      // prose never masquerades as real content (the agent would otherwise treat it as grounding DATA).
      return content.trim() === '' || isVideoRefusal(content) ? null : content;
    } catch {
      return null;
    }
  };

  return async (query) => {
    const discovered = await discover(query); // throws on a discovery API error → executor reports failure
    // ATTEMPT up to discoverCount candidates (> maxVideos), ingest in parallel, then KEEP the first maxVideos
    // that actually transcribed — so a couple of un-ingestable videos don't starve the result.
    const urls = extractYoutubeUrls(discovered).slice(0, discoverCount);
    if (urls.length === 0) return 'youtube_search found no usable videos for this query.';
    const ingested = await mapLimit(urls, concurrency, async (url) => ({
      url,
      content: await ingestVideo(url),
    }));
    const usable = ingested
      .filter((result): result is { url: string; content: string } => result.content !== null)
      .slice(0, maxVideos);
    if (usable.length === 0) {
      return `youtube_search found ${urls.length} candidate video(s) for this query but none could be transcribed.`;
    }
    return `Researched ${usable.length} YouTube video(s) for "${query}":\n\n${usable
      .map((result) => `Video: ${result.url}\n${truncatePerVideo(result.content)}`)
      .join('\n\n')}`;
  };
}

export interface ToolSeamConfig {
  /** Outbound fetch primitive for the grounded-search seams (default the global `fetch`). Injected for tests. */
  readonly fetchFn?: typeof fetch;
  /** Pinned GET primitive for fetch_url (default {@link createPinnedFetch}). Injected for tests. */
  readonly fetchPinned?: PinnedFetch;
  /** All-records DNS lookup (default `dns.lookup` with `{all:true}`). Injected for tests. */
  readonly lookupAll?: DnsLookupAll;
  /** The OpenRouter key for the grounded-search seams (env-only, rule #4). Absent → no web_search/x_search/
   *  youtube_search seams (those tool calls then fail safe to `tool_unavailable`). */
  readonly openRouterApiKey?: string;
  readonly webSearchModel?: string;
  readonly xSearchModel?: string;
  readonly youtubeModel?: string;
}

/** Assemble the live {@link ToolExecutorDeps} from injected primitives (the boot root supplies env-derived ones). */
export function createToolExecutorSeams(config: ToolSeamConfig = {}): ToolExecutorDeps {
  const fetchFn = config.fetchFn ?? fetch;
  const lookupAll: DnsLookupAll =
    config.lookupAll ?? ((hostname) => dnsLookup(hostname, { all: true }));
  const resolveAddresses = createResolveAddresses(lookupAll);
  const httpGet = createSafeHttpGet({
    resolveAddresses,
    fetchPinned: config.fetchPinned ?? createPinnedFetch(),
  });
  const resolveHostIsPublic = createResolveHostIsPublic(lookupAll);
  if (config.openRouterApiKey !== undefined && config.openRouterApiKey !== '') {
    const apiKey = config.openRouterApiKey;
    return {
      httpGet,
      resolveHostIsPublic,
      webSearch: createWebSearch({
        fetchFn,
        apiKey,
        ...(config.webSearchModel !== undefined ? { model: config.webSearchModel } : {}),
      }),
      xSearch: createGroundedSearch({
        fetchFn,
        apiKey,
        model: config.xSearchModel ?? DEFAULT_X_SEARCH_MODEL,
        queryPrefix: X_SEARCH_QUERY_PREFIX,
      }),
      youtubeSearch: createYoutubeResearch({
        fetchFn,
        apiKey,
        ...(config.youtubeModel !== undefined ? { model: config.youtubeModel } : {}),
      }),
    };
  }
  return { httpGet, resolveHostIsPublic };
}
