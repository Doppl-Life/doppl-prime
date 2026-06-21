# /tdd brief — openai_embedding_adapter

## Feature
The direct-OpenAI embedding adapter (`text-embedding-3-small`) behind the ModelGateway port: the `embedding` role's `providerCall` that returns the raw float vector + `embeddingModelId` + `dimension` so callers can persist them authoritatively (selection-scoring stores them in `novelty.scored` — the adapter does NOT persist). It follows the established provider-adapter pattern (lesson 28): OpenAI SDK behind one client factory (no vendor type past the adapter — rule #9), reuses `retry.ts` (bounded retry + per-role timeout, no energy on failure — rule #8), and throws `ProviderCallError` on terminal failure (the gateway maps it to rejected).

## Use case + traceability
- **Task ID:** P2.6
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (embeddings pinned to direct OpenAI `text-embedding-3-small` behind the gateway; the OpenRouter-only fallback still needs an OpenAI key for embeddings, or the app-cosine degrade), `ARCHITECTURE.md §14` (SDK behind the gateway — rule #9; creds env-only — rule #4)
- **Related context:** reuses P2.5's `retry.ts` (`5fd1c57`) + the `openai` SDK already added (P2.5) + the lesson 28 adapter pattern + the registry's `resolve('embedding')` (P2.2). The returned vector is the authoritative-once-computed value persisted by selection in `novelty.scored` (P1.6/§8, lesson §13) — this adapter just returns it. **Safety-adjacent (rule #9 SDK-boundary + rule #8 no-energy-on-failure)** → solo commit + security-reviewer at Step 8. Unit-testable with a mocked SDK; no live providers, no PG. (Split from P2.7: each adapter touches rule #9/#8 → solo per the safety guardrail.)

## Acceptance criteria (what "done" means)
- [ ] The embedding adapter routes to direct OpenAI `text-embedding-3-small`; it returns the raw float-array **vector** + the **`embeddingModelId`** + the **`dimension`** (= vector length) so the caller persists them authoritatively (rule #7 / lesson §13 — the adapter does NOT persist)
- [ ] SDK imported only inside the client factory; **no vendor type in the adapter's exported surface** (rule #9, grep-pinned); reachable only via the ModelGateway port
- [ ] Reuses `retry.ts` (`withRetry`): embedding failures are bounded by retry + per-role timeout; **failed attempts never debit energy / emit `energy.spent`** (rule #8 — the adapter does no energy accounting; success returns `providerMeta` for the kernel's reconcile)
- [ ] Terminal failure throws `ProviderCallError` (the gateway maps it to a rejected `ModelGatewayResponse` — domain never sees a throw, §6/lesson 28)
- [ ] An OpenRouter-only config that still supplies an OpenAI key satisfies embeddings; the **no-embeddings app-cosine degrade path is NOT blocked** by this adapter (it's a separate degrade, §8)
- [ ] Credentials load only from env (the `OPENAI_API_KEY` checked by P2.2's `assertProviderCredentials`); no key in the adapter code/logs/returned objects (rule #4)
- [ ] `/preflight` clean; **security-reviewer fan-out at Step 8** (rule #9 SDK-boundary + rule #8 no-energy focus)

## Wiring / entry point (Step 7.5)
The adapter exports a `providerCall`-shaped function for the `embedding` role that `createGateway` injects (no-schema path → the gateway returns the vector as the output). First consumer: **selection-scoring (P1.6/P5)** computes novelty by calling the gateway with role=`embedding` + persists the returned vector/modelId/dimension in `novelty.scored`; the live-gateway boot wires at **P3.1**. So: `first consumer — selection novelty (via the gateway); boot wiring P3.1`. Exercised now via a mocked SDK.

## Files expected to touch
**New:**
- `apps/api/src/model-gateway/adapters/openai-embedding.adapter.ts` — the embedding `providerCall` over the OpenAI SDK
- `apps/api/test/unit/model-gateway/adapters/openai-embedding.adapter.test.ts` (mocked SDK)

**Modified:**
- `apps/api/src/model-gateway/index.ts` — export the embedding adapter factory

If implementation needs files beyond this list (e.g. a small shared client-factory refactor with the OpenRouter adapter — both use `openai`), **flag at Step 2.5**.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/model-gateway/adapters/openai-embedding.adapter.test.ts` (**mock the SDK**; `spec(§6)`/`spec(§14)`):

1. **`test_returns_vector_model_dimension`** — a successful embedding call returns the float vector + `embeddingModelId` (`text-embedding-3-small`) + `dimension` (= vector length). Why: §6/§13 authoritative-once-computed value + provenance.
2. **`test_dimension_equals_vector_length`** — `dimension === vector.length` (so a vector can't be reinterpreted under a wrong dimension). Why: §9 embeddings authority.
3. **`test_provider_meta_carried`** — `providerMeta` (provider/modelId/gatewayRequestId + tokens) `ProviderMeta.safeParse`-valid on success. Why: §6 reconcile.
4. **`test_bounded_retry_then_success`** — a transient fail is retried (reuses `retry.ts`); success within the bound. Why: §6 finiteness.
5. **`test_terminal_failure_throws_provider_call_error`** — all attempts fail → throws `ProviderCallError` (no energy field on the failures); via the gateway → rejected response (no throw). Why: lesson 28/§8.
6. **`test_no_vendor_type_in_adapter_surface`** (rule #9) — no `OpenAI` type in any exported line; SDK imported only in the client factory (grep-style). Why: §14/rule #9.
7. **`test_credentials_env_only`** (rule #4) — the client factory reads only injected env (`OPENAI_API_KEY`); missing → fail-fast naming the var; the returned client exposes no key. Why: §14/rule #4.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (returns a plain vector + modelId + dimension; the `NoveltyScore` shape that persists them is frozen P0.8, consumed by selection later).
- **Orchestrator doc rows to write hot (Step 9):** likely none (the lesson 28 adapter-pattern lesson already covers it); flag if the embedding path surfaces a distinct convention.
- **Shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Shared client factory with the OpenRouter adapter?** Both use the `openai` SDK (OpenRouter via baseURL; embeddings direct). My default vote: **a small shared `openai`-client-factory helper** (env-only cred load, no vendor type exported) reused by both adapters — DRY for the rule-#9/#4 boundary — OR keep separate factories if cleaner. Confirm.
2. **Embedding call has no structured-output schema.** My default vote: the embedding `providerCall` goes through `createGateway`'s **no-schema path** (returns the vector as the output, no validate/repair); the adapter returns the raw vector. Confirm the gateway no-schema path returns the vector cleanly.
3. **`dimension` source.** My default vote: `dimension = returned vector.length` (asserted equal), with `embeddingModelId` = the configured model id — don't trust a separate SDK-reported dimension field over the actual vector length. Confirm.
4. **App-cosine degrade.** My default vote: this adapter does NOT implement or block the no-embeddings app-cosine degrade (that's selection's §8 fallback) — it only provides the embedding path. Confirm scope.

## Dependencies + sequencing
- **Depends on:** P2.2 (`8df860a`, registry), P2.4 (`9c8c886`, gateway + `ProviderCallFn`), P2.5 (`5fd1c57`, `retry.ts` + `openai` dep + the gateway `ProviderCallError` catch), frozen P0.11. No PG, no live providers.
- **Blocks:** selection novelty (P5) via the gateway; the live-gateway boot (P3.1). **P2.7 (retrieval) is the next solo adapter** (same pattern; rule #7 replay angle).

## Estimated commit count
**1.** Safety-adjacent slice (rule #9 SDK-boundary + rule #8 no-energy). OWN commit, never bundled (split from P2.7 for this reason); **security-reviewer fan-out at Step 8**.

## Lessons-logged candidates anticipated
- Likely **none new** — this applies the lesson 28 provider-adapter pattern. Flag only if the embedding path (authoritative vector + dimension provenance) surfaces a distinct convention worth its own note.

## How to invoke
1. **Read this brief end-to-end** — applies lesson 28; safety-adjacent (own commit + Step-8 security-reviewer).
2. **Use Context7** for the version-correct `openai` embeddings API (`embeddings.create`, model `text-embedding-3-small`, returned `data[].embedding` + `usage`).
3. **Run `/tdd openai_embedding_adapter`.**
4. **Step 2.5** — answer the 4 design questions, send the write-up.
5. **Step 8** — `security-reviewer` (SDK-boundary + no-energy focus).
6. **Step 9** — surface any distinct convention (likely none beyond lesson 28).
