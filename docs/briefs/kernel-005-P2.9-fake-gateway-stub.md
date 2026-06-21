# /tdd brief — fake_gateway_stub

## Feature
A recorded/fake `ModelGateway` that returns deterministic, schema-valid `ModelGatewayResponse`s per role, built by feeding a deterministic fake `providerCall` + `capabilityFor` into the real `createGateway` (P2.4) — so the stub exercises the REAL validate/repair/reject discipline with fixed outputs, behaving exactly like production but without live providers. It is the freeze-bundle fork artifact: the verifier/selection/demo tracks (and the kernel's own integration tests) run against it. Configurable to emit a repairable output and a reject output so the accept/repair/reject discipline is exercisable; deterministic/replayable; carries no energy representation (rule #8); imports no vendor SDK (rule #9).

## Use case + traceability
- **Task ID:** P2.9 (recorded/fake gateway stub for the parallel-track fork)
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (the `ModelGateway` seam — domain code sees only Request/Response + capability; a deterministic fake of that seam lets dependent subsystems run without providers)
- **Related context:** P2.1 (`171fe23`) port + frozen contracts; P2.4 (`9c8c886`) shipped `createGateway(deps)` where `deps = {providerCall, capabilityFor, resolveSchema?}` + `applyStructuredOutputDiscipline` + the `ProviderCallFn`/`ProviderResult` types (all re-exported from `apps/api/src/model-gateway/index.ts`). This slice **completes the gateway chain** (P2.1 → P2.4 → P2.9) — one of the two freeze-bundle chains. No Postgres. Non-invariant (a test double); no Step-8 security-reviewer fan-out. ModelRole is the frozen closed 7-union (population_generator, critic, subtype_check, embedding, final_judge, fusion_synthesis, retrieval).

## Acceptance criteria (what "done" means)
- [ ] `createFakeGateway(config?)` returns a `ModelGateway` (the same port) — built by feeding a deterministic fake `providerCall` + `capabilityFor` into the real `createGateway`, so the stub runs the genuine P2.4 discipline (NOT a re-implemented one)
- [ ] Deterministic per-role fixtures cover all 7 `ModelRole`s, including a **deterministic embedding vector** (+ `embeddingModelId` + `dimension`, with `vector.length === dimension`) for the `embedding` role and a **curated retrieval result** (tagged fallback-sourced) for the `retrieval` role
- [ ] The stub is configurable to produce a **repairable** output (fails the caller's schema once, then a valid repair) and a **reject** output (stays invalid) so accept/repair/reject is exercisable without a provider — driven through the real discipline
- [ ] **Deterministic/replayable:** same `config` + same request → byte-identical response; no `Date.now()`/`Math.random()`/ambient nondeterminism
- [ ] **Rule #8:** the stub never represents a failed/repaired/rejected attempt as energy-bearing — `ModelGatewayResponse` has no energy field, so this is structural; the stub emits no `energy.spent` and carries `providerMeta` on every response
- [ ] **Rule #9:** the stub imports no vendor SDK (it is a fake); the type surface stays the frozen contracts only
- [ ] The stub is selectable via config/env (defaults < file < env) so a dependent track runs against it without code changes (thin factory seam now; full registry-based selection wires in P2.2 — see Step-2.5 Q3)
- [ ] `/preflight` clean

## Wiring / entry point (Step 7.5)
The stub is a consumed deliverable, not a production runtime entry: its first consumers are the **verifier / selection / demo tracks** (post-freeze-merge, forking against it per the §2.5 seam) and the **kernel's own P3 integration tests** (running the generation loop against the fake). It is reachable now via its own tests + the `createFakeGateway` factory; selection-via-config is the seam dependent tracks use. So: `first consumers — verifier/selection/demo tracks + kernel P3 integration tests; selectable via config/env (full registry-based selection in P2.2)`.

## Files expected to touch
**New:**
- `apps/api/src/model-gateway/stub/fake-gateway.ts` — `createFakeGateway(config?)` (fake `providerCall` + `capabilityFor` → real `createGateway`)
- `apps/api/src/model-gateway/stub/fixtures.ts` — per-role deterministic outputs (incl. embedding vector + curated retrieval result)
- `apps/api/test/unit/model-gateway/stub/fake-gateway.test.ts`

**Modified:**
- `apps/api/src/model-gateway/index.ts` — export `createFakeGateway` (the fork artifact dependent tracks import), per Step-2.5 Q3

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/model-gateway/stub/fake-gateway.test.ts`:

1. **`test_stub_implements_port_valid_per_role`** — for each of the 7 `ModelRole`s, `createFakeGateway().call(requestForRole)` resolves a response that `ModelGatewayResponse.safeParse`s and is `accepted` with a role-appropriate output.
   - Why: §6 — a deterministic, schema-valid fake of the port for every role.
2. **`test_embedding_role_returns_deterministic_vector`** — the `embedding` role output carries a fixed vector with `embeddingModelId` + `dimension`, `vector.length === dimension`, identical across calls.
   - Why: §6 + replay (a deterministic, persistable embedding so dependent tracks/replay are stable).
3. **`test_retrieval_role_returns_curated_result`** — the `retrieval` role returns a curated result tagged fallback-sourced.
   - Why: §6 retrieval grounding with a curated-corpus fallback shape.
4. **`test_repairable_config_drives_one_repair`** — configured repairable → the response is `validationResult='repaired'` (the real discipline ran one repair on the stub's first-invalid output).
   - Why: exercises P2.4 accept/repair/reject without a provider.
5. **`test_reject_config_drives_rejection`** — configured reject → `accepted=false`, `validationResult='rejected'`, `rejection` populated.
   - Why: same, the reject branch.
6. **`test_deterministic_same_config_same_response`** — two calls with the same config + request produce deep-equal responses (no nondeterminism).
   - Why: replayability — dependent tracks need stable behavior.
7. **`test_no_vendor_sdk_no_energy_field`** — `providerMeta` present on every response; the stub module imports only `@doppl/contracts` + the local gateway seam (no vendor SDK); no energy-bearing field is produced.
   - Why: rule #9 (no SDK) + rule #8 (no energy representation), structurally.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (consumes frozen contracts + the P2.4 seam).
- **Orchestrator doc rows to write hot (Step 9):** none anticipated (a stub adds no contract surface). Possible LESSONS entry (fake-by-faking-the-provider-layer-not-the-discipline) if the implementer judges it durable.
- **Shared-contract seam model touched?** No — the stub produces frozen-contract-valid values; redefines nothing.

## Things to flag at Step 2.5
1. **Build via the real `createGateway` vs a standalone port impl.** My default vote: **fake `providerCall` + `capabilityFor` → real `createGateway`** — the stub then runs the genuine P2.4 discipline, so dependent tracks see real validate/repair/reject behavior (more faithful, no duplicated discipline). A standalone port impl would re-implement the discipline and could drift.
2. **Repairable/reject configuration shape.** My default vote: a per-role (or per-call) **mode** (`valid | repairable | reject`) the fake `providerCall` honors by returning a schema-passing / first-invalid-then-valid / persistently-invalid raw output; default mode `valid`.
3. **Selection seam (config/env).** My default vote: a thin **factory + env flag** now (e.g. a `selectGateway(config)` that returns the fake when configured), exported from the model-gateway barrel; full registry-based selection wires in P2.2. Don't pull registry work forward.
4. **Embedding fixture dimension.** My default vote: a **small fixed dimension** (e.g. 8) for test speed, with `embeddingModelId='stub-embedding'` and `vector.length === dimension` — dependent tracks know it's a stub vector; the real `text-embedding-3-small` 1536-dim comes via P2.6. Flag if a track needs the real dimension.

## Dependencies + sequencing
- **Depends on:** P2.1 (`171fe23`), P2.4 (`9c8c886`). Frozen P0.11/P0.12 gateway contracts. No Postgres.
- **Blocks:** the freeze-bundle merge (this completes the gateway chain) → verifier/selection/demo tracks fork against it; kernel P3 integration tests run against it.

## Estimated commit count
**1.** Non-invariant test double (completes the gateway chain). One `feat(model-gateway):` (or `test(model-gateway):` — your call at Step 9) commit. No Step-8 security-reviewer fan-out (not a safety-invariant implementation; the no-energy/no-SDK properties are structural and unit-asserted in test 7).

## Lessons-logged candidates anticipated
- **Convention candidate** — "fake a provider seam by faking the PROVIDER layer (a deterministic `providerCall`) fed into the REAL discipline/orchestration, not by re-implementing the port — the stub then can't drift from production behavior; configure valid/repairable/reject via the fake provider's output, not by bypassing the discipline."

## How to invoke
1. **Read this brief end-to-end.**
2. **Run `/tdd fake_gateway_stub`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 4 design questions, send the Step-2.5 write-up.
5. **Step 9** — surface the lesson candidate; note this completes the gateway chain (freeze-bundle progress).
