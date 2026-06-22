# /tdd brief — weak_lineage_cull_and_explainable_parent_selection (P5.7)

## Feature
Two coupled selection steps that turn scored candidates into the next generation's parent pool:
- **`cull`** — culls weak lineages from the persisted `FitnessScore`s and emits **one** `lineage.culled`
  carrying a `CullingEvent` (`targetIds` + `reason` + `scoreSnapshot` — the scores that justified the
  cull, so the decision is explainable from the event alone, §8).
- **`selectParents`** — selects eligible parents from the survivors (an agenome is eligible only once one
  of its candidates reached a `FitnessScore` — §3 `eligible_parent`), ranked by fitness with
  **deterministic, replay-faithful tie-breaks** (seeded RNG from the persisted per-run seed → the same
  parent set reconstructs on replay without re-sampling, rule #7). **Zero eligible parents → an empty
  parent set** that routes to the zero-survivors `generation.completed{survivors:0}` path (the kernel
  emits that lifecycle terminal — selection never fabricates parents).

## Use case + traceability
- **Task ID:** P5.7
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (weak-lineage culling + explainable
  parent selection; decisions explainable + replay-reconstructable from persisted events), `§3` (the
  agenome `eligible_parent` state — reached only after a candidate has a fitness score; the zero-survivors
  `generation.completed{survivors:0}` path).
- **Related context:**
  - Consumes the **persisted `fitness.scored`** (P5.6 `c767f88`) — `FitnessScore {candidateId, total, components, policyVersion, explanation}` — plus `NoveltyScore` where parent ranking references novelty. This slice composes already-persisted scores (no re-scoring, no provider calls — rule #7).
  - Frozen `CullingEvent {id, runId, generationId, targetIds[], reason, scoreSnapshot(record<string,number>)}` — the `lineage.culled` payload. **`lineage.culled` is NOT in `HIGH_TRAFFIC_PAYLOAD_MAP`** → the append path's `validateEventPayload` falls to the generic schema, so **P5.7 validates `CullingEvent.parse` explicitly before emit** (selection is the producer; don't rely on the generic fall-through).
  - Reuse **`createRng(seed)`** (P5.8 `apps/api/src/selection/reproduction/rng.ts`) for the deterministic tie-break — single-source RNG, replay re-derives from the persisted per-run seed (no separate persisted parent set needed).
  - Reuse the **emitter seam** (P5.2/P5.6 pattern — envelope minus `sequence`/`occurredAt` = `AppendInput`) + injected **`newId`** (LESSONS §24).
  - The agenome **state transitions** (→ `eligible_parent`/`culled`) + the **`generation.completed`/energy debit** are the **kernel's** (P3) — P5.7 produces the cull/parent **decisions** + emits `lineage.culled`; it reads eligibility, it does not drive the state machine or emit lifecycle terminals.
  - Carry-forward: treat `runId`/`agenomeId`/`candidateId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `cull(input, cullPolicy, deps) → { culledIds, cullingEvent }` selects the weak lineages per the
      cull criterion (Q1) from the persisted fitness, builds a `CullingEvent` that **parses** against the
      frozen contract (`targetIds` = the culled agenome/lineage ids, `reason`, `scoreSnapshot` = each
      target's justifying score), and emits **exactly one** `lineage.culled` (CullingEvent payload) via
      the injected emitter (`actor:'selection_controller'`, `schemaVersion=CURRENT`, run/gen ids).
- [ ] `cull` validates the `CullingEvent` explicitly (`CullingEvent.parse`) before emit — it does NOT
      rely on the append path's generic-payload fall-through (`lineage.culled` is not high-traffic).
- [ ] **Nothing culled → no event:** an empty cull set emits **no** `lineage.culled` (and the
      `CullingEvent.targetIds`-count ≥1 kernel rule is respected — never an empty-targets event).
- [ ] `selectParents(input, count, deps) → { parents, explanation }` selects from the **eligible**
      agenomes only — eligible = an agenome with ≥1 candidate that reached a `FitnessScore`, excluding
      `culled`/`spent`/`failed` agenomes (§3); never selects a culled/ineligible agenome.
- [ ] **Deterministic, replay-faithful tie-breaks (rule #7):** parents are ranked by fitness (Q3) with
      ties broken via `createRng(seed)` from the **persisted per-run seed** — the same `(inputs, seed)`
      reconstructs the identical parent set on replay **without re-sampling** (pin: two calls with the
      same seed → identical parents; the parent set is reproducible from persisted inputs + seed).
- [ ] **Zero eligible parents → empty parent set** (no fabricated parents); the result flags the
      zero-survivors condition so the caller (kernel) routes to `generation.completed{survivors:0}`.
      P5.7 does NOT emit `generation.completed` (kernel lifecycle terminal).
- [ ] **No work on culled/spent/failed agenomes:** `cull`/`selectParents` never score or select those
      states (the "no energy on culled/spent/failed" property — energy debit itself is the kernel's).
- [ ] Both functions are **pure over their inputs + the persisted seed** (no gateway/model/embedding call;
      no clock/`Math.random`) — deterministic + replay-reconstructable; neither mutates its inputs.
- [ ] `explanation` (parent selection) + `CullingEvent.scoreSnapshot`/`reason` (cull) make each decision
      reconstructable from persisted events alone (§8).
- [ ] All unit tests in `apps/api/test/unit/selection/{cull,parent-selection}.test.ts` pass; full
      `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — caller wiring lands in the P3 runtime generation loop.** `cull` + `selectParents` are exported
from the selection barrel. **First consumer (named) = the P3 runtime generation loop** (after the
`scoring` step): it reads the persisted `fitness.scored`/`novelty.scored` via the merged replay-reader,
supplies the persisted per-run seed + the real `EventStore.append` emitter, applies the agenome state
transitions (→ `eligible_parent`/`culled`) + emits `generation.completed{survivors:0}` on the
zero-survivors flag, and an integration test against the real Postgres store rides that slice. **P5.9/P5.10/P5.11**
(reproduction) consume `selectParents`' output. Reachable now via the unit suite (FitnessScore fixtures +
injected fake emitter + a fixed seed).

## Files expected to touch
**New:**
- `apps/api/src/selection/cull.ts` — `cull(input, cullPolicy, deps) → {culledIds, cullingEvent}` + emits `lineage.culled`; `CullPolicy` type. Pure compose + emit.
- `apps/api/src/selection/parent-selection.ts` — `selectParents(input, count, deps) → {parents, explanation, zeroSurvivors}`; deterministic tie-break via `createRng`. Pure.
- `apps/api/test/unit/selection/cull.test.ts`
- `apps/api/test/unit/selection/parent-selection.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export `cull`, `selectParents`, `CullPolicy`, and the result types.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `cull.test.ts`
1. **`cull_selects_weak_by_criterion`** — agenomes below the cull criterion (Q1) are in `culledIds`; survivors are not. Why: §8 weak-lineage culling.
2. **`cull_emits_one_lineage_culled_validated`** — exactly one `lineage.culled`; `CullingEvent.parse(payload)` ok; `actor:'selection_controller'`, schemaVersion CURRENT. Why: §8 + explicit-validate (not generic fall-through).
3. **`cull_event_scoreSnapshot_justifies`** — `scoreSnapshot` carries each culled target's justifying score + `reason` set. Why: §8 explainable-from-event.
4. **`cull_nothing_culled_no_event`** — empty cull set → no `lineage.culled` emitted (no empty-targets event). Why: CullingEvent targetIds ≥1 kernel rule.
5. **`cull_does_not_mutate_inputs`** — inputs deep-equal a pre-call snapshot. Why: purity.
6. **`cull_deterministic`** — same inputs+policy → same culledIds + event. Why: replay-faithful.

### `parent-selection.test.ts`
7. **`parents_only_eligible_agenomes`** — only agenomes with a scored candidate are selectable; culled/spent/failed excluded. Why: §3 eligible_parent.
8. **`parents_ranked_by_fitness`** — higher fitness selected before lower (Q3). Why: §8 selection pressure.
9. **`parents_tiebreak_deterministic_seeded`** — equal-fitness candidates tie-broken via `createRng(seed)`; same seed → identical parent set (rule #7 replay). Why: rule #7.
10. **`parents_replay_reconstructs_same_set`** — same `(inputs, seed)` twice → identical parents, no re-sampling beyond the seeded stream. Why: rule #7.
11. **`parents_zero_eligible_empty_set_flagged`** — no eligible agenomes → empty parents + `zeroSurvivors:true`; no fabricated parents; no `generation.completed` emitted here. Why: §3 zero-survivors path.
12. **`parents_count_respected`** — selects at most `count` parents. Why: bounded selection.
13. **`parents_no_select_culled`** — a culled agenome is never selected even if it had a fitness score. Why: §8 no work after cull.
14. **`parents_does_not_mutate_inputs`** — inputs unchanged. Why: purity.
15. **`parents_explanation_reconstructable`** — explanation enumerates the selected parents + their fitness + the tie-break basis. Why: §8 explainability.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `CullingEvent` (P0.15), `FitnessScore`/`NoveltyScore` (P0.8), `Agenome` status (P0.4).
- **Orchestrator doc rows to write hot (Step 9 routing):** §8/§3 arch-note — pin the **cull criterion** (Q1)
  + the **parent-selection ranking + deterministic seeded tie-break** + the **zero-survivors → empty-set
  (kernel emits generation.completed) division** so P5.9/P5.10/P5.11 + the kernel loop depend on a defined
  contract. (Mine to route → integration.)
- **§2.5-seam model touched?** No shape change — consume-only; `CullingEvent` snapshot exists. No new
  schema-snapshot; conformance pinned by test 2 (`CullingEvent.parse`).

## Things to flag at Step 2.5
1. **Cull criterion.** Default vote: an injected `CullPolicy` with a **fitness `total` threshold** (cull
   agenomes whose best candidate `total` < threshold) — simplest + most explainable (`scoreSnapshot`
   shows each score vs the threshold in `reason`). Alternatives: keep-top-fraction / keep-top-N
   (comparative). I lean threshold for MVP explainability; flag if you want survivor-fraction (more
   "selection-pressure"-shaped). Either way the criterion is in the injected policy, not hard-coded.
2. **Parent ranking key.** Default vote: rank by `FitnessScore.total` (the composed fitness already folds
   novelty/energy/critic/judge via P5.6) — do NOT re-multiply novelty×energy here (that's **P5.11
   allocation's** job). Keep P5.7 selection = "pick the fittest eligible," allocation = P5.11. Confirm.
3. **Tie-break mechanism.** Default vote: equal-`total` ties broken by a **`createRng(seed)` deterministic
   shuffle** (the persisted per-run seed); replay re-derives the same order (no separate persisted parent
   set). Reuses P5.8's `createRng`. Alternative: persist the concrete parent set as an outcome. I lean
   seeded-deterministic (lighter, single-source RNG); confirm.
4. **Zero-survivors division of labor.** Default vote: `selectParents` **returns** `{parents:[], zeroSurvivors:true}`;
   the **kernel** emits `generation.completed{survivors:0}` (lifecycle terminal) + applies the
   no-offspring path. P5.7 does NOT emit generation.completed (not selection's event). Confirm the
   selection-signals / kernel-emits split.
5. **`lineage.culled` batch vs per-target.** Default vote: **one `lineage.culled` per cull operation**
   carrying all culled ids in `CullingEvent.targetIds[]` (the contract is array-shaped for exactly this)
   — not one event per culled agenome. Confirm batch.
6. **Best-so-far / run-completion grounding.** The plan notes "best-so-far selection that classifies a run
   completed is grounded in a candidate having reached `selected`." Default vote: **out of P5.7 scope** —
   run-terminal classification is the kernel's P3.11; P5.7 only provides cull + parent selection. Flag if
   you read it as in-scope here (I don't — it's a runtime lifecycle rule).

## Dependencies + sequencing
- **Depends on:** P5.6 (`fitness.scored`/`FitnessScore` ✓ `c767f88`), P0.8 (`FitnessScore`/`NoveltyScore` ✓),
  P0.15 (`CullingEvent` ✓), P0.4 (`Agenome` status ✓), P5.8 (`createRng` ✓).
- **Blocks:** P5.9/P5.10/P5.11 (reproduction consumes the selected parents); the zero-survivors flag feeds
  the kernel generation loop.

## Estimated commit count
**1 — SOLO.** Emits the authoritative `lineage.culled` + carries the rule-#7 replay-faithful parent
tie-break — event-emitting + safety-relevant, so not bundled (the bundle directive's carve-out). `cull` +
`parent-selection` are the plan's single P5.7 task (two tightly-coupled files: cull → survivors →
select), authored as one slice. Reproduction (P5.9/P5.10/P5.11) is the next, separate slice.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §8/§3: the cull criterion + parent-selection ranking/seeded
  tie-break + the zero-survivors selection-signals/kernel-emits division, so reproduction + the kernel
  loop depend on a defined contract.
- **Convention candidate** — selection-decides / kernel-emits-lifecycle: the selection track produces
  cull + parent decisions and emits its own domain event (`lineage.culled`), but lifecycle terminals
  (`generation.completed`) + state transitions + energy debit are the kernel's — selection returns a flag,
  the kernel emits the terminal (the seam established here).
- **Future TODO (P3 runtime)** — the generation loop supplies the persisted seed + real emitter, applies
  the agenome state transitions, and emits `generation.completed{survivors:0}` on the zero-survivors flag.

## How to invoke
1. **Read this brief end-to-end** — note the selection-decides / kernel-emits-lifecycle split (Q4) + the
   rule-#7 seeded tie-break; 6 Step-2.5 questions.
2. **Run `/tdd weak_lineage_cull_and_explainable_parent_selection`**.
3. **Step 0/1** — confirm against Feature + Files.
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + votes Q1–Q6. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; hold the §8/§3 note for me to route.
