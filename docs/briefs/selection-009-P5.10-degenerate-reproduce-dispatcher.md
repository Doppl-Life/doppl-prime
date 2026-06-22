# /tdd brief — reproduce_dispatcher_and_degenerate_mutation_only_fallback (P5.10)

## Feature
The reproduction **dispatcher** + the degenerate `<2-parent` fallback for the selection track:
`reproduce(eligibleParents, deps)` routes by the count of **distinct eligible parents** —
- **≥2** → two-level **fusion** (delegates to P5.9 `fuse`);
- **exactly 1** → **`mutation_only`** from the single survivor (delegates to P5.8 `mutate`), emitting
  `agenome.reproduced{mode:'mutation_only'}` (a `ReproductionEvent` with `parentAgenomeIds:[survivor]`,
  `crossoverPoints:[]`, the `mutate` `mutationSummary`);
- **0** → **no offspring**, emits `reproduction_aborted_insufficient_parents` (context) and returns a
  `zeroSurvivors` flag (the kernel emits `generation.completed{survivors:0}` — selection never fabricates
  a parent).

No fusion/crossover/output_synthesis is attempted with fewer than two distinct eligible parents. The
`mutation_only` child reuses the bounded, RNG-persisted `mutate` path, so it is **replay-reconstructable**
(rule #7); the dispatcher's replay path reconstructs by `mode` (fusion→`applyFusion`, mutation_only→
`applyMutation`) with zero RNG re-sample and zero gateway calls.

## Use case + traceability
- **Task ID:** P5.10
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (reproduction modes; degenerate fallback),
  `§3` (the `<2`-parent fallback + the zero-survivors `generation.completed{survivors:0}` path), `§4`
  (rule #7 — persisted RNG outcomes; the closed event registry incl. `reproduction_aborted_insufficient_parents`).
- **Related context:**
  - Delegates to **`fuse`/`applyFusion`** (P5.9 `94ca2fe`) for ≥2 parents and **`mutate`/`applyMutation`**
    (P5.8) for the single-survivor `mutation_only` path — no new reproduction mechanism, just the
    dispatch + the degenerate fallback. Reuses the emitter seam + `newId` + `createRng`.
  - Frozen `ReproductionEvent` `mode` includes **`mutation_only`** (`crossoverPoints` may be `[]` — int[],
    empty parses; `parentAgenomeIds` count 0–2 is a kernel rule, and `mutation_only` legitimately has 1).
  - `agenome.reproduced` + `reproduction_aborted_insufficient_parents` are in the closed registry; **neither
    is high-traffic** → P5.10 validates the `ReproductionEvent` payload explicitly (`ReproductionEvent.parse`)
    before emit (same as P5.7 CullingEvent / P5.9 agenome.fused).
  - **Consumes `selectParents`' output** (P5.7) — the eligible parent pool the dispatcher routes on. The
    per-run seed + real `EventStore.append` emitter + agenome state transitions + the
    `generation.completed{survivors:0}` lifecycle emit are the kernel's (P3, deferred).
  - Carry-forward: treat `runId`/`agenomeId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `reproduce(input, deps) → ReproduceResult` routes by **distinct** eligible-parent count: ≥2 →
      fusion (via `fuse`); 1 → `mutation_only` (via `mutate`); 0 → aborted + `zeroSurvivors:true`. Two
      references to the same parent id count as **1 distinct** (no self-fusion).
- [ ] **≥2 path:** delegates to `fuse` (P5.9) unchanged — the child + `agenome.fused` are P5.9's; the
      dispatcher does not re-implement fusion.
- [ ] **1 (mutation_only) path:** mutates the single survivor via `mutate` (P5.8), builds a
      `ReproductionEvent{parentAgenomeIds:[survivor], childAgenomeId, mode:'mutation_only', crossoverPoints:[], mutationSummary}`
      that **parses**, and emits exactly one `agenome.reproduced` (the ReproductionEvent payload,
      validated explicitly) — `actor:'selection_controller'`, schemaVersion CURRENT. The child Agenome
      parses + records `parentIds:[survivor]`, `status:'seeded'`.
- [ ] **0 (abort) path:** emits exactly one `reproduction_aborted_insufficient_parents` (context: the
      trigger/reason, generic payload), produces **no child**, and returns `zeroSurvivors:true` — the
      kernel emits `generation.completed{survivors:0}` (P5.10 does NOT emit the lifecycle terminal).
- [ ] **No fusion with <2 distinct parents:** the 1-parent + 0-parent paths never call `fuse`/the
      `fusion_synthesis` gateway role (assert the injected gateway is not invoked on those paths).
- [ ] **REPLAY (rule #7):** a dispatcher replay path reconstructs the child by `mode` — `'fusion'`/
      `'crossover'` → `applyFusion`, `'mutation_only'` → `applyMutation` — from the persisted
      `ReproductionEvent`, with **zero RNG re-sample and zero gateway calls**; the abort path has no child
      to reconstruct.
- [ ] The fallback decision + its trigger (insufficient parents) are **explainable from persisted events**
      (the `mutation_only`/`aborted` event carries the reason/context — §8).
- [ ] `reproduce` is deterministic given `(input, seed)`; does not mutate its inputs.
- [ ] All unit tests in `apps/api/test/unit/selection/reproduction/{reproduce,degenerate}.test.ts` pass;
      full `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — caller wiring lands in P5.11 + the P3 runtime.** `reproduce` (+ the replay dispatcher) is exported
from the selection barrel. **First consumer (named) = P5.11** (`successor.ts` calls `reproduce` across the
allocated parent slots to assemble the gen N+1 population) + the **P3 runtime** (supplies the per-run seed
+ real `EventStore.append` emitter + `newId`, applies the agenome state transitions, emits
`generation.completed{survivors:0}` on `zeroSurvivors`; real-Postgres integration test rides it). Reachable
now via the unit suite (parent fixtures + `createFakeGateway` + a fixed seed + fake emitter).

## Files expected to touch
**New:**
- `apps/api/src/selection/reproduction/degenerate.ts` — the `mutation_only`-from-single-survivor fallback + the abort/zero-survivors decision; `DegenerateOutcome` type.
- `apps/api/src/selection/reproduction/reproduce.ts` — `reproduce(input, deps)` dispatcher (≥2→fuse / 1→degenerate mutation_only / 0→abort) + the `applyReproduction(parents, reproductionEvent)` replay dispatcher (by `mode`). `ReproduceResult`/`ReproduceInput` types; reuse the emitter seam.
- `apps/api/test/unit/selection/reproduction/reproduce.test.ts`
- `apps/api/test/unit/selection/reproduction/degenerate.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export `reproduce`, `applyReproduction`, and the result types.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `degenerate.test.ts`
1. **`mutation_only_from_single_survivor`** — 1 eligible parent → `mutate`'d child, `mode:'mutation_only'`, `parentIds:[survivor]`, `Agenome.parse(child)` ok. Why: §3 degenerate fallback.
2. **`mutation_only_event_validates`** — the `ReproductionEvent` (mode mutation_only, crossoverPoints []) parses; emitted as one `agenome.reproduced`. Why: §8 + explicit-validate.
3. **`mutation_only_reuses_persisted_mutation`** — the child is reconstructable from the persisted `mutationSummary` via `applyMutation` (no re-sample). Why: rule #7.
4. **`abort_on_zero_parents`** — 0 eligible → no child, one `reproduction_aborted_insufficient_parents` (with reason), `zeroSurvivors:true`. Why: §3 zero-survivors.
5. **`degenerate_no_fusion_gateway`** — neither path calls the gateway. Why: §8 no fusion with <2 parents.

### `reproduce.test.ts`
6. **`dispatch_two_or_more_to_fusion`** — ≥2 distinct parents → delegates to `fuse` (agenome.fused emitted; mode fusion/crossover). Why: §8 dispatch.
7. **`dispatch_one_to_mutation_only`** — exactly 1 → mutation_only path. Why: §3.
8. **`dispatch_zero_to_abort`** — 0 → abort + zeroSurvivors. Why: §3.
9. **`distinct_parent_count_dedups`** — the same parent id twice → counted as 1 → mutation_only (no self-fusion). Why: §8 "two distinct eligible parents."
10. **`replay_dispatch_by_mode_no_gateway_no_rng`** — `applyReproduction` reconstructs fusion→applyFusion / mutation_only→applyMutation from the persisted event, 0 gateway + 0 rng. Why: **rule #7**.
11. **`reproduce_deterministic_given_seed`** — same `(input, seed)` → identical child + event. Why: replay-faithful.
12. **`reproduce_does_not_mutate_inputs`** — inputs unchanged. Why: purity.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `ReproductionEvent`/`Agenome` + reuses P5.8/P5.9.
- **Orchestrator doc rows to write hot (Step 9 routing):** §8/§3 arch-note — pin the dispatch rule
  (≥2→fusion / 1→mutation_only / 0→abort+zeroSurvivors; distinct-parent dedup; selection-returns-flag /
  kernel-emits-generation.completed) + the `mode`-keyed replay dispatch. (Mine to route → integration.)
- **§2.5-seam model touched?** No shape change — consume-only; `ReproductionEvent`/`Agenome` snapshots
  exist. No new schema-snapshot; conformance pinned by tests 1/2.

## Things to flag at Step 2.5
1. **Distinct-parent counting.** Default vote: count **distinct parent agenome ids**; ≥2 distinct → fusion,
   1 distinct → mutation_only (a pool of `[A, A]` → 1 distinct → mutation_only, never self-fusion). Confirm.
2. **mutation_only event type.** Default vote: emit **`agenome.reproduced`** with the `ReproductionEvent`
   (mode `mutation_only`, `crossoverPoints:[]`) — matching the plan's `agenome.reproduced{mode:'mutation_only'}`.
   (Not `agenome.mutated` — that's the standalone-mutation event; here it's a reproduction outcome.) Confirm.
3. **Abort event + payload.** Default vote: 0 parents → emit **`reproduction_aborted_insufficient_parents`**
   with a generic context payload (`{reason, generationId}`), no `ReproductionEvent` (no child); return
   `zeroSurvivors:true`. The kernel emits `generation.completed{survivors:0}`. Confirm the abort is an
   event (explainability) vs a silent flag — I lean emit-the-event.
4. **Replay dispatch shape.** Default vote: `applyReproduction(parents, reproductionEvent)` switches on
   `reproductionEvent.mode` → `applyFusion` (fusion/crossover/output_synthesis) | `applyMutation`
   (mutation_only); fully gateway-free + rng-free (reuses P5.8/P5.9 replay). Confirm.
5. **Emitter.** Default vote: reuse the emitter seam (envelope minus sequence/occurredAt = AppendInput).
   This is the moment to introduce the **shared `SelectionEmitter`** type (you flagged it across
   Novelty/Fitness/Cull/Fusion) — reproduce can define + use it; the prior slices stay as-is (not
   retrofitted mid-round). Confirm whether to introduce the shared type here or keep local.
6. **mutation_only `mutationMeta.mode` override.** Default vote: the `mutate` primitive set
   `mutationMeta.mode:'mutation'`; for the reproduction outcome, the dispatcher records the reproduction
   `mode:'mutation_only'` on the `ReproductionEvent` (the authoritative reproduction record); leave the
   child's `mutationMeta` as `mutate` produced it (don't double-author). Confirm (or override the child's
   `mutationMeta.mode` to `'mutation_only'` for consistency — your call; I lean leave-as-mutate-produced +
   the ReproductionEvent carries the reproduction mode).

## Dependencies + sequencing
- **Depends on:** P5.9 (`fuse`/`applyFusion` ✓ `94ca2fe`), P5.8 (`mutate`/`applyMutation` ✓), P5.7
  (`selectParents` pool ✓), P0.9 (`ReproductionEvent` ✓), P0.4 (`Agenome` ✓).
- **Blocks:** P5.11 (`successor.ts` calls `reproduce` across allocated slots to assemble gen N+1).

## Estimated commit count
**1 — SOLO.** The reproduction dispatcher + degenerate fallback; emits `agenome.reproduced`/
`reproduction_aborted_insufficient_parents` + carries the rule-#7 mode-keyed replay dispatch. Event-emitting
+ safety-relevant (replay) → not bundled. **Split from P5.11** (allocation/successor) deliberately:
P5.11 depends on this dispatcher, carries the rule-#1 caps-clamp, and the implementer's context is climbing
— two focused slices with a checkpoint beat one large bundle here.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §8/§3: the dispatch rule (≥2/1/0 → fusion/mutation_only/abort,
  distinct-parent dedup, selection-flag/kernel-emits) + the mode-keyed replay dispatch.
- **Convention candidate** — the mode-keyed replay dispatcher: a single `apply*` that switches on the
  persisted `mode` to the matching reconstructor (applyFusion/applyMutation), keeping the whole
  reproduction family replay-faithful behind one entry.
- **Future TODO (P5.11 + P3)** — P5.11 calls `reproduce` per allocated slot; the kernel supplies seed/
  emitter/newId, applies state transitions, emits `generation.completed{survivors:0}` on `zeroSurvivors`.

## How to invoke
1. **Read this brief end-to-end** — it's the reproduction dispatcher + degenerate fallback (delegates to
   P5.8/P5.9; the new logic is the routing + abort + mode-keyed replay); 6 Step-2.5 questions.
2. **Run `/tdd reproduce_dispatcher_and_degenerate_mutation_only_fallback`**.
3. **Step 0/1** — confirm against Feature + Files.
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + votes Q1–Q6. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; hold the §8/§3 note for me to route.
