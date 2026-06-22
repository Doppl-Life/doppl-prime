# /tdd brief — two_level_fusion_with_distant_lineage_preference (P5.9)

## Feature
Two-level reproduction **fusion** for the selection track: **agenome-level crossover** (deterministic
splice of two parents' traits at persisted `crossoverPoints`) + **output-level synthesis** (a model
merges the parents' reasoning via the `fusion_synthesis` gateway role, port-only), with an explicit
**distant-lineage anti-collapse preference** (parent-distance = cosine distance over the **persisted**
novelty embedding vectors — never re-embeds). `fuse(...)` (live) emits `fusion.started` → `agenome.fused`
and persists every non-deterministic outcome (crossover indices + the synthesis output) into the
`ReproductionEvent`; `applyFusion(...)` (replay) reconstructs a **bit-exact** child from those persisted
outcomes with **no gateway call** (rule #7). The child `Agenome` records both `parentIds` + fusion
metadata, is schema-validated, and carries `mode` ∈ `fusion`/`crossover`/`output_synthesis`.

## Use case + traceability
- **Task ID:** P5.9
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (two-level fusion = crossover +
  output-synthesis; distant-lineage preference via the idea-space/novelty embedding as an anti-collapse
  force; RNG/fusion outcomes persisted; child schema-validated; parent-distance reuses persisted vectors,
  never re-embeds), `§4/§12` (the `fusion.started`→`agenome.fused` operation-start marker pairing — no
  energy debit), `§14` (rule #5 — parent text reaches the synthesis model only as sentinel-delimited DATA).
- **Related context:**
  - Consumes `selectParents`' output (P5.7 `9fd104d`) — the eligible parent pool. Reuses **`createRng`**
    + **`mutate`/`applyMutation`** (P5.8), **`cosineSimilarity`** (P5.2 `cosine.ts`), the **emitter seam**
    + **`newId`**, and the frozen **sentinel/`wrapUntrusted`** (`@doppl/contracts`, via verifier/critic-input).
  - Frozen `ReproductionEvent {id, runId, parentAgenomeIds[], childAgenomeId, mode(fusion|crossover|output_synthesis|mutation_only), crossoverPoints(int[]), mutationSummary(record<string,string|number|boolean>)}` — the `agenome.fused` payload. **`agenome.fused` is NOT high-traffic** → P5.9 validates `ReproductionEvent.parse` explicitly before emit (don't rely on the generic fall-through; same as P5.7's CullingEvent).
  - `fusion_synthesis` is a frozen `ModelRole`; the fake gateway's `ROLE_FIXTURES.fusion_synthesis` returns `{synthesis:'stub fusion synthesis'}` — drive synthesis tests with `createFakeGateway({mode:'valid'})`.
  - The **per-run RNG seed** + the **real `EventStore.append` emitter** + the **agenome state transitions** are the kernel's (P3) — supplied at wiring (deferred). P5.9 is the fusion **operation**; the reproduction orchestrator (P5.10/P5.11) decides WHICH pairs fuse.
  - Carry-forward: treat `runId`/`agenomeId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `parentDistance(vectorA, vectorB)` = a deterministic distance over the **persisted** novelty vectors
      (default: `1 − cosineSimilarity`, reusing P5.2 `cosine.ts`); pure, never calls the gateway/embeds
      (rule #7). A parent with **no novelty vector** (degraded novelty) is handled by a defined boundary
      (Q1), never a `NaN`/throw.
- [ ] Fusion **prefers distant lineages**: given the parent pool, `fuse` selects the **most distant**
      eligible pair by `parentDistance` (anti-collapse), with equal-distance ties broken deterministically
      via `createRng(seed)`.
- [ ] **Agenome-level crossover** produces the child's traits by a **deterministic** splice of the two
      parents at `crossoverPoints` (Q2); the `crossoverPoints(int[])` persisted in the `ReproductionEvent`
      are **sufficient to reconstruct** the crossover exactly (rule #7).
- [ ] **Output-level synthesis** calls the `fusion_synthesis` gateway role **through the port only**
      (rule #9 — no provider SDK in selection); the parents' text reaches the model **only as
      sentinel-delimited DATA** (rule #5 — wrap via the frozen sentinel; the synthesis instruction is in
      the system message, never interpolated with parent text); the **synthesis output is persisted** into
      the originating event (so replay reads it, never re-calls — rule #7).
- [ ] `fuse(parents, deps) → { child: Agenome, reproductionEvent }`: the child records `parentIds` = both
      parents, fusion metadata (`mutationMeta`/`mode`), `status:'seeded'`, and **parses against the frozen
      `Agenome`**; `mode` is recorded as `fusion` (both levels) / `crossover` / `output_synthesis` per Q5.
- [ ] `fuse` emits, in order, exactly **one** `fusion.started` (generic marker payload, NO energy debit)
      then **one** `agenome.fused` (the `ReproductionEvent` payload, validated via `ReproductionEvent.parse`),
      via the injected emitter (`actor:'selection_controller'`, `schemaVersion=CURRENT`, run/gen ids).
- [ ] **REPLAY (rule #7):** `applyFusion(parents, reproductionEvent, deps?)` reconstructs a child
      **deep-equal** to `fuse`'s child from the persisted `crossoverPoints` + the persisted synthesis
      output, with **zero gateway calls** (assert the injected gateway is never invoked on this path) —
      parent-distance reuses the persisted vectors, crossover replays the persisted points, synthesis
      reads the persisted output.
- [ ] `fuse` is deterministic given `(parents, seed)`; neither `fuse` nor `applyFusion` mutates the input
      parents (pure over inputs; `fuse`'s only effect is the gateway synthesis call + the two emits).
- [ ] All unit tests in `apps/api/test/unit/selection/reproduction/{parent-distance,crossover,fuse}.test.ts`
      pass; full `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — caller wiring lands in P5.10/P5.11 + the P3 runtime.** `parentDistance`/`crossover`/`fuse`/
`applyFusion` are exported from the selection barrel. **First consumers (named):** **P5.10/P5.11**
(reproduction orchestrator — decides which eligible pairs fuse, supplies the per-run seed + the real
`EventStore.append` emitter + `newId`, assembles the successor population); the **P3 runtime** applies the
agenome state transitions + the real-Postgres `agenome.fused` integration test rides that slice. Reachable
now via the unit suite (parent fixtures with persisted novelty vectors + `createFakeGateway` + a fixed seed).

## Files expected to touch
**New:**
- `apps/api/src/selection/reproduction/parent-distance.ts` — `parentDistance(a,b)` + distant-pair selection helper. Pure (reuses `cosine.ts`).
- `apps/api/src/selection/reproduction/crossover.ts` — deterministic agenome-level crossover → `{childTraits, crossoverPoints}`. Pure (RNG via `createRng`).
- `apps/api/src/selection/reproduction/fuse.ts` — `fuse(parents, deps)` (live: distant-pair → fusion.started → crossover + gateway synthesis → build+validate child → agenome.fused) + `applyFusion(parents, reproductionEvent, deps?)` (replay) sharing one `reconstructFusedChild`. `FusionEmitter` seam.
- `apps/api/test/unit/selection/reproduction/{parent-distance,crossover,fuse}.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export the fusion surface + types.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `parent-distance.test.ts`
1. **`distance_is_one_minus_cosine`** — identical vectors → distance 0; orthogonal → 1. Why: §8 idea-space distance.
2. **`distant_pair_selected`** — from a pool, the most distant pair is chosen (anti-collapse). Why: §8 anti-collapse force.
3. **`distance_missing_vector_boundary`** — a parent with no novelty vector → defined boundary (Q1), no NaN/throw. Why: degraded-novelty robustness.
4. **`distance_no_gateway_pure`** — parentDistance never calls the gateway/embeds. Why: rule #7.

### `crossover.test.ts`
5. **`crossover_splices_traits_at_points`** — child traits = deterministic splice of parents at `crossoverPoints` (Q2). Why: §8 agenome-level crossover.
6. **`crossover_points_reconstruct`** — the persisted `crossoverPoints` reproduce the identical child traits (no extra RNG). Why: rule #7.
7. **`crossover_deterministic_seeded`** — same `(parents, seed)` → identical traits + points. Why: replay-faithful.
8. **`crossover_does_not_mutate_parents`** — parents deep-equal a snapshot. Why: purity.

### `fuse.test.ts`
9. **`fuse_synthesis_via_gateway_port_role`** — synthesis calls `role:'fusion_synthesis'` through the injected gateway. Why: §8 output-synthesis + rule #9.
10. **`fuse_parent_text_wrapped_as_data`** — parent text reaches the synthesis call sentinel-wrapped as DATA; the instruction is not interpolated with parent text (rule #5). Why: injection isolation.
11. **`fuse_emits_started_then_fused_in_order`** — exactly `[fusion.started, agenome.fused]`; `agenome.fused` payload `ReproductionEvent.parse` ok; `actor:'selection_controller'`. Why: §4/§12 marker pairing + explicit-validate.
12. **`fuse_child_records_both_parents_and_mode`** — child `parentIds`=[A,B], `mode` per Q5, fusion metadata; `Agenome.parse(child)` ok. Why: §8/§3 schema-valid offspring.
13. **`fuse_persists_synthesis_and_points`** — the synthesis output + `crossoverPoints` are persisted in the `ReproductionEvent`. Why: rule #7 persisted outcomes.
14. **`REPLAY_applyFusion_reconstructs_no_gateway`** — `applyFusion` deep-equals `fuse`'s child from the persisted event, gateway call-count **0**. Why: **rule #7** (the slice's safety pin).
15. **`fuse_deterministic_given_seed`** — same `(parents, seed)` → identical child + event. Why: replay-faithful.
16. **`fuse_marker_no_energy`** — the two emitted types are exactly `fusion.started` + `agenome.fused` (no `energy.spent`). Why: rule #8.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `ReproductionEvent`/`Agenome`/`NoveltyScore`/`ModelRole`.
- **Orchestrator doc rows to write hot (Step 9 routing):** §8 arch-note — pin the fusion contract:
  parent-distance = `1−cosine` over persisted vectors (+ missing-vector boundary), distant-pair anti-collapse
  preference, the crossover mechanism + `crossoverPoints` encoding (Q2), the synthesis-as-DATA isolation
  (rule #5), and the live-`fuse`/replay-`applyFusion` split. (Mine to route → integration.)
- **§2.5-seam model touched?** No shape change — consume-only; `ReproductionEvent`/`Agenome` snapshots
  exist. No new schema-snapshot; child + event conformance pinned by tests 11+12.

## Things to flag at Step 2.5
1. **Missing-novelty-vector boundary (parent-distance).** Default vote: a parent with no persisted novelty
   vector (degraded path) → treat the pair distance as a **defined max distance (1.0)** (so a degraded
   parent is neither artificially preferred nor crashed on) + flag it; never NaN/throw. Alternative: exclude
   such parents from distant-pair ranking. I lean max-distance-1.0 (keeps them eligible); push back if you
   want exclusion.
2. **Crossover mechanism (the detail one).** Default vote: deterministic structured-trait splice — sort
   `personaWeights` keys canonically, pick a seeded crossover index → parentA's values before / parentB's
   after; `toolPermissions` spliced the same way (canonical-sorted); `systemPrompt` + `decompositionPolicy`
   each chosen from one parent by a seeded coin. `crossoverPoints(int[])` records every index/choice so
   `applyFusion` reconstructs exactly. (Avoids char-splicing a prompt into gibberish.) Push back with a
   different mechanism — the invariant (deterministic + fully captured in `crossoverPoints` + schema-valid
   child) holds regardless.
3. **Synthesis isolation (rule #5).** Default vote: **wrap parent-supplied text via the frozen sentinel
   (`wrapUntrusted`) as DATA** in a user message; the synthesis instruction lives in the system message,
   never interpolated with parent text — parent systemPrompts are prior model output (untrusted), so a
   malicious parent prompt can't hijack the synthesis. Confirm (it's a few lines reusing the frozen
   primitive).
4. **Replay split shape.** Default vote: `fuse` (live, gateway) + `applyFusion(parents, reproductionEvent)`
   (replay, no gateway) share one `reconstructFusedChild(parents, crossoverPoints, synthesisOutput)`; pin
   `fuse.child === applyFusion(parents, fuse.reproductionEvent)`. Mirrors P5.8 mutate/applyMutation. Confirm.
5. **`mode` assignment.** Default vote: both levels performed → `mode:'fusion'`; if a path does only the
   crossover → `'crossover'`; only the synthesis → `'output_synthesis'`. MVP `fuse` does both → `'fusion'`.
   Confirm (or default everything to `'fusion'` for the two-level op).
6. **Synthesis-output placement in the child.** Default vote: the persisted synthesis output is recorded in
   the `ReproductionEvent` (the originating event) + folded into the child's fusion metadata
   (`mutationMeta`/a trait) deterministically; it is NOT a free re-call. Confirm where the synthesis text
   lands on the child (a trait vs metadata-only).
7. **Slice size / split escape hatch.** This is a large slice (3 files, gateway + marker + replay + rule-#5).
   Default: ship as ONE slice (the plan's P5.9 task). If at GREEN it proves unwieldy, flag and I split into
   `parent-distance + crossover` (pure) then `fuse` (gateway + emit + replay). Say so at Step 2.5 if you
   want it pre-split.

## Dependencies + sequencing
- **Depends on:** P5.7 (`selectParents` ✓ `9fd104d`), P5.8 (`createRng`/`mutate` ✓), P5.2 (`cosine.ts` ✓),
  P0.4 (`Agenome` ✓), P0.8 (`NoveltyScore` ✓), P0.9 (`ReproductionEvent` ✓), P0.11 (`fusion_synthesis` role ✓).
- **Blocks:** P5.10 (degenerate `<2-parent` fallback shares the reproduction path), P5.11 (successor
  assembly invokes fusion for the eligible pairs).

## Estimated commit count
**1 — SOLO.** Gateway-touching (rule #9) + emits the `fusion.started`/`agenome.fused` events + carries the
rule-#7 replay split (live `fuse` / replay `applyFusion`) + the rule-#5 synthesis isolation — a
safety-relevant, event-emitting, provider-touching slice → not bundled. (The plan's single P5.9 task; the
3 files are its natural decomposition. Split escape hatch in Q7.)

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §8: the fusion contract (parent-distance over persisted vectors +
  anti-collapse pair selection; crossover mechanism + `crossoverPoints` encoding; synthesis-as-DATA
  isolation; live/replay split) so P5.10/P5.11 + the kernel depend on a defined shape.
- **Convention candidate** — the gateway-op replay split extended: a reproduction op that BOTH samples
  (RNG) AND calls a provider (synthesis) persists BOTH outcome classes (RNG indices + provider output) in
  one event, so the single replay `apply*` reconstructs with zero RNG re-sampling AND zero provider calls
  (rule #7 — the union of P5.8's mutate split + P5.2's embed/recompute split).
- **Future TODO (P5.10/P5.11 + P3)** — the reproduction orchestrator picks fusing pairs + supplies the
  seed/emitter/newId; the kernel applies state transitions; real-PG `agenome.fused` integration test rides P3.

## How to invoke
1. **Read this brief end-to-end** — it's the heaviest reproduction slice (gateway + marker + replay split +
   rule-#5 isolation); 7 Step-2.5 questions (Q2 crossover mechanism + Q3 synthesis isolation are the
   load-bearing ones; Q7 is the split escape hatch).
2. **Run `/tdd two_level_fusion_with_distant_lineage_preference`**.
3. **Step 0/1** — confirm against Feature + Files.
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + votes Q1–Q7. If you want the pre-split (Q7), say so. Wait for
   `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; hold the §8 fusion note for me to route.
