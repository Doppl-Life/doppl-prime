# /tdd brief — novelty_degrade_path_and_energy_efficiency_component (P5.3 + P5.4 bundle)

## Feature
Two dep-compatible selection fitness-component inputs in one red→green→commit unit:
- **P5.3 — Novelty degrade path:** when embedding fails, fall back to a **deterministic lexical**
  novelty method and emit `novelty_scoring_degraded` (at most once per candidate, carrying the reason +
  the estimated value) — **never blocking** the generation scoring state, **never silently zeroing**
  novelty, and **replay-faithful** (the lexical method is pure over persisted summaries).
- **P5.4 — Energy-efficiency component:** a pure function over the candidate's agenome's persisted
  `energy.spent` events producing the **success-only** energy-efficiency component value + explanation
  for the FitnessScore (consumed by P5.6).

## Use case + traceability
- **Task ID:** P5.3, P5.4
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (novelty degrade per §5; decomposed
  fitness components incl. energy efficiency; explainability), `§5` (degrade path / never-block),
  `§4/§5` (EnergyEvent success-only, rule #8).
- **Related context:**
  - Builds on **P5.2** (`selection-001`, committed `4a690f2`): `embed` (sole gateway-touching fn,
    returns `{ok:false, reason}` on failure), `scoreNovelty` (emits the marker→scored pair via the
    `NoveltyEmitter` seam), `cosine.ts`, the `NoveltyComparison` input.
  - **Bundle rationale:** both are derived fitness-component inputs feeding **P5.6** (the scorer), same
    `selection/` area, independent of each other, neither enforces a safety invariant — bundled per the
    standing + re-emphasised human bundle-where-safe directive.
  - Frozen contracts consumed: `NoveltyScore`, `EnergyEvent` (`{…, estimate, actual, unit:'doppl_energy', reason, …}`
    — closed `eventType` `llm`/`tool`/`spawn`, **no failure member**), `FitnessScore.components` (open
    name→number record), `RunEventType` (`novelty_scoring_degraded` is a frozen failure-event member,
    generic payload — NOT high-traffic).
  - Carry-forward: treat `runId`/`candidateId`/`agenomeId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)

### P5.3 — Novelty degrade path
- [ ] When `embed` returns `{ok:false}`, `scoreNovelty` does NOT throw and does NOT block — it falls
      back to the deterministic lexical method and returns a **degraded result** (discriminated:
      `{degraded:false, noveltyScore}` | `{degraded:true, estimatedScore, method, reason}`).
- [ ] On the degraded path, exactly **one** `novelty_scoring_degraded` event is emitted (via the existing
      `NoveltyEmitter` seam, `actor:'selection_controller'`, generic payload) carrying the `reason`
      (embed failure reason / exhausted-retry context), the `estimatedScore`, the fallback `method`, and
      the `candidateId` — and **no** `novelty.scored` is emitted (the authoritative embedding vector is
      absent; see Q1).
- [ ] The lexical novelty value is the **estimated** novelty, **never a silent 0** — and is flagged
      estimated (the degraded event's `method` ≠ `cosine`; the value is explicitly the lexical estimate).
- [ ] The lexical method is **deterministic** (pure over the candidate summary + comparison summaries),
      so replay reproduces the identical degraded value **without any gateway call** (assert gateway
      `call` count 0 on the lexical/replay path).
- [ ] **Happy path unchanged** (regression guard): when `embed` succeeds, `scoreNovelty` emits the
      marker → `novelty.scored` pair exactly as P5.2, with **no** `novelty_scoring_degraded`.

### P5.4 — Energy-efficiency component
- [ ] `energyEfficiency(energyEvents)` is pure over the candidate's agenome's persisted `energy.spent`
      events (typed `EnergyEvent[]`) — **no live counters**, so it is replay-reconstructable.
- [ ] **Success-only (rule #8):** the denominator sums only `energy.spent` spend; failed/retried/repaired
      attempts (`provider_call_failed`) contribute **zero** — structurally guaranteed (the input is
      `EnergyEvent[]`, which has no failure member; the caller passes only `energy.spent`). Pin it with a
      test that non-`energy.spent` data is not summed.
- [ ] Uses the reconciled **`actual`** spend (the contract requires it); zero successful spend is a
      **defined boundary** (no divide-by-zero) per Q5.
- [ ] Returns `{value, explanation}` where `explanation` references the energy events consumed (count +
      total spend) so the component is explainable from persisted events (§8); the caller (P5.6) places
      `value` into `FitnessScore.components` under a named key.

### Both
- [ ] All unit tests in `apps/api/test/unit/selection/**` pass; full `apps/api` unit suite green (no
      regressions on the P5.2 suite).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
- **P5.3:** extends the already-exported `scoreNovelty` — the degrade path is reachable through it when
  `embed` fails; `novelty_scoring_degraded` rides the existing `NoveltyEmitter` seam. **Caller deferred to
  P3** (same as P5.2): the runtime generation `scoring` state supplies the real `EventStore.append`.
- **P5.4:** `energyEfficiency` is exported from the selection barrel; **first consumer = P5.6** (the
  policy-versioned fitness scorer, the next selection slice) which composes it into `FitnessScore.components`.
  No event emission of its own (P5.6 emits `fitness.scored`).
- Reachability now: the unit suite drives both via injected fakes (fake gateway for the degrade trigger,
  recording emitter for the degraded event, `EnergyEvent[]` fixtures for efficiency).

## Files expected to touch
**New:**
- `apps/api/src/selection/novelty/lexical-fallback.ts` — deterministic lexical novelty (Q2: token-set
  Jaccard; `1 − max Jaccard`, empty set → 1.0). Pure.
- `apps/api/src/selection/components/energy-efficiency.ts` — `energyEfficiency(energyEvents)` → `{value, explanation}`. Pure.
- `apps/api/test/unit/selection/novelty/lexical-fallback.test.ts`
- `apps/api/test/unit/selection/components/energy-efficiency.test.ts`

**Modified:**
- `apps/api/src/selection/novelty/score-novelty.ts` — replace the transitional embed-failure throw with
  the degrade path (lexical fallback + `novelty_scoring_degraded` emit); change the return type to the
  discriminated degraded result; extend `NoveltyComparison` with `summary` (Q4).
- `apps/api/src/selection/novelty/score-novelty.test.ts` — degrade-path tests + happy-path regression guard.
- `apps/api/src/selection/index.ts` — export `energyEfficiency` (+ the lexical fn if public) and the new
  return/result types.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `lexical-fallback.test.ts`
1. **`lexical_identical_summaries_is_0_novelty`** — identical token sets → Jaccard 1 → novelty 0. Why: §8 lexical secondary method.
2. **`lexical_disjoint_summaries_is_1_novelty`** — disjoint token sets → Jaccard 0 → novelty 1. Why: §8.
3. **`lexical_empty_comparison_is_1`** — empty comparison → 1.0. Why: first-candidate boundary (mirrors cosine).
4. **`lexical_deterministic_order_independent`** — same inputs (any comparison order) → identical value. Why: rule #7 replay-faithful.

### `score-novelty.test.ts` (extension)
5. **`degrade_on_embed_failure_returns_degraded_no_throw`** — `embed` `{ok:false}` → `{degraded:true,…}` returned, no throw, scoring not blocked. Why: §5 never-block.
6. **`degrade_emits_one_degraded_no_scored`** — exactly one `novelty_scoring_degraded`, zero `novelty.scored`. Why: P5.3 at-most-once + Q1.
7. **`degrade_event_carries_reason_method_estimate`** — degraded payload has `reason` (exhausted/embed reason), `method`≠'cosine', `estimatedScore`, `candidateId`. Why: §8 explainable + flagged-estimated.
8. **`degrade_estimate_not_silently_zeroed`** — `estimatedScore` equals the lexical value (≠0 for a novel candidate). Why: P5.3 "estimated/absent, not zeroed."
9. **`degrade_replay_deterministic_zero_gateway_after_failure`** — lexical recompute from persisted summaries reproduces the value with gateway `call` count 0 on the lexical path. Why: rule #7.
10. **`happy_path_unchanged_no_degraded`** — `embed` ok → marker→`novelty.scored`, no `novelty_scoring_degraded`. Why: regression guard.

### `energy-efficiency.test.ts`
11. **`efficiency_sums_actual_spend`** — value derives from summed `actual` over the events. Why: §4/§5.
12. **`efficiency_zero_spend_defined_boundary`** — totalSpend 0 → the defined value (Q5), no `NaN`/divide-by-zero. Why: P5.4 boundary.
13. **`efficiency_formula`** — value == the pinned formula (Q5) for a known total. Why: §8 decomposed component.
14. **`efficiency_success_only`** — only `energy.spent` contribute; a `provider_call_failed`-shaped record is not summed. Why: **rule #8**.
15. **`efficiency_explanation_references_events`** — explanation includes the event count + total spend. Why: §8 explainability.
16. **`efficiency_deterministic`** — same persisted events → same value (replay-reconstructable). Why: §8/§9.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `NoveltyScore`, `EnergyEvent`, `FitnessScore`,
  `RunEventType` (`novelty_scoring_degraded`).
- **Orchestrator doc rows to write hot (Step 9 routing):**
  - **§8 arch-note** — pin the **energy-efficiency formula** (Q5) like the novelty formula, so P5.6 +
    downstream depend on a defined value. (Mine to route → integration.)
  - **Plan/arch note (Q1 divergence)** — if we adopt the default (no `NoveltyScore` on the degraded path;
    the estimate rides `novelty_scoring_degraded`), that **diverges from the P5.3 plan bullet**
    "the NoveltyScore.method records the fallback method used." Flag it so I reconcile the plan/§8 text
    (the frozen `NoveltyScore.vector`+`dimension>0` cannot represent a vectorless lexical estimate). (Mine.)
- **§2.5-seam model touched?** No shape change — consume-only. No new schema-snapshot required;
  seam-conformance for the happy path is already pinned by P5.2's `validateEventPayload` test.

## Things to flag at Step 2.5
1. **Degraded-path representation (the load-bearing one).** Default vote: **A — emit only
   `novelty_scoring_degraded` carrying the estimated lexical score; do NOT build/emit a `NoveltyScore` on
   the degraded path**, because the frozen `NoveltyScore` requires `vector` + `dimension>0` and the
   lexical path has no embedding vector — a fake/degenerate vector would corrupt the authoritative novelty
   home. Alternative B: make the lexical method emit a deterministic fixed-dim lexical vector so a
   `NoveltyScore{method:'lexical'}` is still built (more faithful to the plan bullet, more code). I lean
   **A** — cleaner, no contract hack; P5.6 reads the estimate off the degraded event and flags it. (This
   is the Q1 divergence above — a Step-9 plan/§8 note.)
2. **Lexical method.** Default vote: **token-set Jaccard** (`1 − max Jaccard` over summaries, empty → 1.0)
   — simplest deterministic secondary method, mirrors the cosine aggregation shape. Push back if you want
   a different secondary (e.g. char-ngram).
3. **Retry ownership.** Default vote: **selection does NOT reimplement retry** — the bounded retry/timeout
   is the gateway / kernel **P3.7** concern behind `embed` (deferred); selection's degrade path triggers
   on `embed`'s terminal `{ok:false}` and owns the lexical fallback + degraded emission. (Keeps P5.3 tight;
   the "retries within the bounded retry policy" plan phrasing is satisfied by the P3.7 wiring later.)
4. **Comparison summaries for the lexical path.** Default vote: **extend `NoveltyComparison` with
   `summary: string`** (vector for cosine, summary for lexical — both from persisted candidates), so the
   lexical fallback has comparison text without a second input channel.
5. **Energy-efficiency formula + zero-spend.** Default vote: **`value = 1 / (1 + totalActualSpend)`**,
   totalSpend 0 → **1.0** (no divide-by-zero). Note the perverse-incentive (do-nothing → max efficiency)
   is mitigated downstream — P5.6 combines efficiency with achievement (judge/critic), so a no-spend
   no-achievement candidate still scores low. If you prefer zero-spend → 0 or a neutral baseline, say so;
   this is a scoring decision I'll pin as the §8 arch-note.
6. **actual vs estimate.** Default vote: **use `actual`** (the contract requires it — reconciled spend);
   no estimate-fallback branch needed (don't ship an unreachable branch — same discipline as P5.2's
   dropped dimension guard). If you see a real pre-reconcile sentinel case, flag it.

## Dependencies + sequencing
- **Depends on:** P5.3 → P5.2 (`4a690f2`, extends `score-novelty`/`embed`). P5.4 → P0.9 (`EnergyEvent` ✓),
  P5.1 ✓ via P0. (P5.3 and P5.4 are independent of each other — bundled by area + shared downstream.)
- **Blocks:** **P5.6** (the policy-versioned fitness scorer consumes novelty incl. the degraded estimate +
  the energy-efficiency component); P5.4 also informs P5.11 allocation (fitness × novelty × energy-efficiency).

## Estimated commit count
**1 — bundled** per the explicit human bundle-where-safe directive (P5.3+P5.4 named). Honest assessment:
each feature is ~30 lines with its own Step-2.5 questions — this sits at the **upper edge** of the
bundling heuristic (the template would lean atomize at ≥30 lines each / multiple design questions). It is
bundled because the human directed it AND neither feature **enforces** a safety invariant (P5.3 = pure
deterministic fallback within the replay seam P5.2 already drew; P5.4 = read-only over the rule-#8-shaped
`energy.spent` stream). If the Step-2.5 surface proves unwieldy in one cycle, **flag it and I'll split**
into P5.3 then P5.4.

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §8: pin the energy-efficiency formula (Q5) and the degrade-path
  representation (Q1) so downstream scorers depend on defined values.
- **Convention candidate** — degrade-via-deterministic-secondary-method: on a provider-dependent value's
  failure, fall back to a pure deterministic estimate, emit a `*_degraded` marker carrying the estimate +
  reason, flag estimated (never silent-zero), keep replay-faithful.
- **Future TODO (P3)** — the bounded embed retry/timeout (P3.7) wires behind `embed`; selection's degrade
  triggers on the terminal failure.

## How to invoke
1. **Read this brief end-to-end** — note it is a **bundle** (P5.3 + P5.4); 6 Step-2.5 questions span both.
2. **Run `/tdd novelty_degrade_path_and_energy_efficiency_component`**.
3. **Step 0 (Restate)** — confirm both features.
4. **Step 1 (Identify files)** — confirm against "Files expected to touch."
5. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + your votes on Q1–Q6. If the bundle feels too large for one clean
   cycle, say so and I split. Wait for `APPROVED.` / `TWEAK:` / `ADD:`.
6. **Step 9** — categorized flags + ship-ask; hold the §8 arch-notes (formula + degrade representation)
   for me to route.
