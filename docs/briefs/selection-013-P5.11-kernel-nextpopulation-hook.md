# /tdd brief — kernel_nextPopulation_hook (additive successor-threading seam)

> **CROSS-TERRITORY SLICE (human-authorized Option A).** This slice edits KERNEL-territory files on track/selection (on loan, not owned). Keep the edit MINIMAL + ADDITIVE. **Cross-territory manifest (enumerate at Step 9 + round-seal): `apps/api/src/runtime/loop/generationLoop.ts`, `apps/api/src/runtime/worker/runWorker.ts` (+ their deps interfaces).** Explicit `git add <path>` per file, never -A. **GUARDRAIL: if threading needs ANYTHING beyond the additive hook below — a structural loop refactor, a port-TYPE change, a change to the candidate-production logic — STOP and flag a Finding; do not push through.**

## Feature
Add an additive, optional `nextPopulation?` hook to the kernel generation loop so a generation's reproduced offspring can become the next generation's population (the deferred "successor-population threading" — `generationLoop.ts:290`). The hook mirrors the existing `onIteration?` precedent (LESSONS §71): a new optional `GenerationLoopDeps` field, default-absent → today's behavior byte-for-byte (every existing loop test stays green). The loop's `const population` becomes `let`, and after each generation's reproduce phase the loop calls the hook (if present) to source the next generation's population. The hook's real impl (reconstruct children → re-home → clamp) is selection's W3b slice; this slice ships only the seam + a fake-driven test.

## Use case + traceability
- **Task ID:** P5.11
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (P5.11 "successor assembly hands off to the runtime kernel's next-generation integration point — a runtime handoff"). **Widens phase scope because** the handoff's kernel-side seam lives in the `§5` generation loop (the runtime integration point P5.11 names); this slice adds that additive seam.
- **Related context:**
  - The loop is pure orchestration over injected ports (LESSONS §64); `onIteration?` (LESSONS §71) is the exact additive-optional-hook precedent — copy its shape (optional dep, default no-op, injected, side-effect-free w.r.t. the event log).
  - `generationId` is ALREADY per-generation (`generationLoop.ts:324` `${runId}-gen${g}`) — so threading needs NO "mint gen N+1" change; the next iteration already has its own generationId. The hook only swaps which agenomes populate it.
  - W3b (selection-014) supplies the real hook impl: read the generation's `agenome.reproduced`/`agenome.fused` events → reconstruct each child via `applyReproduction(parents, reproductionEvent)` → re-home to the next generation (status `seeded`) → clamp to `maxPopulation`. This slice does NOT build that — it ships the seam + proves the loop uses the hook's return.

## Acceptance criteria (what "done" means)
- [ ] `GenerationLoopDeps` gains `readonly nextPopulation?: (args: NextPopulationArgs) => readonly Agenome[] | Promise<readonly Agenome[]>` — optional; absent → current behavior unchanged.
- [ ] `NextPopulationArgs` carries what a reconstruct-children impl needs: `{ prevPopulation: readonly Agenome[]; completedGenerationId: string; eligibleParents: readonly Agenome[]; log: readonly RunEventRow[]; maxPopulation: number }` (final field set is Step-2.5 Q1 — supply enough for W3b's impl without over-coupling).
- [ ] `population` becomes `let` (was `const`, line 292). After the reproduce phase + `generation.completed` append, the loop sets `population = await deps.nextPopulation({...}) ?? population` (guarded — absent hook leaves population untouched). NO other loop-internals change.
- [ ] When the hook returns a non-empty population, the NEXT generation produces candidates from THAT population (the hook's agenomes), not gen-0. Pinned by a fake hook returning a sentinel agenome set + asserting the next generation's `candidate.created`/`agenome` set derives from it.
- [ ] When the hook returns empty, the next generation sees an empty population → the existing `< minSurvival` path drives `generation_failed` (no fabricated population). Pinned.
- [ ] `runWorker` forwards an optional `nextPopulation` from `RunWorkerDeps` to `runGenerationLoop` (additive, mirrors the `onIteration`/`operatorStop` conditional-spread forwarding) — so W3b's boot root can inject it.
- [ ] **Default-absent regression:** every existing generationLoop + runWorker test stays green with zero changes (the hook is purely additive). Pinned by running the full existing suite.
- [ ] The hook is a SIDE seam, not an event author — it returns the next population; it appends nothing (the loop owns all event appends; rule #2). No `run_events` type is added.
- [ ] All tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
The hook's call site is the kernel generation loop boundary (`generationLoop.ts`, after the reproduce phase). Its production injector is the W3b boot composition root (`selection-014`) → `runWorker` → `runGenerationLoop`. This slice proves the loop CONSUMES the hook via a fake `nextPopulation` in the loop's existing unit test harness (`apps/api/test/unit/runtime/loop/generationLoop.test.ts`) + a runWorker forward test. Real impl + production injection = W3b.

## Files expected to touch
**Modified (KERNEL territory — on loan; manifest these):**
- `apps/api/src/runtime/loop/generationLoop.ts` — add `nextPopulation?` to `GenerationLoopDeps` + `NextPopulationArgs` type; `const population`→`let`; the guarded boundary call.
- `apps/api/src/runtime/worker/runWorker.ts` — add `nextPopulation?` to `RunWorkerDeps`; forward it (conditional spread) to `runGenerationLoop`.
- `apps/api/src/runtime/index.ts` — export `NextPopulationArgs` if it isn't covered by the existing `GenerationLoopDeps` re-export.

**Modified (tests):**
- `apps/api/test/unit/runtime/loop/generationLoop.test.ts` — fake-hook threading tests.
- `apps/api/test/unit/runtime/worker/runWorker.test.ts` — forward test.

## RED test outline
1. **`test_nextPopulation_absent_is_current_behavior`** — run the loop with NO hook. Asserts: identical event stream to today (existing tests already encode this — assert no regression). Why: additive/non-breaking (LESSONS §71).
2. **`test_next_generation_uses_hook_population`** — fake hook returns a sentinel agenome set after gen-0. Asserts: gen-1's `agenome`/`candidate.created` set derives from the sentinel agenomes, not gen-0's. Why: §8 P5.11 threading (gen N+1 from offspring).
3. **`test_hook_receives_completed_generation_context`** — Asserts: the hook is called once per completed generation with `completedGenerationId` + `eligibleParents` + the post-reproduce `log`. Why: supplies W3b's reconstruct-children impl.
4. **`test_empty_hook_population_drives_generation_failed`** — fake hook returns `[]`. Asserts: the next generation hits `< minSurvival` → `generation_failed`, no fabricated agenomes. Why: no-fabrication boundary (§5/§8).
5. **`test_runWorker_forwards_nextPopulation`** — Asserts: `runWorker` passes its `nextPopulation` dep through to the loop (fake hook observed). Why: the W3b injection path.
6. **`test_hook_appends_no_events`** — Asserts: the hook is pure-return; the loop appends all events; no new run_event type. Why: rule #2 (loop owns appends).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes docs)
- **Model field changes:** none (no contract touched; the hook is a runtime-local dep type).
- **Orchestrator doc rows to write hot:** none. Arch-note candidate (§5/§8: the additive successor-threading seam) banks for the cody handoff.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **`NextPopulationArgs` field set.** Supply enough for W3b's reconstruct-children impl (`completedGenerationId`, `eligibleParents`, `log`, `maxPopulation`) without over-coupling the loop to selection. My default vote: **the 5 fields above**; `eligibleParents` + `log` are exactly what `applyReproduction` reconstruction needs. Flag if the loop can't cleanly supply `eligibleParents` at the call site (it has `eligibleParents` in scope post-reproduce — line 452).
2. **Where the next population's generationId/status is set.** The hook RETURNS `Agenome[]`; re-homing each child to the next generationId + status `seeded` is W3b's impl concern (selection logic), NOT the loop's. My default vote: **the loop does NOT re-home** — it uses the returned agenomes as-is; W3b's impl sets generationId/status before returning. Confirm the candidate-production loop's `transitionAgenomeOrThrow('seeded','active')` (line 339, hardcoded 'seeded') accepts the threaded agenomes — **if it forces a loop-logic change, STOP/Finding** (guardrail #1).
3. **Hook call placement — after `generation.completed` vs before.** My default vote: **after the reproduce phase + the `generation.completed` append**, at the end of the iteration, so the reproduction events are in the log for the hook to read. Flag if the zero-survivors `continue` path (line 455-459) should also call the hook (it shouldn't — no offspring there; the run winds down).
4. **Async hook.** assembleSuccessor/applyReproduction are sync, but reading the log may be async. My default vote: **support `Promise<readonly Agenome[]> | readonly Agenome[]`** (await at the call site) — future-proof + matches the loop's async body. Flag if you'd keep it sync.

## Dependencies + sequencing
- **Depends on:** W2 reproduce-seam (`selection-012`, landed `609a811` — produces the agenome.reproduced/fused events the W3b impl will reconstruct from) + the merged P3 loop/worker.
- **Blocks:** W3b boot composition root + threading impl + demo trigger (`selection-014`).

## Estimated commit count
**1.** A single additive kernel-seam commit (`feat(runtime):` — kernel territory). Isolated so the kernel lead can review the borrowed-file edit cleanly at the eventual merge. NOT bundled with W3b (cross-area + cross-territory).

## Lessons-logged candidates anticipated
- **Convention candidate** — "thread cross-step state into a kernel loop via an additive optional hook (default no-op → zero behavior change, existing tests green), mirroring LESSONS §71's onIteration; the hook RETURNS state, never appends — the loop keeps event-authorship."
- **Architecture-doc note candidate** — §5/§8: the successor-threading seam (`nextPopulation`) realizes P5.11's runtime handoff; gen N+1's population = gen N's reconstructed offspring.
- **Cross-territory manifest** — generationLoop.ts + runWorker.ts edited on loan; flag at round-seal for the kernel lead's merge review.

## How to invoke
1. Read this brief end-to-end — note the CROSS-TERRITORY guardrail (STOP/Finding if more than additive is needed).
2. Run `/tdd kernel_nextPopulation_hook`.
3. Step 0 — confirm the restatement + the minimal-additive scope.
4. Step 2.5 — answer the 4 design questions (or take defaults); ESPECIALLY confirm Q2 (no loop-logic change forced).
5. Step 9 — include the cross-territory manifest.
