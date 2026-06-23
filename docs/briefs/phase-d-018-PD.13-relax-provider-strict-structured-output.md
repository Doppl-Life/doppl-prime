# /tdd brief — relax_provider_strict_structured_output_keep_gateway_validation

## Feature
PD.13 — fix the live-path HTTP 400 (the PD.8c finding) by **relaxing the OpenRouter adapter's provider-side structured-output mode** (`response_format: {strict:true, json_schema:z.toJSONSchema(schema)}` → `json_object`/`strict:false`) so a discriminated-union schema no longer trips OpenAI's strict subset → 400. **The gateway's Zod validate / repair(≤1) / reject discipline is UNCHANGED and STILL RUNS on every structured output** — that is the authoritative check (rule #5); provider strict-mode was only an optimization. User-decided option 2 (2026-06-23 via lead). Applies to **all** structured roles (population_generator / critic / subtype_check / final_judge / fusion_synthesis).

## Use case + traceability
- **Task ID:** PD.13 (the structured-output fix; unblocks the live winner — the PD.8c finding)
- **Architecture sections it implements:** `ARCHITECTURE.md §6` (the ModelGateway + provider adapter + the structured-output validate/repair/reject discipline), `§14` (**KEY SAFETY RULE #5** — model output is untrusted until schema-validated; an unvalidated output never enters the event log), `§5` (the generation loop consuming the gateway).
- **USER DECISION (lead-relayed, 2026-06-23):** fix = option (2) RELAX provider strict-mode + lean on the EXISTING gateway validate/repair/reject; timing = FIX NOW (this round, before close-out). **GUARDRAIL (rule #5, safety-load-bearing): relaxing provider strict-mode must NOT weaken validation** — the gateway's Zod validate/repair/reject MUST still run on EVERY structured output so an unvalidated output never enters the log.
- **Root cause (PD.8c live exec, curl-isolated):** `openrouter.adapter.ts` (~lines 102-107) sends `response_format:{strict:true, …z.toJSONSchema(CandidateContent)}`. `CandidateContent` is a discriminated union (LESSONS §91) → `z.toJSONSchema` emits a root `anyOf` + an optional field; OpenAI's strict structured-output subset requires a root `object` + every key in `required` → **HTTP 400** on every generation call → `provider_call_failed` ×3 → `agenome.failed` → `run.failed{no_scored_survivor}`, no winner. A plain (non-strict) curl to the same model+key → 200 (model/key fine). Likely hits all STRUCTURED_ONLY roles.
- **Related discipline:** LESSONS §23 (gateway validate/repair/reject — the `createGateway` discipline), §91 (`CandidateContent` derived schema + graceful `agenome.failed` on reject), §28 (the provider-adapter pattern — SDK behind the seam, discriminated outcome).

## Acceptance criteria (what "done" means)
- [ ] **The OpenRouter adapter no longer sends a strict-json-schema `response_format`** that OpenAI's strict subset rejects — it uses `json_object` (or `strict:false`) so a discriminated-union / optional-field schema request returns 200, not 400. (Exact mode per Step-2.5 Q1.)
- [ ] **The gateway's validate/repair(≤1)/reject STILL runs on EVERY structured output (rule #5 — UNWEAKENED):** the model output is validated against the request `schema` in `createGateway`; a malformed output → reject (→ the caller's graceful failure, e.g. `agenome.failed`); a repairable output → ≤1 repair; only a schema-VALID output is accepted. **Pin this with a test** — a garbage/invalid structured output under the relaxed mode is STILL rejected (never accepted-and-appended). This is the load-bearing safety bullet.
- [ ] **All existing gateway-discipline tests stay green** (`structured-output.test.ts`, the loop's reject→`agenome.failed` path, the critic/judge structured paths) — the fix changes the ADAPTER's provider request, not the gateway's validation.
- [ ] If `json_object` mode requires a "JSON" mention in the prompt (OpenAI constraint), that's satisfied via the trusted instruction/framing (the LESSONS §38 isolation chokepoint) WITHOUT weakening rule #5 isolation (candidate text stays DATA) — Step-2.5 Q2.
- [ ] The change applies uniformly to all STRUCTURED_ONLY roles (the adapter-level response_format), not just generation — confirm critic/judge/fusion structured calls also use the relaxed mode.
- [ ] Replay/energy invariants intact: rule #7 (the change is at the live provider boundary; replay still reads persisted outcomes, no re-call), rule #8 (a rejected/failed structured call still emits `provider_call_failed` + debits no energy).
- [ ] All unit/integration tests pass; `/preflight` clean. (Live confirmation is a SEPARATE step the impl runs after this lands — see Dependencies.)

## Wiring / entry point (Step 7.5)
The change lands in the OpenRouter provider adapter (`apps/api/src/model-gateway/adapters/openrouter.adapter.ts`) — the `response_format` it sends on a structured request. It's reached on the LIVE path (`DOPPL_GATEWAY=live` → `createLiveGateway` → `createOpenRouterProviderCall` → the adapter) for every structured role. The gateway's validate/repair/reject (`createGateway`) is the unchanged authoritative layer above it. Confirm the relaxed mode is what the live provider call actually sends (the live re-run is the end-to-end proof).

## Files expected to touch
**Modified:**
- `apps/api/src/model-gateway/adapters/openrouter.adapter.ts` — relax the structured-output `response_format` (strict-json-schema → `json_object`/`strict:false`).
- `apps/api/test/unit/model-gateway/adapters/openrouter.adapter.test.ts` — the request-shape test (relaxed mode) + (if applicable) the JSON-mention assertion.
- `apps/api/test/unit/model-gateway/structured-output.test.ts` (or the relevant gateway-discipline test) — strengthen/confirm the rule-#5 pin: validation still rejects a malformed output under the relaxed mode.

If the relaxed mode needs a small shared helper (e.g. a `STRUCTURED_RESPONSE_FORMAT` const) or touches the request assembler, flag at Step 2.5.

## RED test outline (Step 2)
1. **`adapter_structured_request_uses_relaxed_mode`** — a structured request (with a discriminated-union schema) sends `response_format` = `json_object`/`strict:false`, NOT `{strict:true, json_schema:…}`. Why: §6 — the fix; no strict-subset 400.
2. **`gateway_still_rejects_invalid_output_under_relaxed_mode`** (LOAD-BEARING, rule #5) — with the relaxed adapter mode, a model output that fails the request `schema` is STILL rejected by the gateway (repair≤1 then reject → the caller's graceful failure), never accepted-and-appended. Why: §14 rule #5 — validation UNWEAKENED (the gateway is the authoritative check, provider strict-mode was the optimization).
3. **`gateway_repairs_then_accepts_valid_output`** — a repairable/valid output under the relaxed mode is repaired(≤1)/accepted as before. Why: §6 discipline preserved (LESSONS §23).
4. **`relaxed_mode_applies_to_all_structured_roles`** — the relaxed response_format is used for every STRUCTURED_ONLY role (generation/critic/subtype_check/judge/fusion), not just generation. Why: the finding likely affects all; uniform fix.
5. **`rejected_structured_call_no_energy`** — a rejected/failed structured call emits `provider_call_failed` + debits no energy. Why: rule #8 intact.

> The fix is verified end-to-end by the LIVE RE-RUN (separate step) — but the discipline (rule #5 unweakened) is pinned deterministically here, no live provider needed.

## Cross-doc invariant impact
- **Model field changes:** none. ZERO new contract surface (changes the adapter's provider request shape; the gateway/contract validation is unchanged).
- **Orchestrator doc rows to write hot (Step 9):** an **Architecture-doc note** (§6/§14) — the provider structured-output mode is `json_object` (relaxed) with the gateway Zod validate/repair/reject as the authoritative check (provider strict-mode was an optimization incompatible with discriminated-union schemas). The orch writes it. A **LESSON candidate** (provider strict-mode ⊄ discriminated-union schema; rely on the gateway discipline).
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Relaxed mode: `json_object` vs `strict:false`-with-schema vs omit `response_format`.** My default vote: **`json_object`** (the reliable OpenAI/OpenRouter mode that doesn't enforce the strict subset) — and verify the live provider accepts it (the live re-run confirms). Flag what you found in your curl isolation.
2. **JSON-mention requirement.** `json_object` (OpenAI) requires the word "JSON" in the prompt. My default: add it to the TRUSTED instruction/framing (the LESSONS §38 isolation chokepoint's system message), keeping the candidate as DATA (rule #5 isolation unweakened). Confirm it doesn't perturb the LESSONS §38 byte-identical-instruction property.
3. **Per-role vs adapter-global.** My default: relax at the ADAPTER level so it's uniform across all STRUCTURED_ONLY roles. Flag if a role needs to keep strict (none should — they all hit the same subset).

## Dependencies + sequencing
- **Depends on:** PD.9 (live gateway), PD.10 (`CandidateContent`), the gateway discipline (§6, LESSONS §23/§91). Independent of PD.12 (different file) — can run in parallel.
- **Blocks:** the **LIVE RE-RUN** — after this lands, the impl RE-SOURCES the user's gitignored `.env` + re-runs `pnpm -C apps/api test:smoke:live` to CONFIRM the live path reaches `run.completed` with a `'selected'` winner (the 2 PD.8c failures now pass). If pop3/gen2 doesn't reliably hit a winner, bump `DOPPL_MAX_POPULATION`/`DOPPL_MAX_GENERATIONS` a notch (+ a runbook note). Report ran-live + winner-confirmed (HONEST — no fabrication). This re-run is the user's acceptance of the fix.

## Estimated commit count
**1.** A focused, SAFETY-ADJACENT slice (the structured-output/validation path, rule #5) — its OWN commit, NOT bundled with PD.12 or anything else (safety-bundling rule). **security-reviewer (invariant) at Step 8** — confirm the gateway validate/repair/reject still runs on every structured output (rule #5 unweakened) + the LESSONS §38 candidate-as-DATA isolation is intact.

## Lessons-logged candidates anticipated
- **Convention candidate** — "provider strict structured-output (OpenAI strict subset) is incompatible with a discriminated-union / optional-field JSON schema (root `anyOf` → 400); relax the provider `response_format` to `json_object` and rely on the gateway's Zod validate/repair/reject as the AUTHORITATIVE check (provider strict-mode is only an optimization, never the safety mechanism — rule #5)."
- **Architecture-doc note** — §6/§14: the provider structured-output mode + the gateway-is-authoritative validation boundary.

## How to invoke
1. Read this brief + your PD.8c curl diagnosis + `openrouter.adapter.ts` + the gateway discipline (`createGateway`, LESSONS §23/§91).
2. Run `/tdd relax_provider_strict_structured_output_keep_gateway_validation` (`apps/api` hat).
3. Step 0 (Restate) — confirm: relax the PROVIDER response_format; the gateway validate/repair/reject stays the authoritative check (rule #5 unweakened).
4. Step 2.5 — Q1–Q3.
5. Step 8 — security-reviewer (invariant — rule #5 validation discipline).
6. Step 9 — flag the LESSON + arch note. THEN (post-ship) run the live re-run to confirm the winner; report ran-live + winner-confirmed.
