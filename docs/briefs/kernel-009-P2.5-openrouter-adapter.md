# /tdd brief — openrouter_generation_adapter

## Feature
The OpenRouter generation adapter — the first vendor-SDK slice — providing the `providerCall` the gateway injects: it imports the OpenRouter (OpenAI-compatible) SDK **only behind the ModelGateway port** (rule #9; the vendor type never leaks to domain/runtime), makes bounded retries (default 2) with short backoff + a per-role timeout per attempt, then one fallback-route attempt before a terminal reject. Each failed attempt surfaces `provider_call_failed{attempt,reason}` info and **never debits energy / never emits `energy.spent`** (rule #8 — energy is the kernel's success-only concern, P3.5); a successful response returns `providerMeta` (actual provider/modelId/gatewayRequestId + token usage) for the kernel's post-call energy reconcile. Strict structured-output mode is requested where supported; the raw output is returned for P2.4's validate/repair/reject.

## Use case + traceability
- **Task ID:** P2.5
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (OpenRouter primary; bounded retry + per-role timeout + one fallback route; strict structured-output; providerMeta for energy reconcile), `ARCHITECTURE.md §14` (provider SDKs only behind the gateway — rule #9; credentials env-only)
- **Related context:** consumes the registry (P2.2 `8df860a`, `resolve(role)` → route provider/modelId) + the frozen `ModelGatewayResponse`/`ProviderMeta` (P0.12/P0.9). Plugs into `createGateway({providerCall, capabilityFor, resolveSchema})` (P2.4 `9c8c886`) as the real `providerCall`; `selectGateway({useStub:false})` (P2.9) wires it. Energy is NOT debited here (no ledger until P3.5) — the adapter only SURFACES failure info + returns providerMeta. **Safety-adjacent (rule #9 SDK boundary + rule #8 no-energy-on-failure)** → solo commit + security-reviewer fan-out at Step 8. Unit-testable with a **mocked SDK** (the one place a double is allowed — provider SDK behind the gateway); no live providers, no PG.

## Acceptance criteria (what "done" means)
- [ ] The adapter imports the OpenRouter/OpenAI-compatible SDK and is reachable **only via the ModelGateway port**; the vendor SDK type never appears in the adapter's exported surface (rule #9 — domain/runtime see only `ModelGatewayRequest`/`Response`/`ProviderMeta`)
- [ ] **Bounded retries** (default 2, configurable but always finite) with short backoff; a **per-role timeout** applies per attempt; after retries, **one fallback-route attempt** is made before a final reject
- [ ] Each failed attempt surfaces enough for a `provider_call_failed{attempt,reason}` event; failed/retried/fallback attempts **never emit `energy.spent` and never debit** (rule #8 — the adapter does no energy accounting; it returns failure info for the kernel)
- [ ] A terminal reject after retries + fallback returns `accepted=false` with `rejection` populated + `providerMeta` carried — it **fails the call, not the whole run**
- [ ] A successful response returns `providerMeta` reflecting the **actual** provider/modelId/gatewayRequestId + token usage (tokensIn/tokensOut) for the kernel's post-call energy reconcile
- [ ] Strict structured-output mode is requested from OpenRouter where supported; the **raw provider output is returned** for P2.4's validate/repair/reject (the adapter does NOT itself validate)
- [ ] Credentials load only from env (the registry's `assertProviderCredentials`, P2.2) — no key in the adapter's code/logs/returned objects (rule #4)
- [ ] `/preflight` clean; **security-reviewer fan-out at Step 8** (rule #9 SDK-boundary + rule #8 no-energy-on-failure focus)

## Wiring / entry point (Step 7.5)
The adapter exports a `providerCall`-shaped function (the `ProviderCallFn` P2.4 defined) that `createGateway` injects; `selectGateway({useStub:false})` returns a gateway backed by this adapter. So: `first consumer — selectGateway's real path + createGateway`; the full live-gateway boot (registry + this adapter + env creds in the running server) completes at **P3.1**. Exercised now via a mocked SDK through the adapter → createGateway → discipline.

## Files expected to touch
**New:**
- `apps/api/src/model-gateway/adapters/openrouter.adapter.ts` — the adapter (`providerCall` over the SDK)
- `apps/api/src/model-gateway/adapters/retry.ts` — bounded retry + per-role timeout + fallback policy (reusable by P2.6/P2.7)
- `apps/api/test/unit/model-gateway/adapters/openrouter.adapter.test.ts` (mocked SDK)

**Modified:**
- `apps/api/src/model-gateway/index.ts` — export the adapter factory (per Q-barrel)
- `apps/api/package.json` + `pnpm-lock.yaml` — add the OpenRouter/openai SDK dep (first vendor SDK; explicit `git add`, lead reconciles lockfile at merge)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/model-gateway/adapters/openrouter.adapter.test.ts` (**mock the SDK**; `spec(§6)`/`spec(§14)`):

1. **`test_success_returns_provider_meta`** — a successful SDK call → raw output returned + `providerMeta` (actual provider/modelId/gatewayRequestId + tokensIn/Out) `ProviderMeta.safeParse`-valid. Why: §6 providerMeta for reconcile.
2. **`test_bounded_retry_then_success`** — fail once → retry → success; retry count ≤ default (2). Why: §6 bounded retry.
3. **`test_retry_exhaust_then_fallback_then_success`** — primary fails all retries → one fallback-route attempt → success. Why: §6 one fallback.
4. **`test_terminal_reject_after_retries_and_fallback`** — all attempts (retries + fallback) fail → `accepted=false`, `rejection` populated, `providerMeta` carried; the call fails, no throw that kills the run. Why: §6 terminal reject.
5. **`test_per_role_timeout_counts_as_failed_attempt`** — a timed-out attempt is a failed attempt (emits `provider_call_failed{attempt,reason:timeout}` info), bounded by the per-role timeout. Why: §6 per-role timeout + finiteness.
6. **`test_failed_attempts_never_energy_bearing`** (rule #8) — failed/retried/fallback attempts produce NO energy representation (no `energy.spent`, no energy field); only `provider_call_failed` info. Why: §8 success-only (structural — adapter does no energy accounting).
7. **`test_no_vendor_type_in_adapter_surface`** (rule #9) — the adapter's exported signature uses only contract types (`ModelGatewayRequest`/`Response`/`ProviderMeta`/`ProviderCallFn`); the SDK type isn't re-exported (grep-verified at Step 8). Why: §14/rule #9 SDK boundary.
8. **`test_strict_structured_output_requested`** — when the request carries a schema, strict structured-output mode is requested from the SDK; the raw output is returned unvalidated (P2.4 validates). Why: §6 structured-output requested-not-validated-here.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (consumes frozen `ModelGatewayResponse`/`ProviderMeta`).
- **Orchestrator doc rows to write hot (Step 9):** likely a LESSONS entry (the adapter pattern: SDK only behind the port + bounded-retry/timeout/fallback that's no-energy-on-failure + returns providerMeta-for-reconcile). The `retry.ts` policy is reused by P2.6/P2.7 — note it.
- **Shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **SDK choice + mock strategy.** OpenRouter is OpenAI-compatible — use the `openai` SDK pointed at the OpenRouter base URL, or an OpenRouter-specific SDK? My default vote: the **`openai` SDK with OpenRouter's base URL** (one SDK covers OpenRouter generation + direct-OpenAI embeddings in P2.6 — fewer deps; OpenAI-compatible). **Use Context7** for the version-correct `openai` client (baseURL/apiKey config, structured-output/`response_format`). Mock the SDK client in tests.
2. **`retry.ts` shape (reused by P2.6/P2.7).** My default vote: a generic `withRetry(fn, {maxRetries=2, timeoutMs, fallback})` returning a discriminated success/failure result with per-attempt `provider_call_failed` info — pure policy over an injected attempt fn, so P2.6 (embedding) + P2.7 (retrieval) reuse it. Confirm the signature.
3. **Failure surfacing — return vs throw.** My default vote: the adapter **returns** a typed result (success {output, providerMeta} | failure {attempts:[{attempt,reason}], providerMeta?}) — the gateway maps a terminal failure to `accepted=false`+`rejection`; no throw on a provider failure (it fails the call, not the run). Confirm.
4. **Where the per-role timeout value comes from.** My default vote: from the registry/config (per-role), defaulting to a sane constant; injected, not hard-coded in the adapter. Flag if you'd source it elsewhere.

## Dependencies + sequencing
- **Depends on:** P2.2 (`8df860a`, registry/route resolution), P2.4 (`9c8c886`, the discipline + `ProviderCallFn` shape), frozen P0.11/P0.12/P0.9. No PG, no live providers (mocked SDK).
- **Blocks:** `selectGateway`'s real path; P3 (the live gateway the kernel calls). `retry.ts` is reused by P2.6/P2.7.

## Estimated commit count
**1.** Safety-adjacent slice (rule #9 SDK boundary + rule #8 no-energy-on-failure). OWN commit, never bundled; **security-reviewer fan-out at Step 8** (no vendor type past the port; no energy representation on failed attempts; bounded/finite retry; no cred in code/logs).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a provider adapter imports the SDK ONLY behind the port (no vendor type in its exported surface — rule #9); its bounded-retry/per-role-timeout/one-fallback policy lives in a reusable `retry.ts`, surfaces `provider_call_failed{attempt,reason}` per failed attempt, does NO energy accounting (rule #8 — returns providerMeta for the kernel to reconcile on success only), and returns the raw output for the gateway discipline to validate."

## How to invoke
1. **Read this brief end-to-end** — first vendor-SDK slice; rule #9/#8 safety-adjacent (own commit + Step-8 security-reviewer).
2. **Use Context7** for the version-correct `openai`/OpenRouter client (baseURL, structured-output/`response_format`).
3. **Run `/tdd openrouter_generation_adapter`.**
4. **Step 2.5** — answer the 4 design questions, send the write-up.
5. **Step 8** — `security-reviewer` (SDK-boundary + no-energy-on-failure focus).
6. **Step 9** — surface the adapter-pattern lesson candidate.
