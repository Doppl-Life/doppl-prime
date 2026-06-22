# /tdd brief — generation_loop_edges

## Feature
The generation-loop **edge handling** (extends `apps/api/src/runtime/loop/generationLoop.ts`) — the non-happy-path branches the P3.10b skeleton deferred: **partial failure** (running→degraded→verifying when ≥1 candidate survives, running→failed when all fail), **zero-survivors** (scoring→completed with no offspring), and **degenerate reproduction** (<2 eligible parents → mutation_only), plus the **`agenome.failed`** emission (active→failed, the sv5 event kernel-026 added). These complete P3.10 bullets 2/3/4 on top of the 10b skeleton (bullets 1/5/6/10). FEATURE — no NEW safety invariant established (uses the P3.2 guards + the 10b cap-bound). Energy.spent + `provider_call_failed` (10d), kill/abort+drain (10e), and successor-population threading (deferred) remain separate slices.

## Use case + traceability
- **Task ID:** P3.10 sub-slice (c) — the lifecycle edges. P3.10 bullets 2 (partial failure), 3 (zero-survivors), 4 (degenerate reproduction).
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (runtime kernel — "energy exhaustion mid-generation … score the candidates already verified"; the partial/degraded paths) + `§3` (generation `running→degraded→verifying` partial-failure edge + the agenome `active→failed` terminal) + `§4` (the `agenome.failed` recording event, sv5). Key safety rule #2 (agenome.failed makes the failed-agenome terminal replayable — the kernel-026 audit's reason for the event), #1 (the edges stay within the cap-bound).
- **Why:** 10b ships the happy path (all gateway calls accepted, ≥1 survivor). Real runs have failed agenomes (gateway REJECT after the gateway's internal retry+repair), generations with 0 eligible parents, and single-survivor generations. The loop must drive these through the §3-legal edges + emit the recording events so the lineage/replay is faithful. `agenome.failed` (kernel-026 sv5) is now in the registry — this slice is its FIRST emitter (the kernel-026 brief named "agenome.failed emission = loop P3.10").
- **Pattern:** extends the 10b loop with branch logic gated by the P3.2 guards (`canTransitionGeneration` already allows `running→degraded`, `degraded→verifying`, `running→failed`; `canTransitionAgenome` allows `active→failed`). The edges are guard-validated transitions + their recording events — no new state, no contract change.

## Acceptance criteria (what "done" means)
- [ ] **Partial failure:** when some agenomes fail to produce a valid candidate (gateway response `validationResult==='rejected'` → the candidate never reaches `created`; the agenome goes `active→failed` + appends **`agenome.failed`**), the generation proceeds `running→degraded→verifying` **as long as ≥1 candidate reached `created`** (a configurable `minPopulationSurvival`, default 1); appends a **partial-failure event listing the failed agenome IDs** (the existing `generation.degraded`-adjacent recording — confirm the exact event at Step 2.5: the `degraded` transition is recorded; the failed-agenome IDs ride the degraded/partial payload). [The `provider_call_failed` per-attempt event + energy accounting = 10d — NOT this slice.]
- [ ] **All-fail → failed:** if ALL agenomes fail (0 reached `created`), the generation goes `running→failed` (appends `generation_failed`). [The "provider failures exceed the run retry cap" branch folds in with 10d's provider-failure accounting — name it as the 10d boundary at Step 2.5; this slice keys off "0 candidates created".]
- [ ] **Zero-survivors:** a generation that reaches `scoring` with **no eligible parents** (the score seam produced 0 survivors / all culled) takes `scoring→completed` (NO reproduction) and appends `generation.completed` with a `survivors:0` marker in its payload. The loop reads the seam's score/cull events (readByRun) to determine eligibility — it does not score itself.
- [ ] **Degenerate reproduction (<2 eligible parents):** exactly 1 eligible parent → the reproduce seam is invoked in **mutation_only** mode; the resulting `agenome.reproduced` carries `mode:'mutation_only'` (the seam appends it; the loop passes the single-survivor context + the LIVE outcome source). 0 eligible parents routes to the zero-survivors path (no reproduce call).
- [ ] **`agenome.failed` emission:** each failed agenome appends `agenome.failed` (active→failed, guard-validated) via the append path — the sv5 event's first emitter. Replay-faithful; generic payload (not HIGH_TRAFFIC).
- [ ] All edge transitions are **guard-validated** (`canTransitionGeneration`/`canTransitionAgenome`) before append — an illegal edge is a kernel error, never forced (rule #2).
- [ ] `minPopulationSurvival` sourced from config (AppConfig/RunCaps-adjacent) or a named default — confirm the source at Step 2.5 (likely a loop-config field, not a frozen contract).
- [ ] Full suite green; `/preflight` clean (incl `format:check`, LESSON 40). The 10b happy-path tests stay green (the edges are additive branches).
- [ ] **Out of scope (named, not dropped):** `energy.spent` + `provider_call_failed` + scrub round-trip (10d) · kill/cap-breach/wall-clock abort + drain-then-terminalize + latching halt (10e) · **successor-population threading** (the loop consuming the reproduce seam's offspring into the NEXT generation's population — DEFERRED to a dedicated later slice / real-selection wiring; gen-0-only persists, per 10b D3) · run-terminal classification (P3.11) · the "provider failures exceed the run retry cap" branch (pairs with 10d's provider-failure accounting).

## Wiring / entry point (Step 7.5)
Extends `runGenerationLoop` (the 10b entry, reachable via the runtime barrel). The edges are internal branches of the same loop; no new exported entry. Named caller remains P3.12 worker (deferred). The `agenome.failed` emitter is now reachable (first emitter of the sv5 event).

## Files expected to touch
**Modified (runtime):**
- `apps/api/src/runtime/loop/generationLoop.ts` — the partial-failure / zero-survivors / degenerate-reproduction branches + `agenome.failed` emission + `minPopulationSurvival` gate. (If the branch logic is sizable, extract `apps/api/src/runtime/loop/partialFailure.ts` + `apps/api/src/runtime/loop/reproductionDispatch.ts` per the tracker P3.10 file plan — confirm at Step 2.5.)
**Tests:**
- `apps/api/test/unit/runtime/loop/generationLoop.test.ts` (extend) — the edge cases below, with faked seams/gateway driving the failure/zero-survivor/degenerate scenarios.

## RED test outline (Step 2)
1. **`partial_failure_drives_degraded_path`** — N agenomes, some gateway-rejected (≥1 survives) → generation `running→degraded→verifying`; failed agenomes emit `agenome.failed`; the degraded/partial event lists the failed agenome IDs. Why: §3/§5 partial-failure edge.
2. **`all_agenomes_fail_drives_generation_failed`** — every gateway call rejected (0 created) → `running→failed` + `generation_failed`. Why: §5 all-fail.
3. **`zero_survivors_completes_without_reproduction`** — score seam yields 0 eligible parents → `scoring→completed` + `survivors:0`; the reproduce seam is NOT called. Why: §5/§8 zero-survivors.
4. **`single_survivor_reproduces_mutation_only`** — exactly 1 eligible parent → reproduce seam invoked mutation_only; `agenome.reproduced{mode:'mutation_only'}` present. Why: §8 degenerate reproduction.
5. **`agenome_failed_emitted_and_guard_valid`** — a failed agenome appends `agenome.failed` via the append path, the `active→failed` transition is guard-validated, and an illegal agenome transition is rejected. Why: §3/§4 + rule #2 (kernel-026 sv5 event's first emitter).
6. **`minPopulationSurvival_threshold`** — with `minPopulationSurvival=2`, exactly 1 survivor → `running→failed` (below threshold); 2 survivors → degraded→verifying. Why: configurable partial-survival gate.
7. **`happy_path_unaffected`** — the 10b happy path (all accepted, ≥1 survivor, ≥2 parents) still drives the full lifecycle with no degraded/failed branch. Why: regression guard (edges are additive).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **NONE (Appendix-A).** Consumes frozen contracts (`Generation`/`GenerationStatus` incl. `degraded`, `Agenome`/`AgenomeStatus` incl. `failed`, `ReproductionEvent` `mode:'mutation_only'`, `RunEventType` incl. `agenome.failed`/`generation_failed`) — no field change. `minPopulationSurvival` is a runtime-local loop-config value (not Appendix-A).
- **Architecture-doc note (maybe → cody, via lead):** a §5 line confirming the partial-failure `degraded` path semantics + `minPopulationSurvival` + the zero-survivor/degenerate-reproduction routing, if it reads as a spec addition. Flag at Step 9.

## Things to flag at Step 2.5
1. **The partial-failure recording event.** What exactly records the failed-agenome IDs — the `generation.degraded` transition payload, or a distinct event? (My read: the `degraded` transition is the recording; the failed IDs ride its payload + each failed agenome's own `agenome.failed`. Confirm there's no missing registry event — if a distinct "partial-failure" event is needed and absent, that's a Finding → me.)
2. **`minPopulationSurvival` source + default.** My vote: a loop-config field (default 1), NOT a frozen-contract addition. Confirm.
3. **File extraction.** `partialFailure.ts` / `reproductionDispatch.ts` per the tracker file plan, or keep in `generationLoop.ts` if the branches are compact. Your call.
4. **The 10c↔10d boundary.** This slice keys agenome failure off the gateway `rejected` response (→ agenome.failed + degraded/failed path); the per-attempt `provider_call_failed` event + the "provider failures exceed the run retry cap" branch + energy accounting are 10d. Confirm the split (no `provider_call_failed`/energy in this slice).
5. **Successor-threading stays deferred** (gen-0-only persists). Confirm it's NOT pulled in here.

## Dependencies + sequencing
- **Depends on:** P3.10b loop skeleton (kernel-028, the loop to extend) · P3.2 guards (degraded/failed edges) · P3.6 RNG (mutation_only outcome) · kernel-026 sv5 (`agenome.failed`/`generation.skipped` in the registry) — all done. **No `git merge cody`** (no scrub/ProviderMeta surface — that's 10d).
- **Blocks:** 10d (energy/provider-failure accounting layers onto the same branches) · 10e (kill/abort) · P3.11 (terminal classification reads the survivor/failed history).
- **Sequencing:** the 3rd P3.10 sub-slice, after 10b. FEATURE (no new safety invariant — uses the guards + 10b cap-bound). security-reviewer policy = **phase-boundary** unless the impl judges the agenome.failed/degraded paths rule-#2-load-bearing enough for a per-slice invariant pass (your call — the kernel-026 audit makes agenome.failed a rule-#2 completeness event, so an invariant pass is defensible).

## Estimated commit count
**1** (or 1 + an optional file-extraction). `feat(runtime)`. Edges are cohesive (the loop's non-happy-path branches). If `partialFailure.ts`/`reproductionDispatch.ts` are extracted, they ride the same commit (one logical edge-handling change). The heavy safety invariants (energy success-only/scrub → 10d; kill drain/latching → 10e) stay isolated in their own slices.

## Lessons-logged candidates anticipated
- Possibly: "the loop's partial-failure path is guard-routed (running→degraded→verifying), gated by minPopulationSurvival, and agenome.failed is the rule-#2 recording for a failed agenome (kernel-026 sv5's first emitter)" — route at Step 9 if distinct. Likely covered by the existing guard/registry lessons.

## How to invoke
1. Read this brief + the 10b `generationLoop.ts` (the loop to extend) + `ARCHITECTURE.md §5` (failure handling) + the generation/agenome guards.
2. Run `/tdd generation_loop_edges` (spec-lint stamp in the dispatch — Step 0 can skip re-lint).
3. Step 2.5 — send the per-test write-up + coverage map; load-bearing confirms: #1 (partial-failure recording event — flag if a registry event is missing) + #4 (10c↔10d boundary) + #2 (minPopulationSurvival source).
4. Step 9 — flag the maybe §5 architecture note; confirm NO Appendix-A row; name the still-deferred successor-threading + 10d/10e boundaries.
