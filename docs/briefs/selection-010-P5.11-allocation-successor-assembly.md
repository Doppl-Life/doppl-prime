# /tdd brief — heuristic_allocation_and_successor_population_assembly (P5.11 — Phase-5 finisher)

## Feature
The selection track's final step: **heuristic allocation** (`allocate`) distributes the next
generation's spawn slots across selected parents by a deterministic `fitness × novelty ×
energy-efficiency` heuristic, **clamped to the remaining global caps** (the allocation is a HINT —
`effectiveSpawns` never exceeds remaining caps, it never raises a cap; the kernel is the authoritative
enforcer — rule #1); and **successor population assembly** (`assembleSuccessor`) produces the gen N+1
population by invoking `reproduce` (P5.10) per allocated slot. The successor set is **fully derivable
from persisted events** (deterministic allocation over persisted fitness/novelty/energy + the
reproduction path's persisted RNG/fusion outcomes → replay-reconstructable). **Zero eligible parents →
empty successor** (`survivors:0`, no fabricated next generation). Assembly is a **runtime handoff** — it
returns the population set; it does NOT import the kernel and never raises a cap.

## Use case + traceability
- **Task ID:** P5.11
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (heuristic allocation = fitness × novelty
  × energy-efficiency for MVP — learned bandit/RL + a learned value model explicitly OUT of scope;
  allocation is a hint clamped by remaining global caps; the successor set derivable + replay-reconstructable
  from persisted events; zero-survivors → empty), `§5` (caps are kernel-enforced — rule #1; `spawnBudget`/
  allocation is a hint clamped to `min(remaining caps)`).
- **Related context:**
  - Consumes `selectParents`' eligible pool + the persisted component values (fitness via `FitnessScore.total`,
    novelty via `NoveltyScore`/the consumed value, energy-efficiency via P5.4) — composes already-persisted
    scores (no re-derivation, no provider calls — rule #7). Invokes **`reproduce`** (P5.10 `134ddd1`) per
    allocated slot (which delegates to `fuse`/`mutate` + emits the child events).
  - Frozen `RunCaps {maxPopulation, maxGenerations, energyBudget, maxSpawnDepth, maxToolCalls, wallClockTimeoutMs}`
    — the relevant bound here is the **population headroom** (`maxPopulation − currentPopulation`). The kernel
    ENFORCES caps (rule #1); P5.11's allocation RESPECTS the passed-in remaining-caps bound (a hint), the
    kernel re-enforces authoritatively.
  - **Child generation assignment is the kernel's** (P5.10 established it — children land in parents' gen G;
    the kernel mints + assigns gen N+1 at the handoff). P5.11 produces the population set + the per-parent
    allocation; the kernel does the gen-N+1 minting, state transitions, and `generation.completed` lifecycle.
  - Carry-forward: treat `runId`/`agenomeId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `allocate(parents, remainingCaps, ...) → Allocation` computes a per-parent spawn count from a
      **deterministic heuristic** `weight = fitness.total × novelty × energy-efficiency` (Q1), normalized to
      the available budget; the result is pure (no provider/clock/RNG beyond what's passed).
- [ ] **Caps-clamp (rule #1):** the total allocated spawns **never exceed the remaining population
      headroom** (`Σ allocation ≤ maxPopulation − currentPopulation`); allocation is a HINT that never
      raises a cap — a heuristic that would request more than the headroom is clamped DOWN to it. Pin:
      `Σ effectiveSpawns ≤ remaining`.
- [ ] **All-zero / degenerate heuristic boundary** (Q2): when every parent's weight is 0 (or the pool is
      empty), allocation is a defined value (default: 0 spawns / empty) — no `NaN`, no divide-by-zero, no
      negative allocation.
- [ ] `assembleSuccessor(input, deps) → SuccessorResult` produces the gen N+1 population by calling
      `reproduce` (P5.10) per allocated slot; the resulting children come from the reproduction path
      (fusion / mutation_only) with their events emitted by `reproduce`.
- [ ] **Zero eligible parents → empty successor** (`{ population:[], survivors:0 }`) — no fabricated next
      generation; consistent with the P5.7 zero-survivors / kernel-emits-`generation.completed{survivors:0}`
      seam (P5.11 returns the empty set + flag; the kernel emits the lifecycle terminal).
- [ ] **Runtime handoff, not a build-time import (rule #9 layering):** `assembleSuccessor` RETURNS the
      population set; it does NOT import the runtime kernel (the successor feeds the kernel's next-generation
      integration point, a runtime handoff). Pin: no kernel import in the module.
- [ ] **Replay-reconstructable (rule #7):** the successor set is fully derivable from persisted events —
      `allocate` is deterministic over the persisted fitness/novelty/energy values, and each child replays
      via `applyReproduction` (P5.10) from its persisted event — assert no gateway/embed call on the
      reconstruction path.
- [ ] **Out of scope (explicit):** no learned bandit/RL allocation, no learned value model / credit
      assignment — MVP heuristic only (a test or a not-tested-because notes the deferral).
- [ ] `allocate`/`assembleSuccessor` do not mutate their inputs; deterministic given `(input, seed)`.
- [ ] All unit tests in `apps/api/test/unit/selection/{allocation,successor}.test.ts` pass; full
      `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — the consumer is the P3 runtime generation loop (a runtime handoff).** `allocate` +
`assembleSuccessor` are exported from the selection barrel. **First consumer (named) = the P3 runtime
generation loop**, which: passes the eligible pool + the live `remainingCaps` (from the authoritative cap
ledger) + the per-run seed + the real `EventStore.append` emitter + `newId`, receives the successor
population set, then MINTS gen N+1 + assigns the children's generationId + applies the agenome state
transitions + emits `generation.started`(N+1)/`generation.completed{survivors:0}` — all kernel lifecycle.
The real-Postgres successor integration test rides that P3 wiring slice. Reachable now via the unit suite
(parent fixtures + a `remainingCaps` bound + `createFakeGateway`/fake emitter + a fixed seed).

## Files expected to touch
**New:**
- `apps/api/src/selection/allocation.ts` — `allocate(parents, remainingCaps, ...) → Allocation` (heuristic weight + caps-clamp + degenerate boundary). Pure.
- `apps/api/src/selection/successor.ts` — `assembleSuccessor(input, deps) → SuccessorResult` (allocate → reproduce per slot → population set; zero-eligible → empty; runtime handoff). Plus the replay reconstruction helper.
- `apps/api/test/unit/selection/allocation.test.ts`
- `apps/api/test/unit/selection/successor.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export `allocate`, `assembleSuccessor`, and the result types.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `allocation.test.ts`
1. **`allocate_heuristic_weight`** — per-parent spawns scale with `fitness.total × novelty × energy-efficiency` (a higher-weight parent gets ≥ a lower-weight parent). Why: §8 heuristic.
2. **`allocate_clamped_to_remaining_caps`** — a heuristic requesting more than `maxPopulation − currentPopulation` is clamped so `Σ allocation ≤ remaining`. Why: **rule #1** (allocation is a hint, never raises a cap).
3. **`allocate_never_exceeds_cap_even_with_huge_weights`** — pathologically large weights still yield `Σ ≤ remaining`. Why: rule #1 boundary.
4. **`allocate_all_zero_weights_boundary`** — every weight 0 (or empty pool) → defined allocation (0/empty), no NaN/divide-by-zero/negative. Why: degenerate boundary.
5. **`allocate_deterministic`** — same `(parents, remainingCaps)` → identical allocation. Why: replay (§8 derivable).
6. **`allocate_does_not_mutate_inputs`** — inputs unchanged. Why: purity.

### `successor.test.ts`
7. **`successor_assembles_population_via_reproduce`** — produces a population whose children come from `reproduce` (fusion/mutation_only) per allocated slot. Why: §8 successor assembly.
8. **`successor_size_within_caps`** — `population.length ≤ remaining population headroom`. Why: rule #1.
9. **`successor_zero_eligible_empty`** — no eligible parents → `{population:[], survivors:0}`; no fabricated generation; no `generation.completed` emitted here. Why: §8/§3 zero-survivors.
10. **`successor_no_kernel_import_runtime_handoff`** — `successor.ts` does not import the runtime kernel (returns the set). Why: §2.5 layering / runtime handoff (grep/structural assert).
11. **`successor_replay_reconstructable_no_gateway`** — the population reconstructs from persisted allocation + each child's `applyReproduction`, zero gateway/embed calls. Why: **rule #7**.
12. **`successor_deterministic_given_seed`** — same `(input, seed)` → identical population + events. Why: replay-faithful.
13. **`successor_learned_allocation_out_of_scope`** — (not-tested-because / a comment-pinned assertion) the allocation is the MVP heuristic; no bandit/RL/value-model path exists. Why: §8/§18 scope boundary.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `RunCaps`/`FitnessScore`/`NoveltyScore` + reuses P5.4/P5.10.
- **Orchestrator doc rows to write hot (Step 9 routing):** §8/§5 arch-note — pin the allocation heuristic
  (fitness × novelty × energy-efficiency), the caps-clamp (allocation is a hint, `Σ ≤ remaining`, never
  raises a cap — the kernel enforces), the zero-survivors → empty-successor path, and the runtime-handoff
  (returns the set; kernel mints gen N+1 + lifecycle). **This is the Phase-5-completing slice** → flag the
  Phase-5 box for `/phase-exit P5`. (Mine to route → integration.)
- **§2.5-seam model touched?** No shape change — consume-only; no new schema-snapshot.

## Things to flag at Step 2.5
1. **Allocation heuristic + slot mapping.** Default vote: per-parent `weight = fitness.total × novelty ×
   energy-efficiency`; normalize weights to the remaining-cap budget and allocate **integer** slots via
   **largest-remainder** (floor each proportional share, distribute the leftover by largest fractional
   remainder, deterministic tie-break by canonical parent id). Pin `Σ = min(budget, …)`. Push back if you
   want a simpler proportional/top-K mapping — the invariant (deterministic + `Σ ≤ remaining` + no-NaN)
   holds regardless.
2. **Degenerate boundary (all-zero / empty).** Default vote: all weights 0 → **0 spawns** (no basis to
   allocate); empty pool → empty. (Not equal-split — a zero-fitness population shouldn't spawn a full next
   gen.) Push back if you want a min-1-per-survivor floor.
3. **Which cap bounds the allocation.** Default vote: the **population headroom** `maxPopulation −
   currentPopulation` (passed in as `remainingCaps`/`remainingPopulation`); P5.11 clamps to it as a hint;
   the kernel re-enforces ALL caps authoritatively (rule #1). Energy/depth/tool-call caps are the kernel's
   per-call enforcement, not the allocation's. Confirm population-headroom is the right bound here.
4. **Novelty value source in the weight.** Default vote: use the candidate's consumed novelty value (the
   `NoveltyScore.score` / the degraded estimate the parent's best candidate carried) — already persisted;
   do NOT re-embed (rule #7). Confirm the per-parent novelty is taken from the persisted value, not recomputed.
5. **assembleSuccessor emits?** Default vote: P5.11 emits **no new event type** — the child events come
   from `reproduce` (agenome.fused/reproduced); generation lifecycle (generation.started/completed) is the
   kernel's. P5.11 orchestrates + returns the set. Confirm no P5.11-owned event.
6. **`/phase-exit P5` readiness.** This is the Phase-5 finisher. Default: at Step 9 I note Phase 5 is
   code-complete (P5.1 via P0 + P5.2–P5.11) so the orchestrator runs `/phase-exit P5` at close-out (auditor
   fan-out + spec coverage). Flag any P5 acceptance bullet you think is NOT yet covered so I catch it before
   the gate. (Reachability/wiring of the whole track is deferred to P3 integration by design — the
   phase-exit over-approximates to the accumulated track diff; I'll say so in the report.)

## Dependencies + sequencing
- **Depends on:** P5.10 (`reproduce`/`applyReproduction` ✓ `134ddd1`), P5.7 (`selectParents` pool ✓), P5.4
  (energy-efficiency ✓), P5.2/P5.6 (novelty/fitness values ✓), P0.3 (`RunCaps` ✓).
- **Blocks:** the P3 runtime generation loop (consumes the successor handoff) — cross-track, deferred.
- **Completes:** **Phase 5** (selection / scoring / reproduction) → `/phase-exit P5`.

## Estimated commit count
**1 — SOLO.** The Phase-5 finisher: rule-#1 caps-clamp (allocation hint) + the successor runtime-handoff +
orchestrates `reproduce` (event-emitting via delegation) + replay-reconstructable. Safety-relevant
(rule #1) + the phase-closing slice → not bundled.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §8/§5: the allocation heuristic + caps-clamp-as-hint + zero-survivors
  empty-successor + runtime-handoff (kernel mints gen N+1) contract.
- **Convention candidate** — allocation-clamp-as-hint: selection proposes a spawn allocation clamped to the
  passed remaining-caps bound (`Σ ≤ remaining`, never raises a cap), but the KERNEL is the authoritative cap
  enforcer (rule #1) — the hint/enforcer split, sibling to P5.8's `spawnBudget`-stays-a-hint.
- **Future TODO (P3 runtime)** — the generation loop passes live `remainingCaps` + seed + emitter, receives
  the successor set, mints gen N+1 + assigns child gens + applies state transitions + emits the generation
  lifecycle; real-PG successor integration test rides it.

## How to invoke
1. **Read this brief end-to-end** — it's the **Phase-5 finisher** (rule-#1 caps-clamp + successor
   runtime-handoff); 6 Step-2.5 questions (Q1 heuristic/slot-mapping + Q3 which-cap are the load-bearing ones).
2. **Run `/tdd heuristic_allocation_and_successor_population_assembly`**.
3. **Step 0/1** — confirm against Feature + Files.
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + votes Q1–Q6. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; note Phase-5 code-completion for `/phase-exit P5`; hold the
   §8/§5 note for me to route.
