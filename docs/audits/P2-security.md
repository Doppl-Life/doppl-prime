# P2 Security Review — Model gateway & provider integration (phase-boundary)

- **Branch:** `track/kernel`
- **Dispatch policy:** `phase-boundary` (security-reviewer = invariant + this whole-system pass)
- **Date:** 2026-06-22
- **Reviewer:** security-reviewer subagent
- **Review surface (accumulated):** `apps/api/src/model-gateway/` (gateway, registry §27, structured-output §23, OpenRouter §28 / OpenAI-embedding / retrieval §29 adapters, retry, curated-corpus, stub fake-gateway, config.schema, index), `packages/observability/` (redaction §52 + `createEmitBoundary` emit seam), `apps/api/src/event-store/redaction.ts` (§21 boundary scrub), and the frozen `packages/contracts/src/security/redaction.ts` (`scrubSecrets`, §46 type-blind fix). Over-approximates to the accumulated track diff for the gateway area (acceptable for a later-phase boundary, per the policy).
- **Codegraph note:** the code-intelligence MCP has no `.codegraph/` index in this worktree — fell back to `Read`/`Grep`. All claims below are file:line-anchored from direct reads.

This dispatch IS the P2 whole-system security pass; the phase-exit checklist's security row records this verdict.

---

## Key Safety Rules — invariant cross-check

### Rule #4 — Secrets never leave the server — **PASS**

Credential boundary is structural + multi-layer, end to end:

- **Env-only + structurally unrepresentable in config.** `RouteConfig`/`RegistryConfig` are `z.strictObject`s with NO credential field (`config.schema.ts:16-33`) — a key is unrepresentable in the merged/logged/persisted config object (§9 "no-X-field-via-shape" applied to creds, lesson §27). `assertProviderCredentials(env)` reads INJECTED env only and names the missing VARS, never values (`registry.ts:26-34`). No `process.env` read anywhere in `model-gateway/` except a doc-comment (verified by grep).
- **SDK keys closed over, never returned/logged.** `createOpenRouterClient` (`openrouter.adapter.ts:222-255`) and `createOpenAIEmbeddingClient` (`openai-embedding.adapter.ts:177-197`) load the key from injected env, fail fast naming the VAR (`openrouter.adapter.ts:225-227`, `openai-embedding.adapter.ts:181-184`), and close it over inside the `OpenAI` SDK instance — it never enters a returned object, a log line, or `ProviderMeta`. Grep for `console`/`throw` carrying `apiKey|key|env` in adapters = empty. `ProviderMeta` has no credential field (frozen contract); the adapters build it from provider/modelId/gatewayRequestId/tokens only (`openrouter.adapter.ts:159-165`, `openai-embedding.adapter.ts:120-126`).
- **Persistence-boundary scrub (event-store).** `scrubEventPayload` (`event-store/redaction.ts:103-110`) composes the frozen `scrubSecrets` + the boundary-local env-value layer (keys + array elements + string values, de-collision, ≥8-char guard, literal split/join, proto-safe rebuild). Wired into the only append insert (`event-store/append.ts:85`, scrub-on-PARSED-payload, §26).
- **Emit-boundary scrub (observability) — the deferred-export SEAM.** `createEmitBoundary` (`emit.ts:49-80`) runs `enforcePayloadCeiling` THEN `scrubObservabilityPayload` BEFORE the injected `emit(...)` is ever called (`emit.ts:60-72`) — an unscrubbed payload is structurally incapable of reaching the sink. Fails safe: ceiling-exceeded → drop + local warn (`emit.ts:61-67`); emitter throws → swallow + local warn, NO authoritative-log write (`emit.ts:73-77`). The module imports nothing from the event-store/DB (verified). **The P2.8 live Langfuse export caller is the approved Phase-D deferral; the seam itself scrubs-before-emit correctly and is already consumed by `kernel-logger.emitExternal` (`kernel-logger.ts:55`)** — so the rule-#4 second boundary holds the moment the real client is injected, no re-implementation. `scrubObservabilityPayload` (`redaction.ts:108-118`) is a faithful twin of the event-store scrub (same compose order, same env-value discipline, §52).
- **§46 type-blind fix verified.** Frozen `scrubSecrets` (`contracts/src/security/redaction.ts:95-96`) whole-redacts a sensitive-key value EXCEPT `number`/`boolean` — so `ProviderMeta.tokensIn`/`tokensOut` (keys contain "token") round-trip their integer type instead of corrupting to the STRING placeholder (which would silently break the frozen contract's `safeParse` on read = rule-#7 log corruption). Object/array values under a sensitive key STILL whole-redact (`:93-94`), so an object-valued secret can't escape via the typeof-string-guard hole the lesson warns about. Verdict: the fix is type-aware, not scope-narrowing — correct.

### Rule #9 — Provider SDKs only behind the ModelGateway port — **PASS**

- `import OpenAI from 'openai'` appears in EXACTLY two files, both adapters (`openrouter.adapter.ts:3`, `openai-embedding.adapter.ts:1`). Grep for the SDK import outside `model-gateway/adapters/` = empty. No `@anthropic`/`openrouter-sdk` import anywhere.
- The vendor type never leaks into an EXPORTED surface: each adapter defines OUR vendor-free seam interfaces (`OpenRouterClient`/`OpenAIEmbeddingClient`, `SdkChatCompletionLike`/`SdkEmbeddingResponseLike` are local read-shapes, not the vendor type) and the SDK instance is confined to the `create*Client` factory. The `ModelGateway` port (`port.ts:19-25`) is type-only over the frozen §6 wire contracts — no vendor/credential field representable. `model-gateway/index.ts` re-exports only the frozen contracts + vendor-free types.
- Replay isolation (rule #7 corollary): no `model-gateway`/`ModelGateway`/`createGateway`/`providerCall` reach from `event-store/` or `projections/` (the replay/read layer) — verified by grep (empty). The retrieval adapter persists results into the originating event so replay resolves from Postgres (`retrieval.adapter.ts:22-24`, retrievalEvidenceRef anchored by eventId `:174-191`); the embedding adapter returns the authoritative vector + provenance for the caller to persist (`openai-embedding.adapter.ts:113-119`, §13).

### Rule #5 — Model output untrusted until schema-validated; candidate text as DATA — **PASS**

- Validate → accept (`parsed.data`, §18) / repair ≤1 / reject, returned as a frozen `ModelGatewayResponse` (`structured-output.ts:110-135`). The ≤1 repair is a STRUCTURAL single-`await` bound (`:128`), not a counter. A missing/empty output is non-repairable → straight reject, no repair attempt (`:122-124`).
- **Isolation chokepoint intact.** The repair INSTRUCTION (system message) names only the schema errors; the invalid output is carried in a SEPARATE user message via the frozen `wrapUntrusted` (`structured-output.ts:80-103`) — never interpolated into the instruction string. The frozen `CRITIC_INPUT_SENTINEL` is reused (the stub detects a repair via that sentinel, `fake-gateway.ts:51-55`), never a local sentinel (§23/§8).
- The OpenRouter adapter requests strict structured-output via `z.toJSONSchema(request.schema)` (`openrouter.adapter.ts:102-108`) — the SCHEMA shape only, no candidate/prompt text folded into an instruction. Malformed structured output → `safeJsonParse` returns the raw string for the discipline to reject, the adapter never throws on bad JSON (`:190-196`).
- The gateway maps a terminal `ProviderCallError` to a `rejected` response and RE-THROWS any non-provider error (`gateway.ts:89-101`) — a real bug is never silently swallowed as a rejection.

### Rule #8 — Retries/repairs/timeouts never debit energy — **PASS**

- `withRetry` does NO energy accounting and never throws on a provider failure — it returns a discriminated `RetryOutcome` carrying per-attempt `{attempt,reason}` (`retry.ts:6-9, 96-128`). Total attempts ≤ (1 + maxRetries) + (fallback?1:0), finite by construction; per-attempt timeout + bounded retries enforce finiteness (`retry.ts:68-89, 100-127`).
- On terminal failure each adapter builds a route-derived `ProviderMeta` with ZERO tokens and a `provider_call_failed` sentinel `gatewayRequestId` (`openrouter.adapter.ts:169-178`, `openai-embedding.adapter.ts:130-138`) — no productive-spend representation. The structured-output discipline emits/persists/debits nothing (`structured-output.ts:13-16`). The retrieval adapter debits no energy on the curated fallback (`retrieval.adapter.ts:107-115`) and reports tool-call cost in `providerMeta.costEstimate` on SUCCESS only (`:156-158`). Energy success-only is also structural in the frozen `EnergyEvent` (no failure member) — the kernel debits on ProviderMeta from a SUCCESSFUL call (P3.5/§49), and the gateway/adapters carry no energy field at all.

---

## General security pass

- **Input validation:** registry config is Zod-validated fail-fast with field-identifying errors that never echo values (`registry.ts:42-67`); fallbackRouteId integrity checked against registered roles (`:57-66`). Authoritative-path error messages never echo payload (mirrors §26).
- **Injection / SSRF:** OpenRouter base URL is a hard-coded constant (`openrouter.adapter.ts:34`); no provider URL is candidate- or config-derived in the SDK call path. Retrieval is a pluggable seam with no vendor pinned and the curated corpus carries no secrets (`curated-corpus.ts:15`).
- **Resource exhaustion / DoS:** every provider path is bounded (per-attempt timeout + bounded retries + one fallback); the emit boundary enforces the payload-DoS ceiling BEFORE the recursive scrub (`emit.ts:60`), closing the unbounded-recursion/stack-blow surface (§52). Curated lookup clamps `maxResults` to `>= 0` (`curated-corpus.ts:63`).
- **Information disclosure:** verified no credential reaches a log/error/returned object (rule #4 above). `gatewayRequestId` sentinels on failure (`provider_call_failed`/`curated-fallback`/`web-search`) are fixed, non-reflected strings.
- **Prototype pollution:** both env-value scrubs + the frozen scrub rebuild via `Object.defineProperty` so a payload key named `__proto__`/`constructor` round-trips as own DATA, not a prototype write (`redaction.ts:84-91` event-store / `:89-94` observability / contracts `:97-102`).

**Findings: 0 critical / 0 high / 0 medium / 0 low.**

---

## Out-of-scope observation (NOT a P2 finding)

`packages/observability/test/{emit,redaction,kernel-logger}.test.ts` declare fixtures as `const SECRET = '...'` (e.g. `emit.test.ts:14`). Lesson §66 flagged that a `const SECRET =` var NAME trips the gitleaks-class secrets-guard on the name (not value entropy). These files were last touched in P6 (`0aa031e`, demo track) and are NOT in the P2 model-gateway review surface — and they already use low-entropy guard-clean VALUES per §66 intent, so the secrets-guard concern is mitigated. Recorded as a disposition note for completeness, not escalated. (Repo uses `scripts/guards/secrets-guard.sh`; no `.pre-commit-config.yaml` gitleaks block.)

---

## Verdict

**CLEAR.** All four P2-relevant Key Safety Rules (#4, #5, #8, #9) cross-checked PASS with file:line + §6/§14 anchors. General pass surfaced zero findings. The approved P2.8 Langfuse-export deferral does not weaken rule #4: the `createEmitBoundary` seam scrubs-before-emit and fails safe today, consumed by `kernel-logger.emitExternal`, so the second persistence boundary is load-bearing the instant the Phase-D client is injected — no re-implementation, no bypass.
