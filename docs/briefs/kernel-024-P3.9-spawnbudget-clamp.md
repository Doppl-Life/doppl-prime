# /tdd brief — spawnbudget_clamp_to_remaining_caps

## Feature
The **spawnBudget clamp** (P3.9, the rule-#1 pin) — a PURE `clampSpawnBudget(spawnBudget, remainingPopulation) → {effectiveSpawns, clamped}` that treats an agenome's `spawnBudget` trait strictly as an allocation HINT: `effectiveSpawns = min(spawnBudget, max(0, remainingPopulation))`, so a trait can NEVER raise the population cap. Pure decision — the clamp-decision *event* is emitted by the spawn caller (gen-0 spawn P3.9-seed / reproduction P3.10), not here (§5 ownership split; lesson 33). SOLO safety slice.

## Use case + traceability
- **Task ID:** P3.9 (the spawnBudget-clamp half; the gen-0 authored seed set is a separate feature slice).
- **Architecture sections it implements:** `ARCHITECTURE.md §5` (*"the agenome's `spawnBudget` trait is an allocation hint only: `effectiveSpawns = min(agenome.spawnBudget, remaining global caps)`; the clamp decision is emitted as an event. An agenome trait can never raise a cap"* + *"spawnBudget is treated strictly as an allocation hint; it can never raise maxPopulation or maxSpawnDepth"* + *"Population spawn respects maxPopulation: the run never spawns more agenomes than the cap permits"*). Key safety rule #1.
- **Consumed (never redefined):** frozen `Agenome.spawnBudget` (`z.int().nonnegative()`, P0.4) — the hint; the P3.4 `capLedger.remaining` (`Record<CapDimension, number>`) supplies `remaining[maxPopulation]`. The maxSpawnDepth ceiling is a SEPARATE depth gate via P3.4 `enforceCap('maxSpawnDepth', …)` — NOT this clamp.
- **Pattern (follow the SHIPPED codebase):** P3.2/P3.4/P3.6 established **pure decide / caller emits** (`runtime/index.ts` barrel §5 note). The clamp DECIDES `effectiveSpawns`; the spawn caller appends the clamp-decision event when `clamped`.
- **Safety:** key safety rule #1 (caps kernel-enforced; spawnBudget clamped to min(remaining caps), never prompt-raisable). SOLO — never bundled.

## Acceptance criteria (what "done" means)
- [ ] `clampSpawnBudget(spawnBudget, remainingPopulation)` returns `effectiveSpawns = min(spawnBudget, max(0, remainingPopulation))` — NEVER exceeds `remainingPopulation` (a `spawnBudget > remaining` is clamped DOWN to `remaining`; rule #1 — the hint can't raise the cap).
- [ ] `clamped` flag = `effectiveSpawns < spawnBudget` (so the caller knows to emit the clamp-decision event; the emission itself is the caller's, P3.9-seed/P3.10).
- [ ] `remainingPopulation <= 0` → `effectiveSpawns = 0` (no spawn at/over the cap — `max(0, …)` guards a negative remaining).
- [ ] `spawnBudget === 0` → `effectiveSpawns = 0`, `clamped = false` (a zero-hint isn't a clamp).
- [ ] The clamp reads ONLY `(spawnBudget, remainingPopulation)` — there is no path by which any other agenome trait widens `effectiveSpawns` (rule #1 by shape).
- [ ] **Pure**: same inputs → same result; no emit, no mutation, no IO (lesson 33).
- [ ] All unit tests in `apps/api/test/unit/runtime/spawn/spawnBudgetClamp.test.ts` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — the clamp-decision event + the spawn loop land in P3.9-seed / P3.10.** Exported from `apps/api/src/runtime/index.ts` (alongside P3.2/P3.4/P3.5/P3.6). **First consumers (named, lesson 20):** the gen-0 seed spawn (P3.9 seed-set slice — clamps the authored baseline against `remaining[maxPopulation]`) + reproduction dispatch (P3.10 — clamps each parent's offspring `spawnBudget`); both pass `capLedger(consumed, caps).remaining.maxPopulation` and, when `clamped`, append the clamp-decision event.

## Files expected to touch
**New:**
- `apps/api/src/runtime/spawn/spawnBudgetClamp.ts` — `clampSpawnBudget` + the `SpawnClampResult` type.
- `apps/api/test/unit/runtime/spawn/spawnBudgetClamp.test.ts`

**Modified:**
- `apps/api/src/runtime/index.ts` — export `clampSpawnBudget` + the type.

## RED test outline (Step 2)
1. **`clamp_allows_budget_under_remaining`** — `spawnBudget < remaining` → `effectiveSpawns = spawnBudget`, `clamped = false`. Why: §5 hint honored when it fits.
2. **`clamp_caps_budget_to_remaining`** — `spawnBudget > remaining` → `effectiveSpawns = remaining`, `clamped = true` (the hint can't raise the cap). Why: §5 / rule #1.
3. **`clamp_zero_when_no_headroom`** — `remaining = 0` (and a negative remaining) → `effectiveSpawns = 0`. Why: §5 "spawn respects maxPopulation."
4. **`clamp_zero_budget`** — `spawnBudget = 0` → `effectiveSpawns = 0`, `clamped = false`. Why: a zero-hint isn't a clamp.
5. **`clamp_reads_only_budget_and_remaining`** — no other trait input path widens the result (structural; rule #1 by shape).
6. **`clamp_is_pure`** — same inputs → equal result; no mutation/IO.

> **Positive-decision discipline (lesson 10):** each clamp/zero test leads with the under-remaining positive assertion.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE.** Consumes frozen `Agenome.spawnBudget` + the P3.4 `capLedger`; the clamp is adapter-local.
- **Orchestrator doc rows to write hot:** likely a Convention lesson (spawnBudget is a hint clamped to min(remaining) — rule #1 by shape; caller emits the clamp event — extends lesson 33/38). No §-anchor change.
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **Pure decide / caller emits the clamp event.** My default vote: **pure** — `clampSpawnBudget` returns `{effectiveSpawns, clamped}`; the spawn caller (P3.9-seed/P3.10) appends the clamp-decision event when `clamped`. Matches P3.4/P3.5/P3.6.
2. **Which cap(s) the clamp uses.** My default vote: **maxPopulation only** (population headroom). `maxSpawnDepth` is a separate depth gate via P3.4 `enforceCap('maxSpawnDepth', …)` at the spawn site — NOT folded into this clamp (single-responsibility; the cap enforcer already owns dimension checks).
3. **Input shape.** My default vote: take `remainingPopulation: number` directly (the caller passes `capLedger(...).remaining.maxPopulation`) — decoupled from the full `CapLedgerView` so the clamp has one obvious responsibility.

## Dependencies + sequencing
- **Depends on:** P0.4 (`Agenome.spawnBudget` frozen) ✓ · P3.4 `capLedger` (supplies `remaining[maxPopulation]`) ✓.
- **Blocks:** P3.9 gen-0 seed spawn (clamps the authored baseline) + P3.10 reproduction (clamps offspring spawn). **Completes the rule-#1 spawnBudget half of P3.9** (the authored seed set is the remaining P3.9 feature half).

## Estimated commit count
**1.** SOLO safety-critical slice (key safety rule #1 — spawnBudget is a hint, never cap-raising) — its OWN commit, **never bundled** with the gen-0 seed-set feature (root `CLAUDE.md` TDD posture). Small but a load-bearing pin. **security-reviewer in the loop** (policy: invariant): confirm `min`/`max(0,…)` totality (no negative/over-cap effectiveSpawns) + the structural no-other-trait-widens. `feat(runtime)`.

## Lessons-logged candidates anticipated
- **Convention candidate** — "spawnBudget is an allocation HINT clamped to `min(spawnBudget, remaining population)` (rule #1 by shape — no trait can raise the cap); the clamp is a pure decision, the spawn caller emits the clamp-decision event (extends lesson 33/38)."

## How to invoke
1. **Read this brief** + the P3.4 caps slice (`runtime/caps/`) for the pure-decide pattern + the `capLedger.remaining` source.
2. **Run `/tdd spawnbudget_clamp_to_remaining_caps`**.
3. **Step 0/1** — confirm restatement + file list (one pure fn, emission deferred).
4. **Step 2.5** — send the per-test write-up + coverage map; the load-bearing confirmation is #2 (maxPopulation only; depth is P3.4's).
5. **Step 9** — surface anything unexpected.
