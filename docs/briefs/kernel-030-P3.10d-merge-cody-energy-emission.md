# /tdd brief — merge_cody_and_energy_emission

## Feature
**P3.10 sub-slice (d) — TWO phases in one slice:**
- **Phase 1 (merge/reconcile):** `git merge cody` into track/kernel — pulls the **verifier scrub fix** (the L21 fix needed for the energy.spent ProviderMeta round-trip) + sv5 (a no-op for our contracts, already built) + cody's advances. The ONLY conflicts are the orchestrator-territory docs (`apps/api/LESSONS.md` + `apps/api/CLAUDE.md`) — resolved via the **impl→orch handoff** (LESSON 36).
- **Phase 2 (energy accounting):** the loop emits **`energy.spent` (success-only)** on each productive spend (llm on an accepted gateway call · spawn on agenome.spawned · tool on tool_call.finished), and **`provider_call_failed`** per failed attempt (NO debit — rule #8), with a **scrub→append→read round-trip** assertion pinning that `energy.spent` ProviderMeta `tokensIn/tokensOut` survive the redaction scrub as NUMBERS (the cody scrub fix).

SAFETY slice (rule #4 scrub / rule #8 success-only energy). The energyBudget cap **ENFORCEMENT** (breach→kill) is **10e**, not here — 10d only EMITS the accounting.

## Use case + traceability
- **Task ID:** P3.10 sub-slice (d). Implements the §5 energy-ledger emission + the cross-track scrub-fix pull. Folds the long-standing §C/§H carry-forward: "L21 scrub-fix `git merge cody` + scrub→append→read round-trip on energy.spent ProviderMeta before emitting."
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (the `doppl_energy` unit + `EnergyEvent`; energy debited only on success) + `§5` (the energy ledger; "failed/retried/repaired attempts do NOT debit energy … `provider_call_failed{attempt,reason}` per failed attempt") + `§6` (the gateway returns ProviderMeta) + `§14` (the redaction scrub at the persistence boundary). Key safety rules #4 (secrets never leave the server; the scrub runs before append), #8 (energy = successful productive spend only; failures emit provider_call_failed + do NOT debit), #2 (energy.spent / provider_call_failed are append-path events).
- **Why (merge):** track/kernel still carries the OLD `scrubSecrets` (substring `'token'` match corrupts `ProviderMeta.tokensIn/tokensOut` z.int → string → fails safeParse on read — breaks rules #2/#4/#7). The verifier-owned fix is on cody (LESSON 46). **Pull it via `git merge cody` — NEVER write a divergent kernel scrub (LESSON 21/36).** This is the first kernel slice that appends ProviderMeta, so it's the first that needs the fix.
- **Why (energy):** the loop (10b/10c) makes provider calls but does NOT yet debit energy. 10d adds the success-only debit + the failure event, completing the §4/§8 energy model on the loop's call path.

## Acceptance criteria (what "done" means)

### Phase 1 — merge + reconcile
- [ ] `git merge cody` into track/kernel. Confirm it pulls cody's fixed `apps/api/src/event-store/redaction.ts` (the scrub fix) + the verifier dirs + sv5 (no-op). **NO divergent scrub** — the fix comes ONLY from cody (LESSON 21).
- [ ] **Code/contract conflicts (expected ≈ none — disjoint territories):** the impl resolves any that arise + confirms the FULL suite green (the conflicted markdown docs don't affect tests). If a real CODE/CONTRACT conflict appears, flag at Step 7.5 (it would be a surprise).
- [ ] **Doc conflicts → impl HOLDS + hands to orch (LESSON 36 — territory-guard blocks impl on LESSONS.md/CLAUDE.md):** the orchestrator resolves `apps/api/LESSONS.md` + `apps/api/CLAUDE.md` in-territory, then the impl commits the single merge commit. The reconcile (orch will apply):
  - **CLAUDE.md:** KEEP track/kernel's **sv5 cross-doc rows** (RunEventType **41**, schemaVersion **5**) — cody's rows are STALE (37/4; the scoped sv5 merge didn't carry the doc routing). Adopt cody's lessons-index L37–L50; renumber track-local **L41→L51** + **L42→L52**; DROP track/kernel's dup index rows L37–L40.
  - **LESSONS.md:** adopt cody's L1–L50 (verifier L37–L46 + kernel L47–L50); add track-local **L41→L51** (terminal-audit) + **L42→L52** (loop-orchestration); DROP track/kernel's L37–L40 (dupes of cody L47–L50 — orch VERIFIES identical first: cody L47=RNG/L48=caps/L49=energy/L50=preflight ≡ track/kernel L37/L38/L39/L40).
- [ ] After the merge commit: full suite green; `CURRENT_SCHEMA_VERSION` still 5; LESSONS.md anchors run 1–52 contiguous; CLAUDE.md index rows match.

### Phase 2 — energy accounting (TDD, on the merged tree)
- [ ] On an **accepted** gateway call (validationResult accepted|repaired), the loop appends **`energy.spent`** (eventType `llm`) built via `reconcileEnergy({scope, eventType:'llm', estimate, providerMeta}, appConfig.costMap)` — `actual` derived from the REAL `providerMeta` (tokensIn/tokensOut), never the estimate (P3.5 / rule #8). Uses `appConfig.costMap` (10a).
- [ ] On a **rejected** gateway response (or per surfaced attempt-failure), the loop appends **`provider_call_failed`** (one per failed attempt, `{attempt, reason}` from the response's failure info) and **debits NO energy** (rule #8 by shape — a failed attempt yields no EnergyEvent).
- [ ] **spawn** energy: on `agenome.spawned`, append `energy.spent` (eventType `spawn`, `energyForSpawn`). **tool** energy: on `tool_call.finished`, append `energy.spent` (eventType `tool`, `energyForTool`). (Flat costs; no ProviderMeta. Flag at 2.5 if you'd rather scope 10d to llm-only + defer spawn/tool — my default: include all three, they're mechanical.)
- [ ] **Scrub round-trip (the load-bearing safety test):** append an `energy.spent` whose ProviderMeta has distinctive `tokensIn`/`tokensOut` integers → read it back (readByRun) → assert they survive as the SAME NUMBERS (not corrupted to a string/`[REDACTED]`). This pins the cody scrub fix; on the OLD scrub this test FAILS (RED proves the fix is load-bearing). No secret value leaks (a planted secret-shaped string in a scrubbable field IS redacted).
- [ ] Energy debits **only on success** (the happy + repaired paths), never on rejected/failed (rule #8) — assert a rejected call produces `provider_call_failed` and ZERO `energy.spent`.
- [ ] Full suite green; `/preflight` clean (incl `format:check`, LESSON 40).
- [ ] **Out of scope (named):** energyBudget cap **ENFORCEMENT** (cumulativeSpend ≥ budget → energy_exhausted → drain) → **10e** (10d only EMITS energy.spent; 10e folds it into the cap check) · kill/cap-breach/wall-clock abort + drain + latching (10e) · candidate.generation_started marker (deferred observability) · successor-population threading · run-terminal (P3.11).

## Wiring / entry point (Step 7.5)
Phase 1 has no entry point (a merge). Phase 2 extends `runGenerationLoop` (the 10b/10c entry, runtime barrel) — the energy debit + failure event ride the existing gateway-call + spawn + tool_call paths. **Flag at Step 7.5 if any CODE/CONTRACT conflict appears in the merge** (expected none — surprise if so). The scrub is consumed via the append path (P1.3 calls `scrubEventPayload`); the loop does NOT call the scrub directly (it appends; the append path scrubs).

## Files expected to touch
**Phase 1 (merge):** whatever `git merge cody` brings (redaction.ts fix + verifier dirs + sv5 no-op + the shared-root docs fast-forward) + the orch-resolved `apps/api/LESSONS.md` + `apps/api/CLAUDE.md`.
**Phase 2 (energy):**
- `apps/api/src/runtime/loop/generationLoop.ts` — the energy.spent (llm/spawn/tool, success-only) + provider_call_failed emission on the existing call/spawn/tool paths; consume `appConfig.costMap` + `reconcileEnergy`/`energyFor*` (P3.5).
- `apps/api/test/unit/runtime/loop/generationLoop.test.ts` (extend) — the energy + failure + scrub-round-trip tests.
- (If a real-PG scrub round-trip is wanted beyond the faked-eventStore's real-discipline, an integration test — flag at 2.5; the faked eventStore already runs the real scrub if it composes `scrubEventPayload`, confirm.)

## RED test outline (Step 2 — Phase 2)
1. **`energy_spent_on_accepted_llm_call`** — accepted gateway call → `energy.spent`{eventType:'llm'}, actual from providerMeta (ceil(tokens/tokensPerUnit) via appConfig.costMap). Why: §4/§8.
2. **`no_energy_debit_on_rejected_call`** — rejected response → `provider_call_failed` appended, ZERO `energy.spent` for that call. Why: rule #8 (success-only).
3. **`provider_call_failed_per_attempt`** — N attempt-failures → N `provider_call_failed{attempt,reason}`, no debit. Why: §5.
4. **`scrub_round_trip_preserves_provider_meta`** — append energy.spent with tokensIn/tokensOut ints → readByRun → identical numbers (the cody scrub fix; FAILS on the old scrub). Why: rules #4/#2/#7 (L21).
5. **`secret_value_still_redacted`** — a planted secret-shaped value in a scrubbable field IS redacted on the same round-trip (the fix narrows the scrub, doesn't disable it). Why: rule #4.
6. **`spawn_and_tool_energy_success_only`** — agenome.spawned → energy.spent{spawn}; tool_call.finished → energy.spent{tool}; flat costs from costMap. Why: §4.
7. **`happy_path_and_edges_unaffected`** — the 10b/10c suite stays green with energy added (regression). Why: additive.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **NONE new (Appendix-A).** Consumes frozen `EnergyEvent` (P0.9), `ProviderMeta` (P0.9), `RunEventType` (energy.spent/provider_call_failed both pre-existing). The **merge** brings cody's sv5 doc state — the orch reconcile (Phase 1) keeps track/kernel's sv5 CLAUDE.md rows + renumbers lessons; that's the only doc churn.
- **Architecture-doc note (maybe → cody via lead):** §5 — the loop's energy.spent success-only emission + provider_call_failed + the scrub round-trip; flag at Step 9.

## Things to flag at Step 2.5 / 7.5
1. **Merge surprises (Step 7.5).** Any CODE/CONTRACT conflict beyond LESSONS.md/CLAUDE.md (expected none — disjoint territories). If the redaction.ts fix did NOT come in clean, STOP + flag (the scrub round-trip depends on it).
2. **Scrub round-trip substrate.** Confirm the faked eventStore composes the REAL `scrubEventPayload` (so test 4 actually exercises the fix), OR add a focused integration test. My vote: faked eventStore running the real scrub (consistent with 10b D5).
3. **llm-only vs all-three energy.** My default: include llm + spawn + tool. Flag if you'd rather scope to llm + provider_call_failed + scrub (the safety core) and defer spawn/tool flat-cost energy.
4. **10d↔10e boundary.** Confirm 10d only EMITS energy.spent; the energyBudget ENFORCEMENT (cumulativeSpend≥budget → kill) is 10e.
5. **candidate.generation_started.** Optional: fold the deferred marker into this gateway-call touch, or keep it deferred. Your call (low-pri observability).

## Dependencies + sequencing
- **Depends on:** 10b/10c loop (the call/spawn/tool paths) · P3.5 energy ledger (reconcileEnergy/energyFor*/costMap) · 10a (appConfig.costMap) · **cody's verifier scrub fix (via the Phase-1 merge)** — all available (cody@06299c9 has the LESSON-46 scrub fix + sv5). kernel-026's LESSON 41 + kernel-028's LESSON 42 are the track-local lessons the merge renumbers (→ L51/L52).
- **Blocks:** 10e (energyBudget enforcement folds cumulativeSpend(energy.spent) into the cap check) · P3.11 (terminal classification).
- **Sequencing:** the 4th P3.10 sub-slice. **SAFETY** (rule #4/#8) — security-reviewer policy = **invariant** (confirm: energy debits only on success; the scrub round-trip preserves ProviderMeta numbers AND still redacts secrets; no divergent scrub; provider_call_failed carries no debit). The merge brings cody@06299c9 (demo round-4 not yet landed — a smaller pull; the lead confirmed no timing needed).

## Estimated commit count
**2.** (1) the **merge commit** (Phase 1 — 2 parents: track/kernel tip + cody; the orch-reconciled docs included). (2) `feat(runtime)` energy emission (Phase 2). The merge is its own commit (never squashed with the feature); the energy build is the TDD feat. SAFETY slice — never bundled with unrelated feature work.

## Lessons-logged candidates anticipated
- Possibly a cross-track-merge note (the scoped-sv5-merge left cody's CLAUDE.md doc rows stale → the kernel-side merge must KEEP its own sv5 rows over cody's stale ones while adopting cody's lessons) — route at Step 9 if distinct from LESSON 35/36. Likely covered.

## How to invoke
1. Read this brief + LESSON 21 (no divergent scrub) + LESSON 36 (cross-track merge impl→orch doc-handoff) + kernel-020 (the merge-reconcile precedent) + the energy ledger (`reconcileEnergy`/`costMap`, P3.5) + the loop (`generationLoop.ts`).
2. **Phase 1:** `git merge cody` → resolve code conflicts (expected none) + confirm suite green → message the orch the LESSONS.md/CLAUDE.md conflict (HOLD) → orch resolves → commit the merge.
3. **Phase 2:** `/tdd merge_cody_and_energy_emission` (the energy build; spec-lint stamp in the dispatch).
4. Step 2.5 — send the energy test write-up; load-bearing confirms: #2 scrub-round-trip substrate + #3 energy scope + #4 10d↔10e boundary.
5. Step 9 — flag the maybe §5 arch note; confirm NO new Appendix-A row; the merge reconcile is the doc churn (orch-applied).
