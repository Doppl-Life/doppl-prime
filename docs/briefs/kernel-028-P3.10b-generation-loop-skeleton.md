# /tdd brief — generation_loop_skeleton

## Feature
The generation-loop orchestration **SKELETON** (`apps/api/src/runtime/loop/generationLoop.ts`, NEW) — the **bounded happy-path** control flow that drives a run's generations through the §3 generation lifecycle via the P3.2 state-machine guards, appends every KERNEL-owned lifecycle event + operation-start marker + tool_call relay, produces candidates through the ModelGateway (`population_generator` role), and delegates verify/score/reproduce to **INJECTED seam ports** (faked in tests; real impls are the demo/integration track's job) whose events it **consumes as DATA, never authors**. Bounded by `maxGenerations` + `maxPopulation` via the P3.4 cap enforcer. **Happy path only** — partial-failure/zero-survivors/degenerate-reproduction edges → 10c; `energy.spent` emission + scrub round-trip + `provider_call_failed` → 10d; kill/cap-breach/wall-clock abort + drain-then-terminalize + latching halt → 10e.

## Use case + traceability
- **Task ID:** P3.10 sub-slice (b) — the happy-path loop skeleton. Covers P3.10 bullets 1, 5, 6, 10 (happy-path subset); bullets 2/3/4 (edges)→10c, 7/8 (per-stage abort)→10e, energy→10d.
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (runtime kernel — the generation loop, "the sole emitter of authoritative lifecycle events") + `§3` (generation lifecycle state machine + guards) + `§4` (operation-start markers + tool_call relay = NO-energy-debit, replay-faithful observability events) + `§6` (the ModelGateway port — the only provider seam). Key safety rule #1 (caps kernel-enforced — the loop bound), #2 (every lifecycle decision is a persisted, append-path event), #9 (layer dependency — the loop imports contracts + ports only, NEVER verifier/selection code).
- **Why:** the P3 substrate (P3.2 guards · P3.4 caps · P3.6 RNG · P3.9 seed set/clamp · the gateway) is built but has **no production caller** (kernel-006 reachability: "the P3.10 loop + P3.12 worker are the named first consumers"). 10b is that first consumer — the orchestration that composes them. **Lead-confirmed option (b): inject-and-fake the verify/score/reproduce seams** (selection P5 is NOT in cody — track/selection is complete-but-paused, unmerged; verifier retired). The loop is pure orchestration + ports; wiring the REAL subsystem impls behind those ports is the demo/integration track's job, so a fake-only loop leaves no kernel hole.
- **Pattern:** compose the substrate per kernel-006 "How to use what was built" — `materializeGen0(cfg.seedSet, runId, gen0Id, cfg.caps.maxPopulation)` → per-agenome gateway call → guard-checked transitions → append-path emits → injected seams. The loop is the **decide/emit** owner; the substrate stays pure decide/compute.

## Acceptance criteria (what "done" means)
- [ ] `generationLoop.ts` exports `runGenerationLoop(deps)` (async) that drives ONE generation `pending→running→verifying→scoring→reproducing→completed`, validating EACH transition through `canTransitionGeneration(from,to)` before appending — an illegal transition is a kernel error (throw/abort), NEVER a forced append (rule #2 + P3.2).
- [ ] Appends `generation.started` on the running-entry and `generation.completed` on completed-entry, through the P1.3 append path (`eventStore.append`) — the loop NEVER writes the event table directly (rule #2 by import shape: it depends only on the append port).
- [ ] On entering `verifying`/`scoring`/`reproducing`, appends the matching **operation-start marker** (`generation.verifying`/`generation.scoring`/`generation.reproducing`) on phase ENTRY (before the seam work runs, so live observability sees "phase started") — these are **NO-energy-debit + generic-payload + replay-faithful** (§4; they are in the 11 markers, not HIGH_TRAFFIC).
- [ ] **Relays** `tool_call.started`/`tool_call.finished` when the gateway surfaces tool calls — appended verbatim (NO energy debit; §4/§12). [Faked gateway emits a tool call in the test.]
- [ ] Per agenome, bounded to `≤ maxPopulation` (via `materializeGen0` count-clamp + `clampSpawnBudget` for offspring + an `enforceCap('maxPopulation', consumed, requested, caps)` gate before each spawn): calls `gateway.call({role:'population_generator', …})`; on an **accepted** response, appends `agenome.spawned` + `candidate.created` (candidate text as DATA in the payload). [Happy path = all accepted; repair/reject/provider-failure handling → 10c/10d.]
- [ ] Hands the produced candidates to the **injected `verify` seam** as DATA; the seam appends its own `critic.reviewed`/`check.completed`; the loop reads them back via `eventStore.readByRun` and NEVER authors a seam-owned event. Same for the `score` seam (`novelty.scored`/`fitness.scored`) and the `reproduce` seam (`agenome.fused`/`agenome.mutated`/`agenome.reproduced`). [Seams are injected; faked in tests.]
- [ ] **Reproduction (happy path, ≥2 eligible parents):** the loop constructs the **LIVE outcome source** `createLiveOutcomeSource(createSeededRng(readRngSeed(config)))` and passes it to the reproduce seam so RNG outcomes are recorded into the `agenome.fused`/`agenome.mutated` payloads (replay-faithful, rule #7). [<2 parents / mutation_only / 0 survivors → 10c.]
- [ ] **Bounded iteration:** the loop repeats generations until `enforceCap('maxGenerations', …)` denies, then returns control (run-terminal classification = P3.11, OUT OF SCOPE) — BOUNDED by construction; an N-generation cap runs exactly N generations.
- [ ] The loop **never critiques/checks/scores itself** (§5) — only orchestrates, appends kernel-owned events, and consumes seam events as DATA.
- [ ] `runGenerationLoop` exported from the runtime barrel (`runtime/index.ts`). Full suite green; `/preflight` clean (incl `format:check`, LESSON 40).
- [ ] **Out of scope (named, not silently dropped):** energy.spent emission + scrub round-trip + provider_call_failed (10d) · kill/cap-breach/wall-clock abort + drain-then-terminalize + latching halt (10e) · partial-failure/zero-survivors/degenerate-reproduction (10c) · run.started/run.completed + terminal classification (P3.11) · the worker that calls the loop (P3.12).

## Wiring / entry point (Step 7.5)
`runGenerationLoop` is the NEW production entry the **P3.12 worker** will call (deferred). This slice wires the substrate's first real consumer: `materializeGen0` → guard-checked lifecycle → `gateway.call` → `eventStore.append` → injected seam ports → `createLiveOutcomeSource`. Reachable via the runtime barrel; the named caller is P3.12 (worker) — tested-but-not-yet-worker-wired is expected (consistent with the substrate; the consumer is named, not a silent gap).

## Files expected to touch
**NEW (runtime):**
- `apps/api/src/runtime/loop/generationLoop.ts` — `runGenerationLoop(deps)` + the deps shape (eventStore append/readByRun port, gateway port, AppConfig, injected seams, clock/now injected for later wall-clock).
- `apps/api/src/runtime/loop/seams.ts` — the injected seam PORT interfaces (`VerifySeam`/`ScoreSeam`/`ReproduceSeam` function types) — OR co-locate in generationLoop.ts (flag at 2.5).
**Modified:**
- `apps/api/src/runtime/index.ts` — barrel export `runGenerationLoop` (+ seam port types).
**Tests:**
- `apps/api/test/unit/runtime/loop/generationLoop.test.ts` — faked seams + faked gateway + faked/in-memory eventStore (the orchestration logic); the real-PG append path is already integration-covered (P1.3) — flag at 2.5 if an integration smoke is wanted.

## RED test outline (Step 2)
1. **`happy_path_drives_full_generation_lifecycle`** — one generation emits, in order, `generation.started` → `generation.verifying` → `generation.scoring` → `generation.reproducing` → `generation.completed` (assert the kernel-appended type sequence). Why: §3/§5 lifecycle.
2. **`candidates_produced_bounded_by_maxPopulation`** — per agenome ≤ maxPopulation, `agenome.spawned` + `candidate.created` appended; count == `min(seedSet size, maxPopulation)`. Why: rule #1 bound + §5.
3. **`operation_markers_are_generic_no_debit`** — the 3 markers appended on phase entry; none is in `HIGH_TRAFFIC_PAYLOAD_MAP` (generic payload); NO `energy.spent` appended (energy = 10d). Why: §4 observability markers.
4. **`tool_call_relay`** — a faked gateway tool call → `tool_call.started`/`tool_call.finished` appended. Why: §4/§12 relay.
5. **`loop_consumes_seam_events_never_authors_them`** — the loop calls the injected verify/score/reproduce seams; faked seam events (`critic.reviewed`/`fitness.scored`/`agenome.reproduced`) are present in the log, and the loop's OWN appends exclude every seam-owned type. Why: §5 / option-b / rule #9.
6. **`bounded_iteration_runs_exactly_maxGenerations`** — maxGenerations=N → exactly N generations then return. Why: rule #1 (caps as the loop bound).
7. **`illegal_transition_rejected_by_guard`** — a forced out-of-lifecycle transition is denied by `canTransitionGeneration` and never appended. Why: rule #2 + P3.2.
8. **`rng_outcomes_persisted_on_reproduction`** — happy-path reproduction records the LIVE outcome log into `agenome.fused`/`agenome.mutated` payloads (replay-faithful). Why: rule #7 / P3.6.
9. **`appends_only_via_append_path`** — the loop appends exclusively through `eventStore.append` (structural — imports only the append port, never the event table/schema). Why: rule #2.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **NONE (Appendix-A).** The loop CONSUMES frozen contracts (`Generation`, `Agenome`, `CandidateIdea`, `ReproductionEvent`, `RunEventType`, the seam events) — no field change. The seam PORT interfaces are **runtime-local shapes**, not Appendix-A models (like `AppConfig.seedSet`).
- **Architecture-doc note (maybe → cody, via lead):** a one-line §5 confirmation that the loop emits only kernel-owned events + consumes injected-seam events (the option-b orchestration boundary). Flag at Step 9 if it reads as a real spec addition.

## Things to flag at Step 2.5
1. **Seam port shape.** My default vote: each seam is `(candidates, ctx) => Promise<void>` that APPENDS its own events (the loop reads them back via `readByRun`) — so the loop never authors a seam event (rule: §5/option-b). Confirm vs the alternative (seam returns results, loop appends — rejected, it would make the loop author seam events).
2. **Test substrate.** My default vote: unit with a faked in-memory `eventStore` (append/readByRun) + faked gateway + faked seams — the real-PG append is already integration-tested (P1.3). Add a single integration smoke only if cheap. Confirm.
3. **`seams.ts` vs co-locate** the port types.
4. **Marker timing** = phase ENTRY (before seam work). Confirm.
5. **Run-level scope.** Confirm `run.started`/`run.completed` + terminal classification are OUT (P3.11/P3.12) and 10b is generation-level only.
6. **Cap-bound surface.** The loop wires `enforceCap` (maxGenerations/maxPopulation) as its bound (test 6/2). This CONSUMES the P3.4 invariant (already tested) rather than establishing a new one — but it's rule-#1-relevant, so security-reviewer runs (see commit count). Confirm the bound is the loop's natural termination (the kill-switch ABORT path is 10e).

## Dependencies + sequencing
- **Depends on:** P3.2 guards · P3.4 caps · P3.6 RNG · P3.9 seed set/clamp · gateway (P2.x) · append path (P1.3) — all done. **NOT** P3.10a (cost-map) — the skeleton does no energy debit (that's 10d). **No `git merge cody`** (no scrub/ProviderMeta surface — that's 10d).
- **Blocks:** 10c (edges extend the loop), 10d (energy emission in the loop body), 10e (kill/abort in the loop body), P3.11 (terminal classification), P3.12 (worker).
- **Sequencing:** the 2nd P3.10 sub-slice, after 10a lands. (The orchestrator commits the unstaged kernel-026 lesson + cross-doc rows + briefs at the 10a→10b boundary before this dispatches.)

## Estimated commit count
**1.** A cohesive happy-path loop skeleton — `feat(runtime)`. The loop wires the P3.4 cap enforcer as its bound (rule #1-relevant) → **security-reviewer policy = invariant** (confirm the bound holds — the loop cannot exceed maxGenerations/maxPopulation; the loop appends only via the append path, rule #2; the loop authors no seam event, rule #9). The HEAVY new safety invariants (energy success-only/scrub rule #4/#8 → 10d; kill drain/latching rule #1 → 10e) are deliberately NOT in this slice (safety-invariant behavior isolated from the feature skeleton).

## Lessons-logged candidates anticipated
- **Convention candidate (maybe):** "the generation loop is pure orchestration — it appends only kernel-owned events and consumes injected-seam events as DATA, never authoring a seam-owned event (the §2.5 subsystem boundary as code shape, option-b inject-and-fake)." Route at Step 9 if it lands as a distinct principle (extends the rule-#9 layer discipline).

## How to invoke
1. Read this brief + kernel-006 "How to use what was built" + the integration surface (the substrate exports in `runtime/index.ts`) + `ARCHITECTURE.md §5`.
2. Run `/tdd generation_loop_skeleton` (spec-lint stamp in the dispatch — Step 0 can skip re-lint).
3. Step 2.5 — send the per-test write-up + coverage map; the load-bearing confirms are #1 (seam port shape — loop never authors seam events) + #6 (cap-bound = loop termination) + #2 (test substrate).
4. Step 9 — flag the maybe §5 architecture note + the maybe orchestration-boundary lesson; confirm NO Appendix-A cross-doc row.
