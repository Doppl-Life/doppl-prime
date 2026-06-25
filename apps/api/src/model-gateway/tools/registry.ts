import type { ToolDescriptor, ToolName } from '@doppl/contracts';
import { assertSafeFetchUrl, unbracketHost } from './ssrf';

/**
 * Tool registry (tool-use TU.3, KEY SAFETY RULE #3 — no arbitrary code execution). The agent-research
 * tool allowlist, modelled on the check-runner registry (lesson §11/§39): TWO closed, frozen surfaces —
 *  - {@link TOOL_REGISTRY}: the offered descriptors (each carries the frozen contract `ToolDescriptor`
 *    {name, description} — non-executing BY SHAPE — plus the JSON-schema `parameters` offered to the model).
 *  - {@link TOOL_IMPLS}: the PARALLEL executor-impl map keyed by the same `ToolName`. The descriptor carries
 *    no code, so the executor lives here; a name present in one map but not the other does NOT resolve.
 * The gate is the frozen, fail-safe {@link resolveTool} (own-property lookup — an unregistered/unimplemented
 * tool resolves to a skip, NEVER executes; defeats `__proto__`/`constructor` probes). No runtime register
 * path. The EXECUTION dependencies (real HTTP, real grounded search) are INJECTED ({@link ToolExecutorDeps})
 * — the real impls are wired at boot (the tool-orchestrating gateway); rule #9: no vendor type here.
 *
 * Slice-3 offered set: `web_search` + `fetch_url`. `x_search` + `youtube_search` (the platform adapters)
 * land in a later slice; until then `resolveTool('x_search')` fails safe (unavailable), never executes.
 */

/** The result of executing a tool. `content` is DATA (the orchestrator wraps it via `wrapUntrusted`). */
export interface ToolExecutionResult {
  /** true = a usable result; false = skipped/blocked/failed (still re-injected to the model as DATA). */
  readonly ok: boolean;
  readonly content: string;
}

/**
 * Injected IO seams the executors need (real impls wired at boot; faked in tests). Rule #9: no vendor type.
 *
 * `httpGet` + `resolveHostIsPublic` are wired as a PAIR — `fetch_url` fails closed if either is missing
 * (the resolver is the ONLY SSRF defense for a non-IP hostname that resolves to a private IP; the literal
 * `assertSafeFetchUrl` guard passes every domain by design). The BOOT-WIRED real impls MUST additionally:
 *  - `httpGet`: DISABLE redirect-following OR re-guard (assertSafeFetchUrl + resolve) every hop — a public
 *    URL can 30x-redirect to a private host; CONNECT to the validated IP (or re-guard at the socket) to
 *    close the resolve→connect TOCTOU window; enforce a per-call TIMEOUT (finiteness).
 *  - `resolveHostIsPublic`: resolve + verify EVERY resolved address (all A AND AAAA records), and
 *    canonicalize an IP-literal input through the same private-range check; fail closed on a lookup error.
 *  - `webSearch`: enforce a per-call timeout.
 * These over-approximated obligations are the wiring slice's job (they cannot be enforced from the pure
 * executor here).
 */
export interface ToolExecutorDeps {
  /** A safe outbound HTTP GET — the executor SSRF-guards the URL FIRST (+ requires the resolver), then calls this. */
  readonly httpGet?: (url: string) => Promise<{ status: number; text: string }>;
  /** DNS-rebinding defense (REQUIRED to fetch): resolve a hostname + report whether EVERY resolved address is public. */
  readonly resolveHostIsPublic?: (hostname: string) => Promise<boolean>;
  /** Run a grounded web search (real impl = an OpenRouter web-plugin completion). Returns the grounded text. */
  readonly webSearch?: (query: string) => Promise<string>;
}

export type ToolExecutor = (args: unknown, deps: ToolExecutorDeps) => Promise<ToolExecutionResult>;

/** A registered tool's OFFERED surface: the frozen contract descriptor + the model-facing JSON-schema params. */
export interface ToolSpec {
  readonly descriptor: ToolDescriptor;
  readonly parameters: Record<string, unknown>;
}

export type ResolvedTool =
  | { readonly ok: true; readonly name: ToolName; readonly execute: ToolExecutor }
  | { readonly ok: false; readonly reason: 'unregistered_tool' };

/** A tool result re-entering the model wastes tokens unbounded; cap it with a marker (the loop also truncates). */
const TOOL_RESULT_MAX_CHARS = 8_000;
function truncate(text: string): string {
  return text.length <= TOOL_RESULT_MAX_CHARS
    ? text
    : `${text.slice(0, TOOL_RESULT_MAX_CHARS)}…[truncated]`;
}

function fail(content: string): ToolExecutionResult {
  return { ok: false, content };
}

/** Recursively freeze an object graph (defense-in-depth so a nested descriptor/parameters can't be mutated). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function stringField(args: unknown, key: string): string | null {
  if (typeof args !== 'object' || args === null) return null;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * fetch_url — fetch + read a PUBLIC web page. Two-layer SSRF defense: the pure {@link assertSafeFetchUrl}
 * literal gate (scheme/credentials/IP-literal), THEN the injected `resolveHostIsPublic` DNS-rebinding check
 * (a public hostname that resolves to a private IP). Only after BOTH pass does it call the injected
 * `httpGet`. Fail-safe: bad args / blocked host / missing seam / transport error → `ok:false` DATA, never a throw.
 */
const fetchUrlExecutor: ToolExecutor = async (args, deps) => {
  const url = stringField(args, 'url');
  if (url === null) return fail('invalid_arguments: expected { url: string }');
  const guard = assertSafeFetchUrl(url);
  if (!guard.ok) return fail(`blocked: ${guard.reason}`);
  // FAIL CLOSED unless BOTH seams are wired: the literal guard passes every domain by design, so the
  // resolver is the only defense for a DNS-name that resolves to a private IP — a missing resolver must
  // never silently skip the rebinding check (security-reviewer [high]). They are wired as a pair at boot.
  if (deps.httpGet === undefined || deps.resolveHostIsPublic === undefined) {
    return fail('tool_unavailable: fetch seams not wired');
  }
  let isPublic: boolean;
  try {
    isPublic = await deps.resolveHostIsPublic(unbracketHost(new URL(guard.url).hostname));
  } catch {
    isPublic = false; // a resolution error fails closed
  }
  if (!isPublic) return fail('blocked: private_host (resolved)');
  try {
    const res = await deps.httpGet(guard.url);
    return { ok: true, content: truncate(res.text) };
  } catch {
    return fail('fetch_failed');
  }
};

/**
 * web_search — a grounded web search (Option A: gateway-orchestrated via the injected `webSearch` seam, NO
 * new keys; the real impl is an OpenRouter web-plugin completion wired at boot). Fail-safe like fetch_url.
 */
const webSearchExecutor: ToolExecutor = async (args, deps) => {
  const query = stringField(args, 'query');
  if (query === null) return fail('invalid_arguments: expected { query: string }');
  if (!deps.webSearch) return fail('tool_unavailable: no search seam');
  try {
    return { ok: true, content: truncate(await deps.webSearch(query)) };
  } catch {
    return fail('search_failed');
  }
};

const WEB_SEARCH_PARAMS = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'The web search query (current, factual research).' },
  },
  required: ['query'],
  additionalProperties: false,
};

const FETCH_URL_PARAMS = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'A public http(s) URL to fetch and read.' },
  },
  required: ['url'],
  additionalProperties: false,
};

/** The frozen offered-descriptor allowlist (rule #3) — deep-frozen so nested descriptors/params are immutable. */
export const TOOL_REGISTRY: Readonly<Partial<Record<ToolName, ToolSpec>>> = deepFreeze({
  web_search: {
    descriptor: {
      name: 'web_search',
      description: 'Search the public web for current, factual information to ground an idea.',
    },
    parameters: WEB_SEARCH_PARAMS,
  },
  fetch_url: {
    descriptor: {
      name: 'fetch_url',
      description: 'Fetch and read the contents of a public http(s) URL.',
    },
    parameters: FETCH_URL_PARAMS,
  },
});

/** The frozen PARALLEL executor-impl map (rule #3 — the descriptor carries no code, the impl lives here). */
export const TOOL_IMPLS: Readonly<Partial<Record<ToolName, ToolExecutor>>> = Object.freeze({
  web_search: webSearchExecutor,
  fetch_url: fetchUrlExecutor,
});

/** The descriptors to OFFER the model on a population_generator request (`ModelGatewayRequest.tools`). */
export function offeredToolDescriptors(): ToolDescriptor[] {
  return Object.values(TOOL_REGISTRY).map((spec) => spec.descriptor);
}

/**
 * The fail-safe allowlist gate (rule #3). Pure: own-property lookup on BOTH maps (an adversarial
 * `__proto__`/`constructor` resolves to neither), never executes, never throws. A registered+implemented
 * tool → its executor; anything else → `unregistered_tool` (the orchestrator re-injects a fixed skip).
 */
export function resolveTool(name: string): ResolvedTool {
  if (
    Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, name) &&
    Object.prototype.hasOwnProperty.call(TOOL_IMPLS, name)
  ) {
    const execute = TOOL_IMPLS[name as ToolName];
    if (execute !== undefined) {
      return { ok: true, name: name as ToolName, execute };
    }
  }
  return { ok: false, reason: 'unregistered_tool' };
}
