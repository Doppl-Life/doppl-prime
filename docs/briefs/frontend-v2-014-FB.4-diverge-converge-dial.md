# /tdd brief — diverge_converge_dial_framing_temperature

## Feature
Make `RunConfig.generationBias` (FB.0's diverge(+)/converge(−) dial ∈ [−1,+1], 0 neutral) **load-bearing** as a **framing-primary hybrid (Option A+, user-ratified)**: the dial maps to (1) a **system-authored band fragment** composed into the TRUSTED generation framing (mirroring FB.3 operators) AND (2) a **bounded, clamped temperature nudge** (`0.7 ± 0.3`, clamped `[0.4, 1.2]`) applied to the **generation call's sampling**. Direction is **consistent**: diverge → higher temp + breadth/novelty framing; converge → lower temp + depth/refine framing. The dial biases **GENERATION ONLY** — the held-out judge, its rubric, the scoring policy, and selection are untouched (rule #6). The **EXACT executed sampling params are recorded** into the event log (extending FB.6's `llm_call_telemetry` with `samplingParams`) so the run is auditable and **replay reads the recorded outcome, never re-samples** (rule #7). Additive contract amendment `CURRENT_SCHEMA_VERSION` 7→8 (announce-before-merge).

> **SOLO safety-invariant slice — security-reviewer INVARIANT, NEVER bundled.** The load-bearing pin is NOT just "the rubric contract is byte-identical" (it's a constant — trivially so). It is: **the dial's framing + temperature reach the `population_generator` request ONLY — the `final_judge` and `critic` gateway calls carry NO bias-derived temperature or framing.** The dial must be STRUCTURALLY unable to reach the evaluation path. That is the rule-#6 SOLO proof.

## Use case + traceability
- **Task ID:** FB.4
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (contracts & event model — the additive `samplingParams` fields + `CURRENT_SCHEMA_VERSION` 7→8), `ARCHITECTURE.md §5` (runtime kernel — the generation-loop bias framing + temperature, applied to generation only; replay reads recorded outcomes), `ARCHITECTURE.md §6` (model gateway — the `temperature` sampling param threaded to the provider call).
- **Related context:**
  - **Research (FB.4 pass, 2026-06-24, ~9 sources):** temperature is a WEAK idea-diversity lever (β≈0.31 novelty, negative coherence, garbles ≥1.5–2.0, muted under structured prompts) so framing is primary; the user ratified A+ (framing + a bounded temp NUDGE) over A-alone, on the LOAD-BEARING condition that the executed sampling params are recorded. Clamp the diverge end ≤1.2 (beyond that = coherence collapse, no diversity payoff).
  - **The FB.3 framing precedent to mirror:** `src/runtime/loop/generationOperators.ts:22–52` (`OPERATOR_FRAGMENTS` + the pure `composeOperatorFraming`); `generationLoop.ts:55–74` `buildPopulationRequest` composes the framing into the system message (`:65`) + the problem stays `wrapUntrusted` (`:67`); `composeRuntime.ts:99–104` `mergePerRunConfig` threads `generationOperators`. FB.4 mirrors all three for `generationBias`.
  - **generationBias threading gap:** `RunConfig.generationBias` exists (`packages/contracts/src/run/run-config.ts:29`) but is **NOT threaded** in `mergePerRunConfig` — FB.4 threads it (like FB.3 did for operators).
  - **Gateway request (NO sampling field today):** `ModelGatewayRequest` (`packages/contracts/src/gateway/gateway-request.ts:24–29`) carries `{role, prompt?, messages?, schema?, maxTokens?}` — no `temperature`. FB.4 adds an optional `samplingParams{temperature?}`. The OpenRouter adapter `buildParams` (`src/model-gateway/adapters/openrouter.adapter.ts:91–118`) + the SDK call (`:253–261`) thread `maxTokens` today; FB.4 threads `temperature` the same way (the OpenAI-compatible SDK accepts `temperature`).
  - **The event to extend (FB.6, sv7):** `LlmCallTelemetry` (`packages/contracts/src/domain/llm-call-telemetry.ts:21–36`) — FB.4 adds `samplingParams{temperature?}` to record the EXECUTED temperature; the loop sets it when it appends the capture. sv7→8.
  - **The rule-#6 immutable surface (the anchor):** `ScoringPolicy` (`packages/contracts/src/scoring/scoring-policy.ts`), `FinalJudgeRubric` (`packages/contracts/src/verifier/final-judge-rubric.ts` — `immutableToAgents: z.literal(true)`), `FinalJudgeAxis` (the closed 5). The byte-identical guard pattern: `packages/contracts/test/__schema-snapshots__/fb0-run-controls.test.ts:172–184` (FB.0/FB.6 reuse it).
  - **Replay (rule #7):** `src/event-store/replay-reader.ts` imports no provider/embedding/web seam (structural). FB.4's executed temperature is RECORDED → replay reads it, never re-derives via `biasToTemperature` or re-samples.
  - Safety: **rule #6** (the held-out judge/rubric/scoring/selection are immutable to agents — the dial reaches generation only, the judge/critic calls get no bias temperature/framing), rule #7 (replay reads recorded sampling params, no provider), rule #1/#8 (the dial touches prompt + sampling only — no cap/energy change), rule #5 (the band fragments are system-authored vetted closed-set framing, the untrusted problem stays `wrapUntrusted` — like FB.3).

## Acceptance criteria (what "done" means)
- [ ] **NEW `generationBias.ts`:** a `BIAS_FRAGMENTS` band map (~5 bands; system-authored, non-empty except neutral; rule-#6-clean — no judge/rubric/scoring/fitness words) + a pure `composeBiasFraming(bias)` (neutral → `''`, byte-identical to the no-bias baseline) + a pure `biasToTemperature(bias)` = `clamp(0.7 + 0.3*bias, 0.4, 1.2)`. All pure/deterministic (rule #7).
- [ ] **Generation request gets framing + temperature:** `buildPopulationRequest` composes the selected band fragment into the TRUSTED system message (alongside the operator framing + `GENERATION_ISOLATION_FRAMING`) AND sets `samplingParams.temperature = biasToTemperature(bias)` on the `population_generator` request. Direction is consistent (diverge → higher temp + breadth fragment).
- [ ] **RULE-#6 SOLO INVARIANT (the load-bearing pin):** the bias-derived temperature + framing reach the `population_generator` request ONLY — the `final_judge` AND `critic` gateway requests carry **no** bias-derived temperature/framing (asserted directly). AND `ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis` are **byte-identical** for dial=diverge vs dial=converge (+ `immutableToAgents` literal-true intact). Two-sided: the dial DOES change the generation request; it does NOT touch the judge/scoring path.
- [ ] **`mergePerRunConfig` threads `generationBias`** (was dropped) — recorded == executed.
- [ ] **Contract amendment (sv7→8, additive):** `ModelGatewayRequest` +`samplingParams{temperature?}`; `LlmCallTelemetry` +`samplingParams{temperature?}` (records the EXECUTED temperature); `CURRENT_SCHEMA_VERSION` 7→8 (every sv≤7 envelope still validates); the version pins updated (**grep is the authority** per LESSON 100's FB.6 refinement — version.ts + field-sets.test.ts + fixtures-valid + the `LlmCallTelemetry` field-set snapshot + fixture; no new event type so the EVENT_TYPE-count pins do NOT move); a new `fb4-sampling-params.test.ts` snapshot.
- [ ] **Replay (rule #7):** replay reads the recorded `samplingParams.temperature` from `llm_call_telemetry`; it NEVER re-derives via `biasToTemperature` or re-samples; no provider call.
- [ ] **Caps/energy untouched (rule #1/#8):** the dial touches the prompt + the sampling param only.
- [ ] **Live-eval acceptance (model-dependent effect — research caveat):** the brief flags that the ACTUAL diverge/converge BEHAVIOR is validated post-slice with a live-LLM `/eval` on the novelty axis (banding + the temperature formula are deterministically unit-tested here; whether a band/temp actually shifts generation is an eval question, NOT a unit assertion).
- [ ] **security-reviewer (INVARIANT):** the rule-#6 SOLO pin (judge/critic get no bias temperature/framing; anchor byte-identical), rule #7 (replay reads recorded params), rule #1/#8. No frozen rule-#6 surface moved. All apps/api + contracts tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
`apps/api/src/runtime/loop/generationLoop.ts` `buildPopulationRequest` — the `population_generator` request gains the bias band fragment (system message) + `samplingParams.temperature`; the loop records the executed temperature into the `llm_call_telemetry` append. `composeRuntime.ts mergePerRunConfig` threads `generationBias`. Confirm a run configured with a bias produces a `population_generator` request carrying the band fragment + temperature, that the `final_judge`/`critic` requests do NOT, and that replay reconstructs the temperature from the persisted capture. The launcher dial UI is **FV.3**.

## Files expected to touch
**New:**
- `apps/api/src/runtime/loop/generationBias.ts` — `BIAS_FRAGMENTS` + pure `composeBiasFraming` + pure `biasToTemperature`.
- `apps/api/test/unit/runtime/loop/generationBias.test.ts`
- `packages/contracts/test/__schema-snapshots__/fb4-sampling-params.test.ts` — the sv7→8 amendment + the rule-#6 byte-identical guard.

**Modified:**
- `packages/contracts/src/gateway/gateway-request.ts` — `+samplingParams{temperature?}`.
- `packages/contracts/src/domain/llm-call-telemetry.ts` — `+samplingParams{temperature?}`.
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` 7→8.
- `packages/contracts/src/__schema-snapshots__/field-sets.ts` + `test/__schema-snapshots__/field-sets.test.ts` — the `LlmCallTelemetry` field-set + `toBe(8)`.
- `packages/contracts/src/test-fixtures/index.ts` + `test/test-fixtures/fixtures-valid.test.ts` — the fixture + sv8.
- `apps/api/src/runtime/loop/generationLoop.ts` — `buildPopulationRequest` bias framing + temperature; record the temperature in the `llm_call_telemetry` append.
- `apps/api/src/boot/composeRuntime.ts` — `mergePerRunConfig` threads `generationBias`.
- `apps/api/src/model-gateway/adapters/openrouter.adapter.ts` — `buildParams` + SDK call thread `temperature`.
- `apps/api/test/unit/runtime/loop/generationLoop.test.ts` + `boot/composeRuntime.test.ts` — extend.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
**`generationBias.test.ts`:**
1. **`test_bias_fragments_exhaustive`** — non-empty band fragments (except neutral); the band set covers [−1,+1]. Why: §5 completeness.
2. **`test_bias_fragments_no_judge_or_scoring_reference`** — no fragment contains judge/rubric/scoring/score/fitness/weight. Why: rule #6 hygiene.
3. **`test_compose_bias_framing_band_selection`** — representative bias values → the correct band fragment; boundaries. Why: §5.
4. **`test_neutral_bias_empty_framing`** — `|bias| < threshold` → `''` (byte-identical to the no-bias baseline). Why: backward-compat.
5. **`test_bias_to_temperature_formula`** — bias −1→0.4, 0→0.7, +1→1.0; pure/deterministic. Why: §6 + rule #7.
6. **`test_bias_to_temperature_clamped`** — clamped to `[0.4,1.2]`; out-of-range bias clamped (never exceeds). Why: the research's coherence ceiling.
7. **`test_direction_consistency`** — diverge → higher temp AND breadth framing; converge → lower temp AND depth framing (signs agree). Why: the lead's consistency condition.

**`generationLoop.test.ts` / `composeRuntime.test.ts` (extend):**
8. **`test_bias_framing_and_temperature_on_generation_request`** — the `population_generator` request carries the band fragment (system msg) + `samplingParams.temperature`; the problem stays `wrapUntrusted`. Why: §5/§6 wiring (Step-7.5).
9. **`test_judge_and_critic_requests_have_no_bias_temperature`** — the `final_judge` + `critic` gateway requests carry NO bias-derived temperature/framing. Why: **rule #6 SOLO — the dial reaches generation only.** ★ load-bearing.
10. **`test_telemetry_records_executed_temperature`** — the appended `llm_call_telemetry` carries `samplingParams.temperature` = the executed value. Why: the lead's recording condition.
11. **`test_replay_reads_recorded_temperature_no_provider`** — replay reconstructs the temperature from the persisted capture; no `biasToTemperature` re-derive, no provider. Why: rule #7.
12. **`test_bias_does_not_touch_caps_or_energy`** — the assembly reads/changes no caps/energy. Why: rule #1/#8.
13. **`test_merge_per_run_threads_generation_bias`** — `mergePerRunConfig` carries `generationBias` (no longer dropped). Why: recorded == executed.

**`fb4-sampling-params.test.ts` (contracts):**
14. **`test_samplingparams_additive_sv8`** — `ModelGatewayRequest` + `LlmCallTelemetry` parse WITH `samplingParams` and WITHOUT (additive/optional); an sv≤7 envelope still validates. Why: §4 additive.
15. **`test_current_schema_version_is_8`** — `CURRENT_SCHEMA_VERSION === 8`; the pins updated. Why: §4 (LESSON 100 grep-the-pins).
16. **`test_rule6_surface_byte_identical`** — `ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis` byte-identical across the amendment + `immutableToAgents` literal-true. Why: the rule-#6 anchor guard.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** YES — `ModelGatewayRequest` + `LlmCallTelemetry` gain `samplingParams`; `CURRENT_SCHEMA_VERSION` 7→8. The RED outline INCLUDES the snapshot (14) + version pin (15) + the rule-#6 guard (16).
- **Orchestrator doc rows to write hot (Step 9 routing):** ARCH §4 (sv7→8 + the `samplingParams` fields) + §5 (the dial framing + temperature on generation only; replay reads recorded) + §6 (the gateway temperature param) + the Appendix-A `LlmCallTelemetry`/`ModelGatewayRequest` row updates; apps/api/CLAUDE.md ver→8 + cross-doc rows; a LESSONS convention (the diverge/converge dial = framing band + clamped temp on GENERATION only, recorded-for-replay, judge gets none — rule #6 SOLO). **Announce-before-merge** (sv7→8) — orchestrator carries it.
- **Shared-contract seam model touched?** YES — `ModelGatewayRequest` + `LlmCallTelemetry` + `CURRENT_SCHEMA_VERSION` are frozen `packages/contracts` surface → the snapshot (14) + version pin (15) mandatory this cycle; a **Finding** for the lead (shared-contract amendment → announce-before-merge).

## Things to flag at Step 2.5
1. **Band count + boundaries + fragment content.** My default vote: 5 bands — strong-converge (`<−0.6`) · converge (`[−0.6,−0.2)`) · neutral (`[−0.2,+0.2)` → `''`) · diverge (`[+0.2,+0.6)`) · strong-diverge (`≥+0.6`); vetted system-authored lens lines (diverge = "explore widely, maximize novelty/breadth, depart from the obvious"; converge = "refine and consolidate, deepen the strongest direction, prioritize feasibility"), rule-#6-clean. Tunable constants. Flag if the user wants different bands.
2. **Temperature formula + WHERE applied (the SAFETY pin).** My default vote: `clamp(0.7 + 0.3*bias, 0.4, 1.2)`, applied to the `population_generator` request ONLY (in `buildPopulationRequest`) — NEVER the judge/critic calls (those keep their default/unset sampling). This is the rule-#6 SOLO pin; test 9 asserts it. Flag if a different base/range is wanted (keep the ≤1.2 ceiling — research-backed).
3. **Recording site — extend `llm_call_telemetry`.** My default vote: add `samplingParams{temperature?}` to FB.6's `LlmCallTelemetry` (the natural home — it IS the LLM-call telemetry); the loop records the executed temperature when it appends the capture (sv7→8). Flag if a separate event is preferred (it isn't — this reuses FB.6 cleanly).
4. **`ModelGatewayRequest.samplingParams` shape.** My default vote: `samplingParams: z.strictObject({ temperature: z.number().min(0).max(2).optional() }).optional()` — a nested object, forward-compat for `top_p` etc. (tune temperature OR top_p, not both — research). Flag.
5. **Commit count.** My default vote: SOLO safety slice — 1 commit (security-reviewed as a unit), OR 2 (the contract amendment, then the runtime+adapter). NEVER bundled with non-FB.4 work. The contract amendment is the announce-before-merge Finding.

## Dependencies + sequencing
- **Depends on:** FB.0 (`generationBias` shape), FB.3 (the framing precedent — same module pattern), **FB.6 (`038c660` — `llm_call_telemetry`, which FB.4 extends with `samplingParams`)**. Sequenced AFTER FB.6 (the api impl is serial; FB.4 extends FB.6's event). The two stacked contract amendments: FB.6 sv6→7, FB.4 sv7→8.
- **Blocks:** FV.3 (the launcher dial picker needs FB.0–FB.4). The post-slice live-LLM `/eval` (novelty axis) validates the actual effect.

## Estimated commit count
**1–2.** SOLO safety-invariant slice (security-reviewer INVARIANT) — gets its OWN slice, NEVER bundled. May land as 2 commits (the sv7→8 contract amendment; then the runtime bias module + loop + adapter). The contract amendment is the announce-before-merge §-seam Finding. The ARCH §4/§5/§6 prose + Appendix-A rows + the LESSON ride the `/orchestrate-end` round commit.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a generation diverge/converge dial = a framing band (system-authored, rule-#6-clean) + a clamped temperature nudge (research-bounded ≤1.2) applied to the GENERATION request ONLY — the held-out judge + critic calls get NO bias temperature/framing (the rule-#6 SOLO pin: the dial is structurally unable to reach the evaluation path); the EXECUTED sampling params are recorded in `llm_call_telemetry` so replay reads them, never re-samples (rule #7); the actual behavioral effect is an `/eval` question, not a unit assertion (model-dependent)."
- **Architecture-doc note candidate** — §4/§5/§6: the `samplingParams` fields (sv8) + the dial's framing+temperature-on-generation-only mechanism + the recorded-for-replay temperature.
- **Future TODO — operational** — tune the band fragments + the temp range post-demo (via the `/eval`); the FV.3 launcher dial; `top_p` if wanted later.
