# /tdd brief — runcaps_enforcement_and_kill_switch

## Feature
The kernel's **RunCaps enforcement + kill switch** (P3.4) — the load-bearing rule-#1 safety pin. Three PURE decision components in `apps/api/src/runtime/caps/`: `capEnforcer` (every cap dimension fails **closed** before a bounded action proceeds; caps come ONLY from `RunConfig.caps`, never an agenome trait), `killSwitch` (computes the terminal-transition plan + partial-summary on operator-stop or any cap breach), and `capLedger` (pure consumed-vs-remaining per dimension, queryable). They **decide only** — the generation loop (P3.10) / worker (P3.12) own emit + scheduling-halt + drain (the §5 ownership split; lesson 33). SOLO safety slice.

## Use case + traceability
- **Task ID:** P3.4.
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (*"Caps (load-bearing invariant). RunCaps = {maxPopulation, maxGenerations, energyBudget, maxSpawnDepth, maxToolCalls, wallClockTimeoutMs}. Caps are enforced in the kernel, never by prompt text… An agenome trait can never raise a cap. The kill switch (operator stop or any cap breach) drives {any non-terminal} → failed/stopped, halts scheduling, drains in-flight calls, and writes a partial terminal summary"*); `§15`/REQ-NF-001 (hard caps fail closed). Key safety rule #1.
- **Consumed (never redefined):** frozen `RunCaps` (P0.3 — six `z.int().positive()` ceilings) + `RunConfig.caps`; the P3.2 guards `canTransitionRun` / `canTransitionGeneration` (kernel-017, exported from `runtime/index.ts`) — the killSwitch plan validates each terminal transition through them; the cap-breach event TYPES `run.failed` / `run.stopped` / `energy_exhausted` / `generation_failed` (closed registry, P0.1) named by the decision (not emitted here).
- **Pattern (load-bearing — follow the SHIPPED codebase, not the template's worked example):** the P3.2 guards + P3.6 RNG established **pure decide / loop emits / appender persists** (`runtime/index.ts` barrel: *"Guards are PURE decisions; the loop/appender own emit + persist (§5 ownership split)"*). `capEnforcer`/`killSwitch` therefore **emit NOTHING** — they diverge from `docs/tdd-brief-template.md`'s illustrative worked example (which appends `spawn.rejected` inside the enforcer). We follow the shipped split: the enforcer/killSwitch return a decision; P3.10/P3.12 append the named event.
- **Safety:** key safety rule #1 (caps kernel-enforced, never prompt-enforced). SOLO — never bundled.

## Acceptance criteria (what "done" means)
- [ ] `enforceCap(dimension, consumed, requested, caps)` fails **closed**: returns `{allowed:false, reason:'cap_exceeded', dimension, cap, consumed, requested}` when `consumed + requested > caps[dimension]`, else `{allowed:true}`. Boundary: `consumed + requested === cap` is allowed (the cap is the inclusive ceiling); `=== cap + 1` is denied.
- [ ] Caps are read **only** from the `RunCaps` argument (sourced from `RunConfig.caps`) — the enforcer takes **no agenome / trait input by shape**, so an agenome trait structurally cannot raise a cap (rule #1; the "no-X-via-shape" structural technique, lesson 9/11/27). A test pins that there is no trait/spawnBudget parameter path into the ceiling.
- [ ] `enforceWallClock(elapsedMs, caps)` denies when `elapsedMs >= caps.wallClockTimeoutMs` — **`elapsedMs` is injected** (the caller measures the clock); the enforcer calls no `Date`/clock itself (pure + testable; consistent with the P3.6 no-ad-hoc-clock-in-decision discipline).
- [ ] `planKillSwitch(trigger, runStatus, generationStatuses)` returns a pure plan: operator-stop → run `…→stopped`; any cap breach / wall-clock → run `…→failed`; every non-terminal generation → `…→failed`; a state already **terminal is left untouched** (each planned transition validated through `canTransitionRun`/`canTransitionGeneration` — an illegal/from-terminal transition is excluded, never forced). The plan carries the `reason` + the partial-summary content (computed from the passed state). It **emits nothing**.
- [ ] The plan **names** the cap-driven terminal event(s) to persist (`run.failed`/`run.stopped`/`energy_exhausted`/`generation_failed`) so every cap-driven terminal path is replayable — emission is wired by P3.10/P3.12 (this slice produces the replay-faithful decision, not the append).
- [ ] `capLedger(consumed, caps)` is a **pure** map → `{ remaining: Record<dim, number>, breached: Record<dim, boolean> }` (remaining = `max(0, cap - consumed)`; breached = `consumed >= cap`) so the worker + health endpoint read caps-consumed without re-deriving. Sourcing the `consumed` tallies (live accumulation vs event-fold) is the worker's concern (P3.12) — out of scope here.
- [ ] All three components are **pure**: same inputs → same decision; no emit, no mutation, no IO (lesson 33/26).
- [ ] All unit tests in `apps/api/test/unit/runtime/caps/*.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — emission + scheduling-halt + in-flight drain land in P3.10 / P3.12.** P3.4 exports `enforceCap`, `enforceWallClock`, `planKillSwitch`, `capLedger` (+ types) from `apps/api/src/runtime/index.ts` (alongside the P3.2 guards + P3.6 RNG). **First consumers (named, lesson 20):** P3.10 generation loop (calls `enforceCap` before each bounded action — spawn/generation/tool-call/energy; on a breach calls `planKillSwitch` then appends the named events through the event-store append path) + P3.12 worker (reads `capLedger` for `GET /runs/:id/health`; halts scheduling + drains on a kill plan). The append path itself is the event-store `append.ts` (P1.3/P1.4) — **P3.3 is satisfied-by-P1.3/P1.4** (one append path; a 2nd runtime appender would be a divergent path, rule #2), so no new appender here.

## Files expected to touch
**New:**
- `apps/api/src/runtime/caps/capEnforcer.ts` — `enforceCap` + `enforceWallClock` + the `CapDecision` type.
- `apps/api/src/runtime/caps/killSwitch.ts` — `planKillSwitch` + the `KillPlan` / `KillTrigger` types.
- `apps/api/src/runtime/caps/capLedger.ts` — `capLedger` + the `CapLedgerView` type.
- `apps/api/test/unit/runtime/caps/{capEnforcer,killSwitch,capLedger}.test.ts`

**Modified:**
- `apps/api/src/runtime/index.ts` — export the three components + their types.

If implementation needs files beyond this list, flag at Step 2.5.

## RED test outline (Step 2)
`capEnforcer.test.ts`:
1. **`enforce_cap_allows_under_and_at_ceiling`** — `consumed+requested < cap` and `=== cap` → `allowed:true`. Why: §5 inclusive ceiling.
2. **`enforce_cap_fails_closed_over_ceiling`** — `consumed+requested === cap+1` → `{allowed:false, reason:'cap_exceeded', dimension, cap, consumed, requested}`. Why: §5/REQ-NF-001 fail-closed.
3. **`enforce_cap_reads_caps_only_from_runcaps_arg`** — caps come from the `RunCaps` arg; there is no trait/spawnBudget parameter path that can raise the ceiling (structural — a trait can't raise a cap, rule #1).
4. **`enforce_wall_clock_injected_elapsed`** — `elapsedMs >= wallClockTimeoutMs` → denied; `<` → allowed; the fn reads no `Date` (elapsed injected). Why: §5 wall-clock + pure-decision discipline.

`killSwitch.test.ts`:
5. **`kill_operator_stop_plans_stopped`** — operator-stop trigger → run plan `…→stopped`, non-terminal generations `…→failed`, reason carried. Why: §5 kill switch.
6. **`kill_cap_breach_plans_failed`** — cap-breach / wall-clock trigger → run `…→failed`; names the cap-driven terminal event(s). Why: §5 + replayable cap-driven terminal.
7. **`kill_leaves_terminal_untouched`** — a run/generation already terminal is excluded from the plan (validated via `canTransitionRun`/`canTransitionGeneration`; never forces a from-terminal transition). Why: §3 no-exit-from-terminal + lesson 33.
8. **`kill_plan_is_pure_and_emits_nothing`** — same inputs → equal plan; no append/mutation/IO.

`capLedger.test.ts`:
9. **`ledger_remaining_and_breached`** — `remaining = max(0, cap-consumed)` (never negative), `breached = consumed >= cap`, per dimension across all six caps. Why: §5 queryable cap state.
10. **`ledger_is_pure`** — same `(consumed, caps)` → equal view; no mutation of inputs.

> **Positive-decision discipline (lesson 10):** each deny/breach test leads with the allowed/under-ceiling positive assertion.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE.** Consumes frozen `RunCaps`/`RunConfig`; decisions + ledger are adapter-local.
- **Orchestrator doc rows to write hot:** likely a Convention lesson (caps = pure fail-closed decision, loop emits — extends lesson 33). Possible §5 Architecture-doc note: pin the kill-switch trigger→terminal mapping (operator-stop→stopped, cap-breach/wall-clock→failed) if §5 leaves it implicit — route at Step 9 (ARCHITECTURE.md = cody-owned, multi-track).
- **§2.5-seam model touched?** No — consumes the frozen contract; no Appendix-A field-set change (no schema-snapshot test).

## Things to flag at Step 2.5
1. **Pure decide / loop emits (NOT the template's emit-in-enforcer).** My default vote: **pure** — `capEnforcer`/`killSwitch` return decisions; P3.10/P3.12 append the named events. Matches the shipped P3.2/P3.6 split (barrel comment §5 ownership). Flag if you read §5 as wanting the enforcer to append directly (it doesn't — one append path is P3.10/P3.12's job).
2. **`capLedger` consumed-sourcing.** My default vote: `capLedger` is a **pure fn over `(consumed tallies, caps)`** → remaining/breached; the worker (P3.12) accumulates the tallies and replay folds the log. Don't build event-folding here (out of scope; would pull in the append/read path).
3. **killSwitch trigger→terminal mapping.** My default vote: operator-stop → `stopped`; cap-breach + wall-clock → `failed`; all non-terminal generations → `failed` (per §5 "{any non-terminal} → failed/stopped"). Confirm against §3 run/generation terminal edges.
4. **wall-clock clock injection.** My default vote: `enforceWallClock(elapsedMs, caps)` takes elapsed as input (pure); the worker measures the clock. Keeps the decision deterministic/testable + consistent with P3.6 (no ad-hoc clock in decision logic). The clock is a real-time guard whose OUTCOME is persisted (replay reads the terminal event, never re-measures).
5. **Enforcement granularity.** My default vote: a per-dimension `enforceCap(dimension, consumed, requested, caps)` primitive (each dimension checked before its own bounded action) + the separate `enforceWallClock`; NOT a monolithic `enforceCaps(state, action)`. **Do NOT include the `spawnBudget`→`effectiveSpawns` clamp — that's P3.9** (`spawnBudgetClamp.ts`); P3.4 only enforces caps as ceilings.

## Dependencies + sequencing
- **Depends on:** P0.3 (`RunCaps`/`RunConfig` frozen) ✓ · P3.2 guards (`canTransitionRun`/`canTransitionGeneration`, kernel-017) ✓ · **P3.3 satisfied-by-P1.3/P1.4** (append path exists; emission deferred so not on the critical path).
- **Blocks:** P3.5 energy ledger (the cap enforcer sees true successful spend), P3.9 (spawnBudget clamp reuses the ceiling), P3.10 (loop calls enforce/killSwitch + emits), P3.11 terminal classification, P3.12 worker (health reads the ledger).

## Estimated commit count
**1.** SOLO safety-critical slice (key safety rule #1 — caps kernel-enforced) — its OWN commit, **never bundled** (TDD posture + brief-template safety-invariant pitfall). **security-reviewer in the loop** (policy: invariant): focus the review on fail-closed totality across all six dimensions, the structural no-trait-can-raise-a-cap, and that the kill plan never forces a from-terminal transition. `feat(runtime)`.

## Lessons-logged candidates anticipated
- **Convention candidate** — "caps are a PURE fail-closed `(consumed, requested, RunConfig.caps)→decision`; the enforcer takes no trait input (a trait can't raise a cap by shape); the loop emits the cap-breach event (decide/emit split, extends lesson 33)."
- **Architecture-doc note candidate** — pin the kill-switch trigger→terminal mapping into §5 if implicit (operator-stop→stopped, cap-breach/wall-clock→failed).

## How to invoke
1. **Read this brief** + the P3.2 guards (`runtime/state/`) for the pure-decide pattern this follows; note the §5 ownership split (decide here, emit in P3.10/P3.12).
2. **Run `/tdd runcaps_enforcement_and_kill_switch`**.
3. **Step 0/1** — confirm restatement + file list (three pure components, emission deferred).
4. **Step 2.5** — send the per-test write-up + coverage map; the load-bearing confirmations are #1 (pure, not emit-in-enforcer) + #3 (trigger→terminal mapping).
5. **Step 9** — flag the §5 trigger→terminal note if load-bearing; surface anything unexpected.
