# /tdd brief — retrieval_web_search_adapter

## Feature
The retrieval/web-search adapter behind the `ModelGateway` — a **pluggable live-search seam** (no vendor pinned) that grounds critics/zeitgeist, with an **operator-curated static prior-art/signals corpus** as the rehearsed fallback. Results are returned in a self-contained, persist-into-the-originating-event shape that is **`EvidenceRef`-resolvable within the Postgres tier** (kind `prior_art`/`signal`), so **replay never re-calls the web** (rule #7); failed live attempts **never debit energy** (rule #8); the web-search **tool-call cost is reported in `providerMeta`** for success-only tool-call energy accounting.

## Use case + traceability
- **Task ID:** P2.7
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (model gateway & provider integration — retrieval grounding, demo-safety, RISK-004/005), §13 (provider cost/latency — tool-call cost surfaced in `providerMeta`), §14 (security — creds env-only, never persisted).
- **Consumed frozen contract (Phase 0, not re-implemented):** `EvidenceRef` (+`EvidenceKind`) — `packages/contracts/src/domain/evidence-ref.ts` (§4; frozen P0.5). The adapter *builds* an `EvidenceRef`, never redefines it (single import boundary, lesson 5; consumer-agreement per the P0.14 contract-test surface).
- **Related context:** mirrors the **lesson 28 provider-adapter pattern** shipped in P2.5 (OpenRouter generation — `kernel-009`) and P2.6 (OpenAI embedding — `kernel-010`): reuses `withRetry` (`adapters/retry.ts`), the `ProviderCallError`→gateway-rejected mapping (`gateway.ts`), and the `ProviderCallFn`/`ProviderResult` seam (`structured-output.ts`). The `retrieval` role already resolves in the registry (P2.2 — `DEFAULT_MODEL_REGISTRY.retrieval`, capability `NONE`).
- **LEAD/USER DIRECTIVE (recorded):** **pluggable live-search seam, NO vendor pin now** — the concrete live provider/SDK is deferred to the §6 retrieval spike; the curated corpus is the always-available fallback. User wants speed; the seam is no-regret.

## Acceptance criteria (what "done" means)
- [ ] `createRetrievalProviderCall(deps)` returns a `ProviderCallFn` (fits the gateway's injected seam); for the `retrieval` role it resolves a `ProviderResult` whose `output` is a `RetrievalOutput` (`{ query, results, fallbackSourced, failures }`) plus a `providerMeta`.
- [ ] **Live success path:** when a live-search client is injected AND succeeds, results are returned tagged `fallbackSourced: false`, and `providerMeta.costEstimate` carries the web-search **tool-call cost** (so the kernel accounts tool-call energy on success only — §13).
- [ ] **Fallback path (never rejects):** when **no live client** is configured OR the live attempts **terminally fail** (bounded retry + per-attempt timeout exhausted, incl. rate-limit/timeout), the adapter returns **curated-corpus** results tagged `fallbackSourced: true` — it does **NOT** throw `ProviderCallError` and does **NOT** reject the call (rehearsed demo-safety, §6 RISK-004/005). This is the deliberate divergence from P2.5/P2.6 (which throw→reject on terminal failure).
- [ ] **Empty curated match is valid:** a query with no curated hit returns `results: []`, still `fallbackSourced: true`, no throw ("no grounding found" is data the caller handles, not a failure).
- [ ] **No energy on failed attempts (rule #8):** failed live attempts are surfaced in `output.failures` as `AttemptFailure{attempt,reason}` for the caller's `provider_call_failed` events; the fallback `providerMeta` carries `tokensIn/tokensOut = 0` and zero/absent `costEstimate` (no external tool call → no tool-call energy).
- [ ] **`EvidenceRef`-resolvable within Postgres (rule #7):** a pure helper `retrievalEvidenceRef(item, originatingEventId, kind)` returns a **frozen `EvidenceRef`** (`EvidenceRef.parse` passes) of kind `prior_art` or `signal`, **anchored by `eventId`** (Postgres-resolvable), retaining the source `uri`/`label` only as provenance — **never an external-only ref** (an item with a `uri` but no `eventId` is not a valid output of this helper).
- [ ] **Pure curated lookup (replay-safe):** `searchCuratedCorpus(corpus, query, { kind, maxResults })` is a pure function over the static corpus passed in (no IO/clock/random — lesson 4): deterministic, returns ≤ `maxResults` items, tags each with the requested `kind`.
- [ ] **Vendor-free surface (rule #9):** the live-search client interface (`RetrievalSearchClient`) is OUR vendor-free seam; **no vendor SDK is imported** in this slice (pluggable, deferred to the §6 spike) — confirmed by the forbidden-pattern grep (`from ['"](openai|@anthropic-ai|openrouter)`) staying clean for `retrieval.adapter.ts`.
- [ ] **Credential set unchanged:** `assertProviderCredentials` is NOT modified — no retrieval credential joins the required set (the curated fallback needs no creds; the OpenRouter-only + curated-retrieval config stays valid; the registry already documents this — `registry.ts:17–19`).
- [ ] **Gateway conformance:** routed through the **real** `createGateway` with a `retrieval`-role request (no schema), the response is `{ accepted: true, validationResult: 'accepted', output: <RetrievalOutput>, providerMeta }` — no gateway change required (retrieval capability = `NONE` → the existing no-schema path returns the output as-is).
- [ ] All unit tests in `apps/api/test/unit/model-gateway/adapters/retrieval.adapter.test.ts` + `apps/api/test/unit/model-gateway/adapters/curated-corpus.test.ts` pass.
- [ ] `/preflight` clean.
- [ ] **Replay-determinism (rule #7) — shape pin:** the adapter is never on the replay path; the returned `RetrievalOutput` is self-contained + persistable (no external-only pointers) so once the caller persists it into the originating event, grounding resolves from Postgres with **zero web calls**. *This slice pins the SHAPE + the no-external-only-ref guarantee; the actual persist-into-event + replay-read is the caller's job (see Wiring).*

## Wiring / entry point (Step 7.5)
**none — wiring lands in P3.1** (boot injects `createRetrievalProviderCall(...)` into `createGateway`, mirroring how P2.5/P2.6 adapters are wired) **and the first real consumers are P4** (critic factual-grounding / prior-art checks) **and P5** (zeitgeist `currentSignals` + prior-art / falsifiability grounding) — §6/§7. The adapter is **reachable now** via the gateway's existing no-schema path (retrieval capability = `NONE`). Per lesson 20 explicit-deferral: first-impl (P3.1 boot) + first-consumer (P4/P5) are named real tasks — **no tested-but-unwired silent gap**.

## Files expected to touch
**New:**
- `apps/api/src/model-gateway/adapters/retrieval.adapter.ts` — `createRetrievalProviderCall`; the `RetrievalSearchClient` seam; `RetrievalOutput` / `RetrievalResultItem` types; the pure `retrievalEvidenceRef` helper. (Optional thin `createRetrievalSearchClient(env)` "not-configured" guard — see Step-2.5 Q2.)
- `apps/api/src/model-gateway/adapters/curated-corpus.ts` — `loadCuratedCorpus` / `searchCuratedCorpus` (pure lookup; no IO).
- `apps/api/src/config/prior-art-corpus.config.ts` — `DEFAULT_PRIOR_ART_CORPUS` (operator-curated static prior-art/signals entries; carries NO secrets).
- `apps/api/test/unit/model-gateway/adapters/retrieval.adapter.test.ts`
- `apps/api/test/unit/model-gateway/adapters/curated-corpus.test.ts`

**Modified:**
- `apps/api/src/model-gateway/index.ts` — export the retrieval adapter surface.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/model-gateway/adapters/retrieval.adapter.test.ts`:

1. **`retrieval_live_success_tagged_not_fallback`** — inject a fake `RetrievalSearchClient` returning hits; call the providerCall for the `retrieval` role.
   - Asserts: `output.fallbackSourced === false`; results mapped from the live client; `providerMeta.costEstimate` set (tool-call cost).
   - Why: §6 live grounding + §13 tool-call cost surfaced for success-only energy.

2. **`retrieval_no_live_client_falls_back_to_curated`** — build the providerCall with NO live client (or `client: undefined`).
   - Asserts: `output.fallbackSourced === true`; results sourced from `DEFAULT_PRIOR_ART_CORPUS`; `providerMeta.tokensIn/Out === 0` and `costEstimate` 0/absent; no throw.
   - Why: §6 demo-safety — curated fallback is the MVP default when no provider is wired.

3. **`retrieval_live_terminal_failure_falls_back_not_rejects`** — fake live client always throws; bounded retry exhausts (inject deterministic `sleep`/`timeoutSignal` per the `retry.ts` seams).
   - Asserts: **no throw**; `output.fallbackSourced === true`; `output.failures` carries the per-attempt `{attempt,reason}` list.
   - Why: §6 RISK-004/005 (rehearsed fallback, never reject) + rule #8 (failures surface, never debit).

4. **`retrieval_failed_attempts_debit_no_energy`** — same as #3, inspect `providerMeta`.
   - Asserts: fallback `providerMeta` has `tokensIn/Out === 0` and zero/absent `costEstimate`; `output.failures.length >= 1`.
   - Why: rule #8 — energy = successful productive spend only.

5. **`retrieval_empty_curated_match_returns_empty_valid`** — query with no curated hit, no live client.
   - Asserts: `output.results === []`, `output.fallbackSourced === true`, no throw.
   - Why: "no grounding found" is valid data, not a call failure.

6. **`retrieval_evidence_ref_anchored_by_event_id`** — `retrievalEvidenceRef(item, 'evt-123', 'prior_art')`.
   - Asserts: `EvidenceRef.parse(result)` passes; `kind === 'prior_art'`; `eventId === 'evt-123'`; `uri`/`label` carried as provenance.
   - Why: §4 `EvidenceRef` resolves within the Postgres tier (rule #7); consumes the frozen P0.5 contract.

7. **`retrieval_evidence_ref_never_external_only`** — call the helper across `prior_art` and `signal` kinds.
   - Asserts: the built ref ALWAYS carries `eventId` (Postgres-resolvable); a `signal` kind is accepted; an unsupported kind is rejected/narrowed.
   - Why: "never a pointer to a non-authoritative external store."

8. **`retrieval_provider_call_fits_gateway_no_schema_path`** — inject the providerCall into the **real** `createGateway` (+ a `capabilityFor` returning `NONE`); call with a `retrieval`-role request (no schema).
   - Asserts: `response.accepted === true`, `response.validationResult === 'accepted'`, `response.output` is the `RetrievalOutput`.
   - Why: lesson 24 (run the genuine gateway, never bypass) + §20 seam conformance.

Tests in `apps/api/test/unit/model-gateway/adapters/curated-corpus.test.ts`:

9. **`curated_search_is_pure_deterministic`** — same corpus+query+params twice.
   - Asserts: identical results; ≤ `maxResults`; each tagged the requested `kind`; no IO/clock/random touched.
   - Why: lesson 4 + replay-safety (rule #7).

10. **`curated_search_no_match_returns_empty`** — query matching nothing.
    - Asserts: `[]`.
    - Why: empty is valid.

> **Positive-guard discipline (lesson 10):** every reject/negative test leads with a positive `parse(valid)` / happy-path guard so it fails loudly if an export vanishes.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE.** Consumes frozen `EvidenceRef` (P0.5); `RetrievalOutput` / `RetrievalResultItem` are **adapter-local** shapes (not Appendix-A contracts) — the caller maps result items → frozen `EvidenceRef` at persist time.
- **Orchestrator doc rows to write hot (Step 9 routing):** none required. Likely **Architecture-doc note candidate** (§6) — the never-reject/always-curated-fallback semantics + the pluggable-seam (no-vendor-pin) decision; orchestrator writes at `/orchestrate-end` if Step 9 surfaces it.
- **§2.5-seam (shared-contract) model touched?** `EvidenceRef`'s §4 is crossed by §2.5 edges, but this slice **consumes** it (builds a ref), does not extend/define it — so **no new schema-snapshot test** is owned here. Test #6 asserts `EvidenceRef.parse` passes (consumer-agreement against the frozen schema; never redefine — P0.14 contract-test convention).

## Things to flag at Step 2.5
1. **Total-failure semantics — always fall back to curated (never reject), even when curated is empty?** Options: (a) always fall back, empty match → `results:[]`+`fallbackSourced:true`, never `ProviderCallError`; (b) reject when even curated yields nothing. My default vote: **(a) always fall back, never reject** — the curated corpus is the rehearsed demo-safety net (§6 RISK-004/005); "no grounding" is valid data, not a call failure. This is the **load-bearing behavioral divergence** from P2.5/P2.6.
2. **Concrete live-search client — ship a factory now, or seam-only?** Options: (a) seam interface + curated fallback only, no vendor import, P3.1 boot passes `client: undefined`; (b) add a thin `createRetrievalSearchClient(env)` that throws "not configured" until a provider is wired; (c) pin a vendor now. My default vote: **(a) seam-only, no vendor import** (per the user directive — provider deferred to the §6 spike); the no-live-client path IS the MVP default. A (b)-style not-configured guard is acceptable if it keeps `retrieval.adapter.ts` vendor-free.
3. **`retrievalEvidenceRef` — adapter-owned pure helper vs. caller-owned mapping?** My default vote: **adapter-owned pure helper** — pins the "EvidenceRef-resolvable within Postgres" + no-external-only-ref guarantees (rule #7) in THIS slice and consumes the frozen P0.5 contract directly. The caller (P4/P5) calls it with the persisted originating `eventId`. (Alternative: only shape results + document the mapping — leaves rule #7's EvidenceRef leg untested until P4; weaker.)
4. **Retrieval credential — add to `assertProviderCredentials` now?** My default vote: **NO** — leave `[OPENROUTER_API_KEY, OPENAI_API_KEY, DATABASE_URL]` unchanged. The curated fallback needs no creds; the registry already records the retrieval key is "that slice's concern, not here" (`registry.ts:17–19`), to be loaded lazily by the live-client factory when a concrete provider lands. Adding a hard-required retrieval key would break the OpenRouter-only + curated-retrieval MVP config. **Supersedes** the earlier P2.2 "retrieval key → P2.7" anticipation, given the pluggable-seam decision.
5. **`kind` (prior_art vs signal) — per-call param or per-item classification?** My default vote: **per-call `kind` param** — the two §7 grounding consumers are distinct (prior-art checks vs. zeitgeist `currentSignals`); the caller passes the desired `kind`, results are tagged uniformly. Simpler + matches the consumer split.

## Dependencies + sequencing
- **Depends on:** P0.5 (frozen `EvidenceRef`) ✓ · P2.2 (registry — `retrieval` route resolves) ✓ · P2.4 (gateway no-schema path + `ProviderCallFn`/`ProviderResult` seam) ✓ · reuses P2.5's `retry.ts` (`withRetry`) + `ProviderCallError` ✓.
- **Blocks:** P3.1 boot wiring (injects the retrieval providerCall into `createGateway`) · P4 critic grounding / P5 zeitgeist `currentSignals`+prior-art checks (first consumers) · P1.8 replay reader (relies on the persist-into-event shape, rule #7).

## Estimated commit count
**1 — SOLO, never bundled.** Safety-invariant slice: pins **rule #7** (replay never re-calls the web) and **rule #8** (energy = success-only spend). Per root `CLAUDE.md` "Key safety rules" + the standing bundle-where-safe directive, safety-invariant slices always get their OWN brief + commit. **security-reviewer fires** (invariant policy) — review the slice diff against rules #7/#8/#9 + the credential/redaction boundary.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the retrieval adapter diverges from the generation/embedding adapter pattern: a terminal provider failure **FALLS BACK to the curated corpus** (tagged `fallbackSourced`) and **NEVER rejects** — the rehearsed demo-safety net; only generation/embedding throw→reject." (extends lesson 28)
- **Architecture-doc note candidate** — §6: the retrieval adapter's never-reject/always-curated-fallback semantics + the **pluggable live-search seam** (no vendor pin; provider deferred to the §6 spike); the retrieval key loads lazily in the live-client factory, not in `assertProviderCredentials`.
- **Future TODO — operational** — when a concrete live-search provider is wired (§6 spike): add its env var to the live-client factory's fail-fast check; decide whether it joins `assertProviderCredentials`' required set or stays optional (curated-fallback-always-available); set a real per-role timeout + cost/rate-limit envelope (RISK-004/005).

## How to invoke
1. **Read this brief end-to-end** — don't skip "Things to flag at Step 2.5"; the five design questions (esp. Q1 never-reject semantics + Q4 credential) want answers before tests.
2. **Run `/tdd retrieval_web_search_adapter`** in the (warm) implementer session.
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 1 (Identify files)** — confirm the file list matches "Files expected to touch."
5. **Step 2.5 (test-design review)** — send the per-test `Asserts: <invariant> (§anchor)` write-up + the acceptance-bullet coverage map; take the default votes or ping back with disagreement. Don't proceed to Step 4 until the orchestrator signs off.
6. **Step 9 (summarize)** — surface anything beyond the anticipated lessons-logged candidates.
