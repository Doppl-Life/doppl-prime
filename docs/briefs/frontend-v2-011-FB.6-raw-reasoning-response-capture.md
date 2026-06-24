# /tdd brief — raw_reasoning_response_capture

## Feature
Capture each successful **generation** LLM call's **raw response (+ raw reasoning when the provider surfaces it)** as a new queryable, replayable telemetry event `llm_call_telemetry` — the demo headline "click a node → see its reasoning." This is a **SECRET-SURFACE slice (key safety rule #4)**: the captured raw text rides the **existing redaction scrub** at BOTH boundaries (before the event-store append AND before any Langfuse emit) — FB.6 adds **no new scrub**. A raw payload exceeding the 1 MiB ceiling is **truncated-with-marker** (a net-new pure helper) so the append never fails on a large capture. Replay reads the persisted capture and calls **no provider** (rule #7). Energy/caps untouched (rule #8/#1 — the capture rides the already-debited call). It is an **additive frozen-contract amendment** (new `RunEventType` + new `LlmCallTelemetry` model + `CURRENT_SCHEMA_VERSION` 6→7) — announce-before-merge at the FB→cody merge.

> **SAFETY SLICE — security-reviewer INVARIANT, NEVER bundled.** The load-bearing pins: rule #4 (scrub-before-append + scrub-before-emit, reused not reimplemented), the truncation can't leak a secret, rule #7 (replay no-provider), rule #1/#8 (capture is not a spend, touches no cap/energy). Isolate this slice.

## Use case + traceability
- **Task ID:** FB.6
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (contracts & event model — the new additive `RunEventType` + `CURRENT_SCHEMA_VERSION` 6→7, reader-acceptance `≤ current`), `ARCHITECTURE.md §5` (runtime kernel — the generation-loop capture emit point; replay reads persisted outcomes, no provider), `ARCHITECTURE.md §6` (model gateway — the raw `output` + `ProviderMeta` the capture reads).
- **Related context:**
  - Phase plan `docs/planning/frontend-v2-phase-plan.md` FB.6 row (raw reasoning/response capture — secret-surface, redaction scrub before append rule #4, 1 MiB ceiling truncate-with-marker, replay-reads rule #7).
  - **Raw output source (§6):** `apps/api/src/model-gateway/adapters/openrouter.adapter.ts:138–200` returns `{ output, providerMeta }`; `ModelGatewayResponse` (`src/model-gateway/gateway.ts:65–108`) = `{ output: unknown, providerMeta: ProviderMeta }`. `output` is opaque — any inline reasoning rides inside it; **no separate reasoning field today** (so `rawReasoning` is OPTIONAL, reserved). `ProviderMeta` (`packages/contracts/src/gateway/provider-meta.ts:14–23`) carries `{provider, modelId, gatewayRequestId, tokensIn, tokensOut, costEstimate?}` — **zero secret fields**.
  - **The rule-#4 scrub seams to REUSE (do NOT reimplement — apps/api LESSON 5):** event-store `scrubEventPayload` (`src/event-store/redaction.ts:103–110`) runs at `src/event-store/append.ts:85` **before the insert** (post-validation); observability `scrubObservabilityPayload` (`packages/observability/src/redaction.ts:108–118`) runs at `packages/observability/src/emit.ts:70` **before the Langfuse emitter**; both compose the frozen `scrubSecrets` (`packages/contracts/src/security/redaction.ts:121–123`). FB.6's capture rides these automatically (the append scrub runs on EVERY payload).
  - **Append + ceiling:** `src/event-store/append.ts:60–109` validates (`validateEventPayload`, `packages/contracts/src/events/payload-map.ts:148–164`) → scrubs (`:85`) → allocates sequence → inserts. The ceiling `MAX_PAYLOAD_BYTES = 1_048_576` (`payload-map.ts:68`) currently **REJECTS** oversized payloads (`enforcePayloadCeiling`) — FB.6 must keep the capture UNDER the ceiling via truncate-with-marker so a big response never fails the append.
  - **Emit point (§5):** `src/runtime/loop/generationLoop.ts:414–420` (the `gateway.generate(...)` call) + the energy debit `:483–488`. FB.6 appends one `llm_call_telemetry` after a SUCCESSFUL generation call, actor `runtime`, correlated by `generationId`/`agenomeId`.
  - **Replay (rule #7):** `src/event-store/replay-reader.ts:37–66` reads persisted events, **no provider call** — the `llm_call_telemetry` event is pure data, returned as-is.
  - **schemaVersion pin (apps/api LESSON 100 — the version lives in 4 spots):** `packages/contracts/src/version.ts:26` (`CURRENT_SCHEMA_VERSION`), `packages/contracts/test/__schema-snapshots__/field-sets.test.ts` (`toBe(6)`→7 + `EVENT_TYPE_SNAPSHOT` + the new field-set), `src/events/event-type.ts:28–80`, `src/events/payload-map.ts:37–45` (`HIGH_TRAFFIC_PAYLOAD_MAP`).
  - Safety: rule #4 (secrets never leave the server — scrub at both boundaries), rule #7 (replay no-provider), rule #1/#8 (capture is not a productive spend — no cap/energy change), rule #5-adjacent (the captured candidate text is DATA — it's telemetry, never re-interpolated as instructions). **NOT rule #6** (this captures GENERATION output, not the judge — the judge's per-axis rationale is FB.8).

## Acceptance criteria (what "done" means)
- [ ] **Contract (additive):** a new `RunEventType` member `llm_call_telemetry` + a new frozen `LlmCallTelemetry` payload model + a `HIGH_TRAFFIC_PAYLOAD_MAP` narrowing; `CURRENT_SCHEMA_VERSION` 6→7 (additive — every `schemaVersion ≤ 6` envelope still validates); the **4-spot version pin** updated (version.ts + field-sets.test.ts `toBe(7)` + event-type.ts + payload-map.ts); a **field-set snapshot** for `LlmCallTelemetry` added (cross-track regression gate).
- [ ] **Runtime capture (§5 reachability):** a SUCCESSFUL generation LLM call in `generationLoop.ts` appends exactly one `llm_call_telemetry` event carrying `{ role, rawResponse, rawReasoning?, providerMeta? }`, correlated by `generationId`/`agenomeId`, actor `runtime`. A FAILED call appends NO capture (it already emits `provider_call_failed`; rule #8 — no capture-on-failure double-count).
- [ ] **Rule #4 (secret-surface) — reuse, no new scrub:** the captured raw text rides the EXISTING append-path `scrubEventPayload` BEFORE insert AND the EXISTING `scrubObservabilityPayload` before any Langfuse emit. A secret embedded in the raw response (e.g. `sk-…`) is **redacted in the appended event** (asserted end-to-end through the real append path).
- [ ] **1 MiB truncate-with-marker:** a raw response/reasoning exceeding the capture budget is **truncated by a pure helper with a queryable marker** so the event payload stays under `MAX_PAYLOAD_BYTES` and the append **succeeds** (never the current reject); the marker/flag is in the payload so a reader knows the capture is partial.
- [ ] **Replay (rule #7):** the `llm_call_telemetry` event is pure data; replay reconstructs it from the log with **no provider call** and no re-capture.
- [ ] **Caps/energy untouched (rule #1/#8):** appending the capture does NOT change energy debit (the existing `debitEnergy` is unchanged) or any cap — a capture is not a productive spend; it rides the already-debited successful call.
- [ ] **security-reviewer (INVARIANT):** rule #4 (scrub at both boundaries, truncation can't leak a partial secret the scrub misses), rule #7 (replay no-provider), rule #1/#8 (no cap/energy change) — run at Step 8.
- [ ] No frozen rule-#6 surface moved (assert `ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis` byte-identical — the guard that rides the amendment, apps/api LESSON 100). All apps/api + contracts tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
`apps/api/src/runtime/loop/generationLoop.ts` — after the successful `gateway.generate(...)` call (`:414–420`), the loop appends the `llm_call_telemetry` event (truncated-then-scrubbed-via-the-append-path). Confirm a real generation run produces a persisted `llm_call_telemetry` event carrying the (scrubbed, ceiling-bounded) raw output, correlated to the agenome — reachable through the production loop, not just unit-mounted. The web node-inspector that surfaces it is **FV.5** (this is the backend capture).

## Files expected to touch
**New:**
- `packages/contracts/src/domain/llm-call-telemetry.ts` — the `LlmCallTelemetry` frozen model.
- `packages/contracts/test/__schema-snapshots__/fb6-llm-telemetry.test.ts` — field-set snapshot + the event-type/version pins (mirror `fb0-run-controls.test.ts`).
- `apps/api/src/event-store/truncate-capture.ts` — the pure `truncateCaptureField(value, maxBytes)` (or `truncateForCapture`) helper + marker.
- `apps/api/test/unit/event-store/truncate-capture.test.ts`
- `apps/api/test/unit/runtime/loop/llm-call-telemetry-capture.test.ts`

**Modified:**
- `packages/contracts/src/events/event-type.ts` — add `'llm_call_telemetry'`.
- `packages/contracts/src/events/payload-map.ts` — `HIGH_TRAFFIC_PAYLOAD_MAP` entry.
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` 6→7.
- `packages/contracts/src/index.ts` — export `LlmCallTelemetry`.
- `packages/contracts/test/__schema-snapshots__/field-sets.test.ts` — `toBe(7)` + `EVENT_TYPE_SNAPSHOT` + the new field-set.
- `apps/api/src/runtime/loop/generationLoop.ts` — append the capture after the successful gateway call.

If implementation needs files beyond this list (e.g. a tiny adapter extension to surface a separate `rawReasoning` channel), **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**Contract (`packages/contracts`):**
1. **`test_llm_call_telemetry_event_type_member`** — Asserts: `RunEventType` parses `'llm_call_telemetry'`; rejects an unknown member. Why: §4 closed-enum amendment.
2. **`test_llm_call_telemetry_payload_schema`** — Asserts: `LlmCallTelemetry` parses a valid payload; the `HIGH_TRAFFIC_PAYLOAD_MAP` narrows the type; `rawReasoning` optional. Why: §4 per-type payload map.
3. **`test_current_schema_version_is_7_additive`** — Asserts: `CURRENT_SCHEMA_VERSION === 7`; a `schemaVersion ≤ 6` envelope still validates (reader-acceptance `≤ current`). Why: §4 additive amendment, backward-compat (LESSON 100, the 4-spot pin).
4. **`test_llm_call_telemetry_field_set_snapshot`** — Asserts: the model's field-name set == the checked-in snapshot, tagged `spec(§4)`. Why: cross-track regression gate.
5. **`test_immutable_rule6_surface_unchanged`** — Asserts: `ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis` byte-identical across the amendment. Why: the rule-#6 guard rides the bump (LESSON 100).

**Runtime (`apps/api`):**
6. **`test_generation_loop_appends_llm_call_telemetry`** — Asserts: a successful generation call appends one `llm_call_telemetry` with `role`/`rawResponse`/`providerMeta`, correlated by `generationId`/`agenomeId`; a FAILED call appends none. Why: §5 reachability (the Step-7.5 proof) + rule #8 no capture-on-failure.
7. **`test_captured_secret_is_scrubbed_before_append`** — Asserts: a raw response containing `sk-…`/`Bearer …` → the APPENDED event payload has it redacted (the existing append-path scrub runs on the capture). Why: rule #4 (secret-surface), the load-bearing pin.
8. **`test_oversized_capture_truncated_with_marker`** — Asserts: a raw response over the budget → truncated-with-marker, payload `< MAX_PAYLOAD_BYTES`, the append SUCCEEDS (not rejected), the marker/flag is set + queryable. Why: the 1 MiB ceiling + truncate-with-marker.
9. **`test_truncate_capture_helper_pure_and_byte_safe`** — Asserts: `truncateCaptureField` is pure (same input → same output), trims on a safe byte boundary (no broken multibyte), sets the marker only when it truncated. Why: deterministic helper.
10. **`test_replay_reads_capture_no_provider`** — Asserts: replay reconstructs the `llm_call_telemetry` from the log with no provider/embedding/web call. Why: rule #7.
11. **`test_capture_does_not_change_energy_or_caps`** — Asserts: appending the capture leaves energy debit + caps unchanged (the capture is not a productive spend). Why: rule #1/#8.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** YES — a new Appendix-A event payload `LlmCallTelemetry` + a new `RunEventType` member + `CURRENT_SCHEMA_VERSION` 6→7. The RED outline INCLUDES the schema-snapshot (test 4) + the version pin (test 3) — authored this cycle.
- **Orchestrator doc rows to write hot (Step 9 routing):** the `ARCHITECTURE.md` Appendix-A `LlmCallTelemetry` row + the `CURRENT_SCHEMA_VERSION` 6→7 prose (§4) + a `§5/§6` note (the generation-loop raw-capture emit point + the rule-#4 scrub-reuse + truncate-with-marker + replay-reads); the `apps/api/CLAUDE.md` cross-doc row + a LESSONS convention candidate (secret-surface capture = reuse the scrub seams + truncate-with-marker under the ceiling + replay-reads). **Orchestrator writes hot.** **This is an announce-before-merge contract amendment** (sv6→7) — the orchestrator carries it to the FB→cody merge.
- **Shared-contract seam model touched?** YES — `LlmCallTelemetry` + `RunEventType` + `CURRENT_SCHEMA_VERSION` are frozen `packages/contracts` surface crossed by cross-track dependency edges → the schema-snapshot test (test 4) + the version pin (test 3) are mandatory in this cycle (the implementer authors them). Additionally a **Finding** for the lead (shared-contract amendment → announce-before-merge).

## Things to flag at Step 2.5
1. **Capture scope — which LLM calls?** My default vote: the **generation-loop calls** (`population_generator` + `fusion_synthesis`) — the demo headline "see the agenome's reasoning." The held-out **judge's** per-axis rationale is **FB.8** (separate, rule-#6-careful); critic capture is a later option. Capturing at the generation loop (not the gateway boundary) keeps the blast radius small + avoids a gateway refactor. Flag if the user wants all roles now.
2. **`rawResponse` vs a separate `rawReasoning`.** My default vote: capture `rawResponse` = the gateway `output` (which contains any inline reasoning) ALWAYS; keep `rawReasoning` an OPTIONAL field, populated only if/when an adapter surfaces a distinct reasoning channel (absent for OpenRouter today) — so FB.6 needs NO gateway/adapter refactor. Flag if a separate reasoning channel is wanted now (would extend the adapter).
3. **Truncate budget + marker shape.** My default vote: a combined capture budget comfortably under the ceiling (e.g. cap `rawResponse`+`rawReasoning` to ~768 KiB total, leaving headroom for the rest of the envelope), truncate-with-marker per field; the marker = a queryable `truncated` flag (+ original byte count) in the payload, not just an inline "…[truncated]". Truncate runs BEFORE the append-path scrub (a truncated secret prefix like `sk-…` still matches the scrub's value-pattern → no leak; security-reviewer confirms). Flag if the reviewer wants scrub-before-truncate.
4. **Commit count / split.** My default vote: ONE safety slice (security-reviewer sees the whole secret-surface path) — but the impl MAY land it as **2 commits**: (a) the contract amendment (sv7 + event type + model + snapshot + 4-spot pin), (b) the runtime capture (truncate helper + the append site + replay test). NEVER bundle with non-FB.6 work. The contract amendment is the shared-contract-seam Finding.

## Dependencies + sequencing
- **Depends on:** FB.0 (the contract-amendment process precedent), the shipped scrub seams (event-store/observability redaction, P2/P6) + the append path + replay reader. Independent of FB.3/FB.4 (the dial) — different feature.
- **Blocks:** FV.5 (the node-inspector surfaces FB.6's raw-reasoning telemetry) + FB.7 (tool-call detail) / FB.8 (judge per-axis rationale) reuse the capture pattern.

## Estimated commit count
**1–2.** A secret-surface **safety slice** (security-reviewer INVARIANT) — gets its OWN slice, NEVER bundled. May land as 2 commits (contract amendment, then runtime capture); the contract amendment is an announce-before-merge shared-contract-seam change. The Appendix-A row + §4/§5/§6 prose + the LESSON ride the `/orchestrate-end` round commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "secret-surface raw-capture = a new high-traffic event whose raw fields are TRUNCATED-WITH-MARKER under the 1 MiB ceiling (a pure helper, never reject), then ride the EXISTING append + Langfuse scrub seams (rule #4, reuse not reimplement); replay reads the persisted capture with no provider (rule #7); the capture is not a spend (no energy/cap change, rule #1/#8); captures GENERATION output only (judge rationale is its own rule-#6-careful slice)."
- **Architecture-doc note candidate** — §4 (the `llm_call_telemetry` event + sv7) + §5/§6 (the generation-loop capture emit point + scrub-reuse + truncate-with-marker + replay-reads).
- **Future TODO — operational** — extend capture to critic/judge roles (FB.7/FB.8); an adapter `rawReasoning` channel when a reasoning-model provider is wired; surface the capture in the FV.5 node-inspector.
