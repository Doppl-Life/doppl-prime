# Tool-Use & Research (TU.1)

## Executive summary

Before an agent in Doppl invents an idea, it can now do its own homework. The **TU.1 amendment** (the `schemaVersion 9 → 10` bump) gives a `population_generator` agent a small, fixed set of research tools — `web_search`, `fetch_url`, `x_search`, `youtube_search` — and a loop that lets the model *ask* to use one, get the result back, and keep going until it is ready to write its idea. The point is grounding: an agent that has actually read current web pages, X discussion, and YouTube transcripts produces a more specific, evidence-backed candidate than one working from the model's memory alone.

This is a deliberately *narrow* and *defended* capability. The tools are a **closed 4-member allowlist** — an unlisted tool is not even representable, the same trick the check-runner registry uses (safety rule #3). `fetch_url` is wrapped in a **two-layer SSRF defense** so an agent can never trick it into reading an internal/cloud-metadata address. The model↔tool conversation is driven by a **boot-layer orchestrator** that lives in the IO layer — *never* on the replay-pure kernel loop — so replay re-reads the persisted tool results instead of re-fetching them (rule #7). Every tool result re-enters the model as **untrusted, sentinel-wrapped DATA** (rule #5), because a fetched web page is the prime prompt-injection vector. And tools attach to **one route only** — `population_generator` — so the held-out judge and critics structurally never see a tool, keeping the fitness anchor byte-identical across the bump (rule #6).

This doc owns the **full end-to-end story** of agent research. The frozen wire contracts live in [00](00-contracts-event-model.md); the gateway/adapter *mechanics* (the allowlist registry, the pure SSRF gate, the shared message mapper, the gateway's tool-call branch) are co-owned with [02](02-model-gateway-providers.md). What is unique here is the **orchestration loop**, the **live research-tool implementations**, the **TOCTOU-closing pinned HTTP seam**, and the **wiring + replay split**.

## Responsibilities

- **Owns the multi-turn model↔tool orchestration loop** (`createToolOrchestratingGateway`) — offering allowlisted tools while budget + turns remain, executing the permitted calls, re-injecting each result as DATA, and recording observations for the runtime loop to relay/persist (`apps/api/src/boot/toolOrchestrator.ts:113`).
- **Owns the three live research-tool implementations** — `web_search`/`x_search` as OpenRouter web-plugin completions and `youtube_search` as Gemini native video ingestion (`apps/api/src/boot/toolSeams.ts:215`, `:286`, `:344`).
- **Owns the live `fetch_url` IO seams** — the all-records DNS publicness check + the socket-pinned, redirect-revalidating HTTP GET that *closes* the resolve→connect TOCTOU (`apps/api/src/boot/toolSeams.ts:79`, `:111`, `:143`).
- **Owns the wiring** that selects the tool-orchestrating gateway on the live branch only, and the seam-assembly that fails safe without a key (`apps/api/src/boot/composeRuntime.ts:237`, `apps/api/src/main.ts:181`, `apps/api/src/boot/toolSeams.ts:444`).
- **Co-owns (with [02](02-model-gateway-providers.md)) the gateway/adapter mechanics it depends on:** the frozen allowlist registry + fail-safe gate, the pure synchronous SSRF gate, the shared OpenAI-protocol message mapper, and the gateway tool-call branch.

It is explicitly **NOT** responsible for:
- **The frozen wire contracts.** `ToolName`/`ToolDescriptor`/`ToolCallRequest` + the `ChatMessage` union are frozen in `packages/contracts`; this layer imports them, never redefines them. See [00](00-contracts-event-model.md).
- **The `maxToolCalls` cap *enforcement*.** The orchestrator's `toolBudget`/`maxTurns` are *hints*; the authoritative backstop is the kernel loop's inline `enforceCap('maxToolCalls')` relay (rule #1). See [03](03-runtime-kernel.md).
- **Persisting the tool events / scrubbing them.** The runtime loop appends `tool_call.started/finished` through the append path (which scrubs); this layer only surfaces the observations.
- **The Shared Knowledge Space.** The `tool_call.finished` events this loop produces *become* the KB substrate, but the `ResearchNote` projection, retriever, and `/knowledge` endpoint live in [11](11-shared-knowledge-space.md).

## Key components

| Component | What it does | path:line |
|-----------|--------------|-----------|
| `ToolName` (contract) | Frozen closed 4-member allowlist enum (`web_search`/`fetch_url`/`x_search`/`youtube_search`) — an unlisted tool is unrepresentable (rule #3 by closed enum) | `packages/contracts/src/gateway/tool.ts:17` |
| `ToolDescriptor` / `ToolCallRequest` (contract) | Non-executing offered-tool descriptor (`strictObject`, no code-carrying field) + the model's requested call `{id, name, arguments}` where `arguments` is the RAW JSON-arg STRING kept as DATA (rule #5) | `tool.ts:29` / `:43` |
| `ChatMessage` union (contract) | Adds an assistant-tool-call echo + a tool-result variant to the `messages` array WITHOUT widening the closed 3-member `ChatRole` | `packages/contracts/src/gateway/gateway-request.ts:49` (variants `:36` / `:42`) |
| `ModelGatewayRequest.tools?` / `Response.toolCallRequests?` | Optional additive tool surface; `tools` set ONLY on `population_generator`, `toolCallRequests` surfaced on `finish_reason==='tool_calls'` | `gateway-request.ts:76` / `gateway-response.ts:39` |
| `CURRENT_SCHEMA_VERSION` | The `9 → 10` TU.1 bump; additive — readers accept `schemaVersion ≤ current` | `packages/contracts/src/version.ts:51` |
| `TOOL_REGISTRY` / `TOOL_IMPLS` / `resolveTool` | Two frozen parallel maps (descriptors + executor impls) keyed by `ToolName` + a fail-safe own-property gate — unregistered/unimplemented/`__proto__` → `unregistered_tool`, never executes (rule #3) | `apps/api/src/model-gateway/tools/registry.ts:185` / `:219` / `:236` |
| `fetchUrlExecutor` | The `fetch_url` executor: literal SSRF gate THEN the injected DNS check, then the pinned `httpGet`; fails CLOSED unless both seams wired; never throws (returns `ok:false` DATA) | `registry.ts:105` (fail-closed gate `:113`) |
| `assertSafeFetchUrl` (+ `isPrivateHost`/`isPrivateIpv4Int`/`isPrivateIpv6`) | Pure synchronous fail-closed SSRF layer 1: http(s)-only, no userinfo, blocks loopback/private/link-local/CGNAT/metadata across IPv4 + IPv6 (incl. mapped/NAT64) | `apps/api/src/model-gateway/tools/ssrf.ts:108` / `:98` / `:43` / `:72` |
| `createSafeHttpGet` / `createPinnedFetch` / `createResolveAddresses` | Live `fetch_url` IO seams: per-hop re-validate (literal gate + all-A/AAAA DNS publicness) and PIN the socket to the validated IP via Node's `lookup` hook — closes the resolve→connect TOCTOU; bounded redirects/timeout/body-size | `apps/api/src/boot/toolSeams.ts:111` / `:143` / `:79` |
| `createToolOrchestratingGateway` | The boot-layer `GenerationGateway` driving the multi-turn loop: offer tools while budget+turns remain, execute the permitted slice CONCURRENTLY via `mapLimit`, re-inject results as DATA, record observations | `apps/api/src/boot/toolOrchestrator.ts:113` |
| `toolResultMessage` + `TOOL_RESULT_DATA_FRAMING` | Re-injects each tool result as a `role:'tool'` message: trusted framing + `wrapUntrusted(content)` (rule #5 — tool result is the prime injection vector) | `toolOrchestrator.ts:95` / `:37` |
| `createGroundedSearch` / `createWebSearch` / `createYoutubeResearch` | The 3 research-tool impls: OpenRouter web-plugin completions (`web_search`; `x_search` via `grok-4.3` + X-query framing) and YouTube discover→native `video_url` ingest via Gemini | `toolSeams.ts:215` / `:286` / `:344` |
| `isVideoRefusal` | Drops Gemini's "I cannot watch this video" prose so a refusal is never surfaced as a fake transcript | `toolSeams.ts:331` |
| `createToolExecutorSeams` | Assembles the live `ToolExecutorDeps`; WITHOUT an OpenRouter key returns only `{httpGet, resolveHostIsPublic}` so web/x/youtube fail safe to `tool_unavailable` | `toolSeams.ts:444` (keyless return `:477`) |
| `toProviderMessage` / `toProviderMessages` | Shared OpenAI-protocol mapper for BOTH the OpenRouter + Ollama adapters; no vendor SDK type leak (rule #9) | `apps/api/src/model-gateway/adapters/message-mapping.ts:24` / `:42` |
| `createGateway` tool-call branch | When the provider returns `toolCallRequests`, surfaces them WITHOUT the validate/repair/reject discipline (`accepted:true`, no `output`) | `apps/api/src/model-gateway/gateway.ts:77` |
| `buildParams` tools / `parseToolCall` / `mapSdkResponse` | OpenRouter adapter: offers registry-sourced function tools, allowlist-filters returned calls via `ToolName.safeParse`, surfaces only on `finish_reason==='tool_calls'` | `apps/api/src/model-gateway/adapters/openrouter.adapter.ts:141` / `:163` / `:289` |
| `composeRuntime` generationGateway selection | Selects `createToolOrchestratingGateway` iff `input.toolExecutorSeams` present (live), else pass-through `toGenerationGateway` (recorded/replay) | `apps/api/src/boot/composeRuntime.ts:237` |
| `generationLoop` tool relay | Passes the kernel-clamped `toolBudget` hint; the inline `enforceCap('maxToolCalls')` is the authoritative backstop; debits energy only on `ok!==false` (rules #1/#8) | `apps/api/src/runtime/loop/generationLoop.ts:713` / `:722` / `:766` |
| `main.ts` `resolveGateway` | Builds `createToolExecutorSeams` on the live branch only; the recorded/stub branch returns no seams | `apps/api/src/main.ts:181` (stub `:157`) |

## Interfaces & contracts

**The frozen wire contracts (schema v10, from `@doppl/contracts`):**

- `ToolName` = `z.enum(['web_search', 'fetch_url', 'x_search', 'youtube_search'])` — the closed allowlist (`tool.ts:17`).
- `ToolDescriptor` = `z.strictObject({ name: ToolName, description })` — non-executing by shape; the parameter JSON-schema is NOT here, it lives in the runtime registry keyed by name (`tool.ts:29`).
- `ToolCallRequest` = `z.strictObject({ id, name: ToolName, arguments: z.string() })` — `arguments` is the raw provider JSON-arg STRING kept as DATA, parsed only inside the orchestrator's guard (`tool.ts:43`).
- `ChatMessage` = `z.union([ ChatMessageEntry, AssistantToolCallEntry, ToolResultEntry ])` — the chat message `{role: ChatRole, content}`, an assistant-tool-call echo `{role:'assistant', content, toolCalls[≥1]}`, and a tool-result `{role:'tool', toolCallId, toolName, content}`. The `'tool'` literal does NOT widen the closed 3-member `ChatRole` (`gateway-request.ts:49`, `ChatRole` at `:16`).
- `ModelGatewayRequest.tools?: ToolDescriptor[]` — set ONLY on the `population_generator` route (`gateway-request.ts:76`).
- `ModelGatewayResponse.toolCallRequests?: ToolCallRequest[]` — `accepted:true`/`'accepted'` with NO `output` but `toolCallRequests` set is a VALID *intermediate* response (`gateway-response.ts:39`).

**The runtime tool surface (in `apps/api/src/model-gateway/tools`):**

- `resolveTool(name: string) => ResolvedTool` — `{ ok:true, name, execute }` for a registered+implemented tool, else `{ ok:false, reason:'unregistered_tool' }` (`registry.ts:236`).
- `offeredToolDescriptors() => ToolDescriptor[]` — the descriptors a `population_generator` request offers (`registry.ts:227`).
- `assertSafeFetchUrl(raw: string) => SsrfResult` — `{ ok:true, url }` or `{ ok:false, reason }` where `reason ∈ invalid_url|unsupported_scheme|embedded_credentials|private_host` (`ssrf.ts:108`).
- `ToolExecutorDeps` = the injected IO seams `{ httpGet?, resolveHostIsPublic?, webSearch?, xSearch?, youtubeSearch? }`; `httpGet` + `resolveHostIsPublic` are wired as a PAIR (`registry.ts:45`).

**The boot orchestration + IO seams (in `apps/api/src/boot`):**

- `createToolOrchestratingGateway(deps: ToolOrchestratorDeps) => GenerationGateway` — `deps` carries the underlying `gateway`, the `toolExecutorDeps`, and optional `maxTurns`/`defaultToolBudget`/`offeredTools`/`toolTurnConcurrency` (`toolOrchestrator.ts:58`, `:113`).
- `GenerationGateway.generate(request, opts?: { toolBudget? }) => GenerateResult` — `GenerateResult` carries the final `response` plus `toolCalls?: ToolCallObservation[]` (`{ toolName, query?, result?, ok? }`) for the loop to relay.
- `createToolExecutorSeams(config: ToolSeamConfig) => ToolExecutorDeps` — `config` carries the env-derived `openRouterApiKey?` + optional model overrides + injectable `fetchFn`/`fetchPinned`/`lookupAll` for tests (`toolSeams.ts:428`, `:444`).
- `createSafeHttpGet`, `createPinnedFetch`, `createResolveAddresses`, `createResolveHostIsPublic`, `createGroundedSearch`, `createWebSearch`, `createYoutubeResearch`, `extractCitationUrls`, `extractYoutubeUrls`, `isVideoRefusal` — the live-fetch + grounded-search building blocks (`toolSeams.ts`).

**Events produced (downstream of this layer, via the runtime loop's append path):**

- `tool_call.started` / `tool_call.finished` — pre-existing **generic-payload** `RunEventType`s (no schema bump, lesson §107); the FB.7 detail fields `query?`/`queryTruncated?`/`result?`/`resultTruncated?` ride the generic payload, truncated-with-marker + append-path scrubbed.

## Data & state

This layer is **almost stateless** — it drives a conversation and makes outbound HTTP calls; it persists nothing itself.

- **`schemaVersion` is now 10** (`version.ts:51`). The bump is **additive** — old v1–v9 envelopes still validate, and the rule-#6 anchor (`ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis`) is byte-identical across the bump.
- **`TOOL_REGISTRY` / `TOOL_IMPLS`** — two `Readonly<Partial<Record<ToolName, …>>>` maps. `TOOL_REGISTRY` is `deepFreeze`'d (descriptors + parameter JSON-schemas, `registry.ts:185`); `TOOL_IMPLS` is `Object.freeze`'d (the executor functions, `registry.ts:219`). `ToolName` is the *sole* source of the closed key set.
- **`ToolExecutionResult`** = `{ ok: boolean, content: string }` — `content` is DATA (the orchestrator wraps it via `wrapUntrusted`); `ok:false` means skipped/blocked/failed and is still re-injected to the model (`registry.ts:22`).
- **In-conversation state** — the orchestrator's `messages: ChatMessage[]` and `toolCalls: ToolCallObservation[]` arrays live only in memory for the duration of one `generate(...)` call (`toolOrchestrator.ts:121`, `:128`). The authoritative record is the persisted `tool_call.started/finished` events.
- **No new credential field anywhere.** `ToolDescriptor`/`ToolCallRequest`/`ModelGatewayRequest`/`Response` are all `strictObject`s; the OpenRouter API key stays env-only, used solely in the `Authorization` header, closed over the grounded-search seam, and never returned (rule #4 — `toolSeams.ts:230`).
- **`DEFAULT_CAPS` were resized for the multi-turn research loop** (a runtime-config change, not a contract one): `maxToolCalls` `64 → 600`, `energyBudget` `1000 → 12000`, `wallClockTimeoutMs` `600_000 → 1_200_000` (`apps/api/src/runtime/config/configSchema.ts:39`). These only raise the *default* ceiling; the kernel still enforces caps (rule #1).

## How it works (flow)

```
                            ┌─────────────────── boot / IO layer (NOT replay-pure) ───────────────────┐
runtime loop                │                                                                          │
(generationLoop.ts:712)     │   createToolOrchestratingGateway.generate(request, {toolBudget})         │
   │ population_generator    │      │                                                                   │
   │ request + toolBudget ──►│      ▼  per turn (≤ maxTurns=8):                                          │
   │ (clamped HINT)          │   offerTools = toolCalls.length < toolBudget AND turn < maxTurns−1       │
   │                         │      │                                                                   │
   │                         │      ├─► gateway.call(request + tools?)  ──► OpenRouter adapter offers   │
   │                         │      │     (createGateway:77 surfaces        registry-sourced fn tools;  │
   │                         │      │      toolCallRequests, skips           ToolName.safeParse filters  │
   │                         │      │      validate/repair/reject)           a hallucinated tool         │
   │                         │      │                                                                   │
   │                         │      ├─ no toolCallRequests ─────────► return final answer (validated)   │
   │                         │      │                                                                   │
   │                         │      ▼ requests present:                                                 │
   │                         │   echo assistant tool-call msg                                           │
   │                         │   RESERVE budget by slicing (toExecute = requests.slice(0, remaining))   │
   │                         │   mapLimit(toExecute) ─► resolveTool ─► execute (web/x/youtube/fetch_url) │
   │                         │      │                      (fail-safe gate; never throws)                │
   │                         │      ▼                                                                    │
   │                         │   re-inject each result: role:'tool' = FRAMING + wrapUntrusted(content)   │
   │                         │   record ToolCallObservation {toolName, query, result, ok}                │
   │ ◄── {response, toolCalls}┴──────────────────────────────────────────────────────────────────────┘
   ▼
 for each toolCall:  enforceCap('maxToolCalls') ── (cap+1)th DENIED → cap_breach latch ── else relay:
   append tool_call.started/finished (truncated + scrubbed) ; debit tool energy ONLY if ok !== false
```

1. **Boot selects the gateway.** On the live branch, `main.ts` `resolveGateway` builds `createToolExecutorSeams(...)` from env (`main.ts:181`); `composeRuntime` then selects `createToolOrchestratingGateway` *iff* those seams are present, else the pass-through `toGenerationGateway` (`composeRuntime.ts:237`). The recorded/replay stub branch returns no seams (`main.ts:157`).

2. **The loop calls `generate` with a budget hint.** Per agenome, the kernel loop builds the `population_generator` request and calls `gateway.generate(request, { toolBudget: max(0, maxToolCalls − toolCallsConsumed) })` (`generationLoop.ts:712`). The budget is a *clamped hint* — the kernel relay is the real cap.

3. **The orchestrator runs the multi-turn loop.** Each turn it offers tools only while `toolCalls.length < toolBudget AND turn < maxTurns − 1` (`toolOrchestrator.ts:134`) — so the last allowed turn and a spent budget offer NO tools, forcing a final answer. It calls the underlying `ModelGateway.call`; the OpenRouter adapter attaches registry-sourced function tools (`openrouter.adapter.ts:141`) and, on `finish_reason==='tool_calls'`, allowlist-filters the returned calls via `ToolName.safeParse` (`:170`, surfaced `:306`). The gateway's tool-call branch surfaces `toolCallRequests` *without* running the validate/repair/reject discipline — there is no final answer yet (`gateway.ts:77`).

4. **The orchestrator executes the permitted slice.** It echoes the assistant tool-call message, then **reserves budget by slicing** (`toExecute = requests.slice(0, remaining)`, `toolOrchestrator.ts:148`) so the reservation stays correct under concurrency. It executes that slice **concurrently** via `mapLimit` (`:158`), each call routed through the fail-safe `resolveTool` gate (`registry.ts:236`) → the matching executor (`fetchUrlExecutor` runs `assertSafeFetchUrl` then `resolveHostIsPublic` then the pinned `httpGet`; the grounded executors call their seam). It re-injects each result as `wrapUntrusted` DATA prefixed by `TOOL_RESULT_DATA_FRAMING` (`toolOrchestrator.ts:95`), and records a `ToolCallObservation`.

5. **The loop relays + accounts.** The orchestrator returns `{ response, toolCalls }`. The loop iterates `toolCalls`: before each it re-checks `enforceCap('maxToolCalls')` — the `(cap+1)`th call is **denied** (not relayed/finished/debited) and latches a `cap_breach` kill (`generationLoop.ts:722`); otherwise it appends `tool_call.started`/`tool_call.finished` (truncated-with-marker + append-path scrubbed) and debits tool energy **only** when `toolCall.ok !== false` (`generationLoop.ts:766`, rule #8).

6. **Replay never re-executes.** The recorded/replay path takes the pass-through gateway (no seams) and re-reads the persisted `tool_call.finished` results — never re-fetches or re-searches (rule #7). Tool execution is IO confined to this boot/IO layer; the replay-pure kernel loop only *relays* the surfaced observations.

### The two-layer SSRF defense (for `fetch_url`)

`fetch_url` is the one tool that reaches arbitrary network addresses, so it is guarded twice:

- **Layer 1 — the pure literal gate** (`assertSafeFetchUrl`, `ssrf.ts:108`): `http(s)` only (rejects `file:`/`ftp:`/`data:`/…), no embedded userinfo credentials, and no loopback/private/link-local/CGNAT/metadata host — across IPv4 (`isPrivateIpv4Int`, `ssrf.ts:43`) AND IPv6 including IPv4-mapped (`::ffff:…`), IPv4-compatible, and NAT64 (`64:ff9b::…`) forms (`isPrivateIpv6`, `:72`) plus the `169.254.169.254` cloud-metadata IP. A non-IP hostname passes this literal layer *by design* — it is layer 2's job to catch a public name that resolves to a private IP.
- **Layer 2 — the injected DNS check + connection pinning** (`apps/api/src/boot/toolSeams.ts`): `createResolveAddresses` (`:79`) resolves a hostname to ALL its A *and* AAAA records and requires EVERY one to be public (a single private record fails — defeats split-horizon / multi-record rebinding). `createSafeHttpGet` (`:111`) then re-runs the literal gate AND the all-records check on **every redirect hop** and calls `createPinnedFetch` PINNED to the freshly-validated IP via Node's `lookup` hook (`:157`) — so connect performs no second DNS resolution while TLS SNI + the Host header keep the hostname. This **closes the resolve→connect TOCTOU** (`toolSeams.ts:27`). The fetch is bounded by a redirect count, a per-call timeout, and a streamed body-size cap (finiteness).

`fetchUrlExecutor` fails **CLOSED** unless BOTH `httpGet` and `resolveHostIsPublic` are wired (`registry.ts:113`) — the literal gate passes every domain by design, so a missing resolver must never silently skip the rebinding check.

### The three research tools (Option A — no new keys)

All three are OpenRouter completions with the `web` plugin, the key env-only in the `Authorization` header (`toolSeams.ts:215`, `:230`):

- **`web_search`** (`createWebSearch`, `:286`) — a grounded web completion (default model `openai/gpt-4o-mini`); citation URLs are appended as a `Sources:` list so the agent gets concrete links to cite.
- **`x_search`** (`createGroundedSearch` with `x-ai/grok-4.3` + an X-query prefix, `:43`, `:46`) — the `web` plugin enables X search for xAI models; the prefix frames the topic so grok pulls real X posts rather than a generic web explainer (live-verified).
- **`youtube_search`** (`createYoutubeResearch`, `:344`) — discovers real watch URLs via a grounded search, then ingests each video through Gemini's native `video_url` part (`:388`) so the model transcribes the *actual* audio; `isVideoRefusal` (`:331`) drops "I cannot watch this video" prose so a refusal never masquerades as a transcript.

A provider error (e.g. a deprecated model → 404) now **throws loudly** (`toolSeams.ts:246`) — the old `content ?? ''` swallowed it to an empty string, so `x_search` silently "returned nothing" for months. The throw surfaces `<tool>_failed` (`ok:false` → no energy debit), and the thrown message is the provider's own (no key — rule #4), discarded by the executor's catch.

## Dependencies

- **Depends on:** [00 Contracts & Event Model](00-contracts-event-model.md) — the frozen `ToolName`/`ToolDescriptor`/`ToolCallRequest` + the `ChatMessage` union + `wrapUntrusted`. [02 Model Gateway & Providers](02-model-gateway-providers.md) — the `ModelGateway` port, the `TOOL_REGISTRY`/`TOOL_IMPLS`/`resolveTool` registry, the pure `assertSafeFetchUrl` gate, the shared `toProviderMessages` mapper, and the gateway tool-call branch. The shared `apps/api/src/concurrency/pLimit.ts` (`mapLimit`) bounds per-turn tool fan-out. The live seams use Node's raw `node:http`/`node:https`/`node:dns`/`node:net` primitives + the global `fetch` (no provider SDK — rule #9).
- **Used by:** the [03 Runtime Kernel](03-runtime-kernel.md) generation loop, which holds the `GenerationGateway` port, calls `generate(...)`, relays the surfaced `toolCalls`, enforces the `maxToolCalls` cap, and debits success-only tool energy. The **boot root** (`apps/api/src/main.ts` → `composeRuntime`) is the single composition site that builds the live seams and selects the tool-orchestrating gateway. The `tool_call.finished` events become the substrate for the [11 Shared Knowledge Space](11-shared-knowledge-space.md).

## Design decisions & rationale

- **Grounded search over the OpenRouter web plugin (Option A) — no new keys.** `web_search`/`x_search`/`youtube_search` are all OpenRouter completions behind the *existing* key, so the demo gains real research with zero new credential surface (`toolSeams.ts:215`). `x_search` rides `grok-4.3`'s X access; `youtube_search` rides Gemini's native video ingestion.
- **Tool execution lives in the boot/IO layer, never on the replay-pure loop.** Tool calls are IO; putting them in the orchestrator (`toolOrchestrator.ts`) + live seams (`toolSeams.ts`) keeps the kernel generation loop pure, so replay re-reads persisted results instead of re-fetching (rule #7). The loop only *relays* the surfaced observations (lesson §64).
- **The allowlist is modeled on the check-runner registry (rule #3).** A closed `ToolName` enum + frozen parallel descriptor/impl maps + a fail-safe own-property `resolveTool` gate means an unregistered/`__proto__`/`constructor` name resolves to a skip and never executes (lesson §11/§39) — the exact discipline that gates check-runners.
- **Tools attach to one route only (rule #6).** `ModelGatewayRequest.tools?` is set only on the `population_generator` request; the verify seam calls `modelGateway` directly for critic/judge (`composeRuntime.ts:236`). So the held-out judge structurally never receives a tool → never gets `toolCallRequests` back → its path is byte-identical to pre-sv10.
- **Tool results are untrusted DATA (rule #5).** A fetched web page is the prime injection vector, so every result re-enters via `toolResultMessage` — the trusted `TOOL_RESULT_DATA_FRAMING` plus `wrapUntrusted(content)` — in a distinct `role:'tool'` message, never interpolated into an instruction (`toolOrchestrator.ts:95`).
- **The budget is a hint; the kernel is the cap (rule #1).** The orchestrator's `toolBudget`/`maxTurns` self-limit for politeness, but the un-bypassable backstop is the loop's inline `enforceCap('maxToolCalls')` relay (`generationLoop.ts:722`). Budget reservation is by slicing requests up front so it stays correct under concurrent execution.
- **Energy is success-only (rule #8).** A blocked/unavailable/failed tool (`ok:false`) is relayed for observability and counts toward `maxToolCalls`, but debits no energy — only a usable result is a productive spend (`generationLoop.ts:766`).

## Gotchas & sharp edges

- **DRIFT (low, confirmed): the `ToolExecutorDeps` docstring is stale on the SSRF TOCTOU.** `registry.ts:33`–`43` still describes the connection-pinning resolve→connect TOCTOU as an OPEN "DOCUMENTED MVP RESIDUAL … does NOT yet pin the connection to the validated IP" and says `httpGet` "DISABLES redirect-following." But the actually-wired boot seam (`createSafeHttpGet`/`createPinnedFetch`, `toolSeams.ts:111`/`:143`) **pins** the socket to the validated IP, **re-validates each redirect hop**, and **follows** redirects — and `toolSeams.ts:27` declares the TOCTOU **CLOSED**. No live-path risk (the wired path is pinned + redirect-safe); the in-code annotation just misleads a future rule-#3 auditor reading the registry. *(Flagged, not fixed.)*
- **DRIFT (low, confirmed): `ARCHITECTURE.md` §6 prose omits the tool subsystem.** The TU.1 *wire* contract IS in the Appendix-A tables (the `ModelGatewayRequest`/`Response` rows + sv10), but the §6 *prose* body carries only a generic `toolCalling` capability flag — there is no prose description of `TOOL_REGISTRY`/`TOOL_IMPLS`, the two-layer SSRF defense, the tool-orchestrator, or the 3 research-tool impls. Mechanism implemented, undocumented-at-prose. *(Flagged, not fixed.)*
- **Tools are offered only while `toolCalls.length < toolBudget AND turn < maxTurns − 1`** (`toolOrchestrator.ts:134`). The last allowed turn and a spent budget offer NO tools, forcing the model to return a final candidate. Defaults: `maxTurns = 8` (`:52`), `defaultToolBudget = 16` (`:53`).
- **Execution-vs-accounting gap on tool calls (confirmed, medium; rule #1).** Because the orchestrator's `toolBudget` is a *hint* and up to `DEFAULT_AGENOME_CONCURRENCY = 6` agenomes generate concurrently, each reads a *stale* `toolCallsConsumed` snapshot and self-limits to roughly the full remaining budget — so outbound tool IO can exceed `maxToolCalls` (worst case ≈ `6 × maxToolCalls`). But the **recorded/debited ledger stays capped**: the inline `enforceCap('maxToolCalls')` relay (`generationLoop.ts:722`) denies the `(cap+1)`th call from being relayed/finished/debited. This is an *execution-vs-accounting* gap (a few extra network calls may fire), **not** a rule-#1 accounting bypass — the authoritative count and energy debit are never raised past the cap. Bounded loosely by the wall-clock cap + per-call timeout + per-orchestrator `maxTurns`/`toolBudget`. See [03](03-runtime-kernel.md) and [10](10-cross-cutting-safety.md).
- **Without an OpenRouter key, `createToolExecutorSeams` returns only `{httpGet, resolveHostIsPublic}`** (`toolSeams.ts:477`) — so `web_search`/`x_search`/`youtube_search` fail safe to `tool_unavailable` DATA, never throw. (Note: the tool-orchestrating gateway is still selected when *any* seams are present, including this fetch-only set.)
- **`x_search` and `youtube_search` depend on specific live-verified models, not dedicated APIs** — `x-ai/grok-4.3` with X-query framing, `google/gemini-2.5-flash` with native `video_url` ingestion. A deprecated model now throws loudly (`toolSeams.ts:246`) instead of silently returning empty.
- **`youtube_search` uses a refusal detector** (`isVideoRefusal`, `toolSeams.ts:331`) so Gemini's "I cannot watch this video" prose is dropped rather than surfaced as a fake transcript. It also attempts more candidate videos than it keeps (`discoverCount > maxVideos`) so a couple of un-ingestable videos don't starve the result.
- **`mapLimit` preserves REQUEST order**, so the recorded observations + re-injected tool-result messages are deterministic regardless of which tool finishes first (replay reads the persisted order, rule #7).
- **The research nudge `TOOL_USE_FRAMING` is appended only when `messages[0].role === 'system'`** (`toolOrchestrator.ts:125`) — a prompt-only request gets no nudge, but a `population_generator` request always builds a system message.
- **A tool-call turn deliberately skips the structured-output discipline** (`gateway.ts:77`) — `accepted:true`/`'accepted'` with no `output`. The orchestrator is the intended caller and re-asks; the *eventual* final answer (`finish_reason==='stop'`) still flows through validate/repair/reject. See [02](02-model-gateway-providers.md).

## Connects to

- [00-contracts-event-model.md](00-contracts-event-model.md) — the frozen `ToolName`/`ToolDescriptor`/`ToolCallRequest` + the `ChatMessage` union + the sv10 bump this layer consumes. Handoff: every tool type is `z.infer`'d from these schemas; this layer never redefines a shape.
- [02-model-gateway-providers.md](02-model-gateway-providers.md) — the gateway/adapter *mechanics* this layer drives: the `TOOL_REGISTRY`/`TOOL_IMPLS`/`resolveTool` allowlist, the pure `assertSafeFetchUrl` gate, the shared `toProviderMessages` mapper, and the `gateway.ts:77` tool-call branch. Handoff: 02 *offers* + *surfaces* tool calls; 12 *drives* the loop + *executes* the tools, re-injecting each result as `wrapUntrusted` DATA.
- [03-runtime-kernel.md](03-runtime-kernel.md) — the generation loop holds the `GenerationGateway` port, passes the clamped `toolBudget` hint, relays the surfaced `toolCalls`, enforces `maxToolCalls` via the inline `enforceCap` backstop (rule #1), and debits success-only tool energy (rule #8). Handoff: the orchestrator surfaces observations, the kernel accounts + persists.
- [10-cross-cutting-safety.md](10-cross-cutting-safety.md) — the consolidated view of the rules this subsystem touches: the rule-#3 allowlist + two-layer SSRF defense, tool results as untrusted DATA (rule #5), the `maxToolCalls` relay (rule #1), success-only tool energy (rule #8), the population-generator-only attachment (rule #6), and replay-by-construction (rule #7).
- [11-shared-knowledge-space.md](11-shared-knowledge-space.md) — the `tool_call.finished` events this loop writes ARE the stigmergy KB substrate; 11's `ResearchNote` projection folds them, and agents read prior trails back at generation time.
- [OVERVIEW.md](OVERVIEW.md) — the system spine; this layer is the agent-research surface attached to the population-generator path.

## Safety & invariants

The TU.1 amendment adds no tenth rule — it is a new *surface* on existing rules, each enforced by *mechanism*, not prompt. (Anchors below are this layer's; [10](10-cross-cutting-safety.md) is the cross-cutting synthesis.)

| Rule | How this layer upholds it | Anchor |
|------|---------------------------|--------|
| **#1 — caps kernel-enforced** | The orchestrator's `toolBudget`/`maxTurns` are clamped HINTS; the authoritative backstop is the loop's inline `enforceCap('maxToolCalls')` relay — the `(cap+1)`th call is denied and latches a `cap_breach`. Budget is reserved by slicing requests up front. | `generationLoop.ts:722`, `toolOrchestrator.ts:148` |
| **#3 — no arbitrary code execution** | `ToolName` is a frozen closed 4-member enum; `TOOL_REGISTRY`/`TOOL_IMPLS` are frozen parallel maps; `resolveTool` does an own-property lookup on BOTH so `__proto__`/unregistered/unimplemented → `unregistered_tool`, never executes. The OpenRouter adapter also drops any returned call failing `ToolName.safeParse`. | `registry.ts:236`, `openrouter.adapter.ts:170` |
| **#3 — SSRF (fetch_url)** | Two layers: the pure literal `assertSafeFetchUrl` (scheme/creds/IP-literal across IPv4+IPv6 incl. mapped/NAT64/metadata), THEN the all-records DNS publicness check + socket pinning to the validated IP with per-hop re-validation — closing the resolve→connect TOCTOU. Fails CLOSED if either seam is missing. | `ssrf.ts:108`, `toolSeams.ts:111` |
| **#4 — secrets never leave the server** | No credential field added (all `strictObject`); the OpenRouter key is env-only, used solely in the `Authorization` header, closed over the seam, never returned; a loud provider error re-raises the provider's own (key-free) message which the executor catch discards; `tool_call` payloads ride the append-path scrub. | `toolSeams.ts:230` |
| **#5 — model output untrusted; data ≠ instructions** | Every tool result re-enters the model as untrusted DATA: `toolResultMessage` prefixes `TOOL_RESULT_DATA_FRAMING` and wraps the content via the frozen `wrapUntrusted` in a distinct `role:'tool'` message; the raw provider argument string is kept as DATA, parsed only inside the orchestrator's guard before the executor. | `toolOrchestrator.ts:95`, `tool.ts:43` |
| **#6 — held-out judge immutable to agents** | Tools attach ONLY to `population_generator`: `offeredToolDescriptors` is passed only by `createToolOrchestratingGateway`, which `composeRuntime` wires solely as the generation gateway; the verify seam calls `modelGateway` directly, and the critic/judge isolation chokepoint has no `tools` param — so a critic/judge request never carries a tool → byte-identical anchor. | `composeRuntime.ts:237` |
| **#7 — replay calls no providers** | Tool execution is IO confined to the boot/model-gateway layer; the replay-pure runtime loop only RELAYS surfaced observations and persists `tool_call.started/finished`. The recorded/replay path takes the pass-through gateway and re-reads persisted tool results — never re-fetches/re-searches. | `composeRuntime.ts:243`, `main.ts:157` |
| **#8 — energy = successful productive spend** | Tool energy is debited per call ONLY when `toolCall.ok !== false`; a blocked/unavailable/failed tool is relayed for observability and counts toward `maxToolCalls` but debits no energy. | `generationLoop.ts:766` |
| **#9 — provider SDKs only behind the port** | The orchestrator imports only the `ModelGateway` port + `resolveTool`/`offeredToolDescriptors` + concurrency; the live seams use raw `node:http`/`https`/`dns`/`net` + the global `fetch` (the OpenRouter completions are plain HTTP, not the SDK). No vendor SDK leaks into runtime. | `toolOrchestrator.ts:9`, `toolSeams.ts:1` |
