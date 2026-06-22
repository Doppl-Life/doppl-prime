# /tdd brief — policy_versioned_decomposed_fitness_scorer (P5.6)

## Feature
The **policy-versioned, decomposed fitness scorer** — the selection track's scoring capstone. A pure
`applyScoringPolicy(componentValues, policy)` (weighted sum + optional normalization → `{total,
contributions}`) plus `scoreFitness(input, policy, deps)` that assembles the five decomposed component
signals (**novelty**, **energy-efficiency**, **critic-scores**, **subtype-check**, **held-out-judge
acceptance**) into a single frozen `FitnessScore` — `total` a **pure deterministic** function of
`components` + the active `ScoringPolicy` weights (recomputable from persisted events, no model calls —
rule #7), bound to `policyVersion = policy.version` (rule #6), with an `explanation` enumerating every
component's raw value · weight · weighted contribution — and emits **one** `fitness.scored` per
candidate. Novelty is **referenced** via `components.novelty` (the fitness↔novelty link is `candidateId`
+ that component, NOT a duplicate authoritative copy — `novelty.scored` stays the authoritative home).

## Use case + traceability
- **Task ID:** P5.6
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (policy-versioned decomposed FitnessScore
  = critic + subtype-check + novelty + energy-efficiency + held-out-judge acceptance, weighted by
  ScoringPolicy; total reconstructable from components + policyVersion; every decision explainable from
  persisted events; fitness references the novelty it consumed).
- **Related context — all five component inputs are now BUILT (this slice composes them):**
  - `scoreNovelty → ScoreNoveltyResult` (`{degraded:false, noveltyScore:NoveltyScore}` | `{degraded:true, estimatedScore, method, reason}`) — P5.2/P5.3.
  - `energyEfficiency(EnergyEvent[]) → {value, explanation}` — P5.4.
  - `criticScores(CriticReview[]) → {value, reviewCount, contributingReviewCount, explanation}` — P5.5-critic.
  - `judgeAcceptance(JudgeResult|undefined, rubric) → {present, value, explanation, policyVersion}` + `JUDGE_ACCEPTANCE_KEY='judge_acceptance'` — P5.5-judge.
  - **subtype-check is P5.6's OWN read** of `CheckResult[]` (frozen `CheckResult`: status `passed`/`failed`/`skipped`, optional `score`).
  - Frozen contracts: `ScoringPolicy {version, weights(open name→number record), normalization?}`,
    `FitnessScore {id, candidateId, total, components(open name→number record), policyVersion, explanation}`
    (strict 6-field — **unchanged**; the judge link is `components.judge_acceptance`, the novelty link is
    `components.novelty`, neither a new field). `fitness.scored → FitnessScore` in `HIGH_TRAFFIC_PAYLOAD_MAP`.
  - Reuse the established **emitter seam** (P5.2 `NoveltyEmitter` pattern: envelope minus `sequence`/`occurredAt` = `EventStore.append`'s `AppendInput`) + the **injected `newId`** (LESSONS §24) + the **`present`/flag absence** convention (P5.5-critic `contributingReviewCount`, P5.5-judge `present`).
  - Carry-forward: treat `candidateId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `applyScoringPolicy(componentValues: Record<string,number>, policy: ScoringPolicy) → { total, contributions: Record<string,{value,weight,contribution}> }`
      is **pure**: `total = Σ policy.weights[k] · componentValues[k]` over the policy's weight keys
      (+ optional normalization per Q2). A component value with no matching policy weight is recorded in
      `contributions` (weight 0, contribution 0) for explainability but does not affect `total` (Q1).
- [ ] `scoreFitness(input, policy, deps) → Promise<FitnessScore>` assembles the five components into a
      `components` record under stable keys (`novelty`, `energy_efficiency`, `critic_scores`,
      `subtype_check`, `JUDGE_ACCEPTANCE_KEY`) and builds a `FitnessScore` that **parses against the
      frozen contract**.
- [ ] **policyVersion binding (rule #6):** `FitnessScore.policyVersion === policy.version` — the score is
      bound to the exact immutable policy that produced it.
- [ ] **total is pure + deterministic + replay-faithful (rule #7):** recomputed from `components` +
      `policy.weights` with **no gateway/model/embedding call** (assert deps gateway is never invoked —
      the scorer composes already-persisted component values, it does not re-derive them from providers).
- [ ] **novelty referenced, not re-stored:** `components.novelty` = the consumed novelty value
      (`noveltyScore.score` on the normal path; `estimatedScore` on the degraded path, **flagged
      estimated** in the explanation) — `novelty.scored` remains the authoritative novelty home; no
      duplicate NoveltyScore is persisted in the FitnessScore.
- [ ] **subtype-check derivation:** `components.subtype_check` derived from `CheckResult[]` per Q3
      (default: passed / (passed + failed) over non-skipped checks; skipped excluded; no non-skipped → a
      defined boundary value).
- [ ] **absence/degraded handling (Q4):** an absent/degraded component (judge `present:false`, critic
      `contributingReviewCount:0`, novelty degraded, subtype-check no-non-skipped) contributes its
      **defined value** (default 0 for absent — never inflating fitness) and is **flagged** in the
      explanation (estimated/absent), never silently treated as a real high score.
- [ ] **explanation** enumerates every component: raw value, weight, weighted contribution, and any
      estimated/absent flag — so the total is explainable from persisted events alone (§8).
- [ ] **emits exactly one `fitness.scored`** per candidate via the injected emitter (`actor:'selection_controller'`,
      `schemaVersion=CURRENT_SCHEMA_VERSION`, run/gen/candidate ids), and the payload passes
      `validateEventPayload('fitness.scored', payload)` (binds the frozen `FitnessScore` seam).
- [ ] **idempotent under a policy version:** re-scoring the same inputs under the same `policy` yields an
      identical `total`/`components`/`explanation` (the "exactly one selected fitness score per policy
      version" dedup is the runtime/state's job, not the scorer's — the scorer is deterministic).
- [ ] All unit tests in `apps/api/test/unit/selection/fitness/{policy,score-fitness}.test.ts` pass; full
      `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — caller wiring lands in the P3 runtime generation `scoring` state.** `applyScoringPolicy` +
`scoreFitness` are exported from the selection barrel. **First consumer (named) = the runtime generation
`scoring` step (P3)**, which: reads the persisted per-candidate component events (`novelty.scored` /
`novelty_scoring_degraded`, `energy.spent`, `critic.reviewed`, `check.completed`, `judge.reviewed`) via
the merged replay-reader, loads the immutable `ScoringPolicy` (from immutable config — rule #6, same
deferral as the judge rubric), supplies the real `EventStore.append` as the emitter, and an integration
test against the real Postgres event store rides that wiring slice. **P5.7 (cull)** consumes the persisted
`fitness.scored`. Reachable now via the unit suite (component fixtures + injected fake emitter); the
emitter seam I/O === `AppendInput` (LESSONS §20).

## Files expected to touch
**New:**
- `apps/api/src/selection/fitness/policy.ts` — `applyScoringPolicy(componentValues, policy)` → `{total, contributions}` + component-key constants. Pure.
- `apps/api/src/selection/fitness/score-fitness.ts` — `scoreFitness(input, policy, deps)` → `FitnessScore` (assemble components → applyScoringPolicy → build+validate FitnessScore → emit fitness.scored); `FitnessEmitter` seam + deps (`emit`, `newId`); subtype-check derivation from `CheckResult[]`.
- `apps/api/test/unit/selection/fitness/policy.test.ts`
- `apps/api/test/unit/selection/fitness/score-fitness.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export `applyScoringPolicy`, `scoreFitness`, the component-key constants, and the new types.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `policy.test.ts` (applyScoringPolicy)
1. **`weighted_sum_basic`** — `total = Σ wᵢ·vᵢ` for known components+weights. Why: §8.
2. **`unweighted_component_zero_contribution`** — a component value with no policy weight → weight 0,
   contribution 0, total unaffected (Q1). Why: deferred-open weights (a component can exist before the
   policy weights it).
3. **`normalization_undefined_is_raw_weighted_sum`** — `normalization` undefined → raw sum. Why: §8 MVP.
4. **`normalization_unsupported_throws`** — a specified-but-unrecognized `normalization` → throws (Q2,
   fail-fast — a policy directive is never silently ignored). Why: rule #6 (policy is authoritative).
5. **`contributions_breakdown_per_component`** — returns `{value, weight, contribution}` per key. Why: §8 explainability.

### `score-fitness.test.ts`
6. **`fitness_score_validates_against_FitnessScore`** — `FitnessScore.parse(result)` ok; binds `CANONICAL_FIXTURES.validFitnessScore`. Why: §2.5 frozen-seam.
7. **`policyVersion_bound_to_policy_version`** — `result.policyVersion === policy.version`. Why: **rule #6**.
8. **`components_carries_all_five_signals`** — `components` has `novelty`, `energy_efficiency`, `critic_scores`, `subtype_check`, `judge_acceptance`. Why: §8 decomposed.
9. **`novelty_uses_scored_value`** — non-degraded → `components.novelty === noveltyScore.score`. Why: §8 references consumed novelty.
10. **`novelty_degraded_uses_estimate_flagged`** — degraded → `components.novelty === estimatedScore` + explanation flags estimated. Why: §8 + P5.3 estimated-not-zeroed.
11. **`judge_absent_contributes_zero_flagged`** — judge `present:false` → `components.judge_acceptance === 0`, flagged not-accepted. Why: rule #6 / §8 not-accepted-by-default.
12. **`critic_absent_contributes_zero_flagged`** — `contributingReviewCount:0` → `components.critic_scores === 0`, flagged. Why: §8 absence ≠ silent score.
13. **`subtype_check_pass_fraction`** — from `CheckResult[]`: `passed/(passed+failed)`, skipped excluded; no non-skipped → defined boundary (Q3). Why: §7/§8.
14. **`total_deterministic_no_gateway`** — same inputs+policy → same total; deps gateway never invoked (pure compose). Why: **rule #7** replay-faithful.
15. **`emits_one_fitness_scored_validated`** — exactly one `fitness.scored` via the emitter; `validateEventPayload('fitness.scored', payload).ok`; `actor:'selection_controller'`, `schemaVersion=CURRENT`. Why: §4 payload-map + §8.
16. **`explanation_enumerates_components`** — explanation includes each component value+weight+contribution (inclusion-based). Why: §8 explainability.
17. **`idempotent_under_same_policy_version`** — re-score same inputs+policy → identical total/components/explanation. Why: §3 one-score-per-policy-version (scorer-determinism half).
18. **`novelty_referenced_not_restored`** — no duplicate authoritative NoveltyScore in the FitnessScore; the link is `candidateId` + `components.novelty`. Why: §8 + LESSONS §13 (novelty.scored is the authoritative home).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `ScoringPolicy`, `FitnessScore`, `CheckResult`,
  `NoveltyScore`, `JudgeResult`, `EnergyEvent`, `CriticReview`. `FitnessScore` unchanged (links via
  `components`).
- **Orchestrator doc rows to write hot (Step 9 routing):** §8 arch-note — pin the **fitness composition**:
  the component-key set (`novelty`/`energy_efficiency`/`critic_scores`/`subtype_check`/`judge_acceptance`),
  the weighted-sum + Q2 normalization policy, the absence=0-flagged rule (Q4), and the subtype-check
  derivation (Q3) — so P5.7/P5.11 + the verifier seam depend on a defined composition. (Mine to route → integration.)
- **§2.5-seam model touched?** No shape change — consume-only; `FitnessScore`/`ScoringPolicy` snapshots
  exist. No new schema-snapshot; conformance pinned by tests 6 + 15.

## Things to flag at Step 2.5
1. **Weighted-sum + missing-weight semantics.** Default vote: `total = Σ policy.weights[k]·components[k]`
   over the policy's weight keys; a component present in `components` but absent from `weights` →
   contribution 0 (recorded for explainability, doesn't move total). A weight key with no matching
   component → contributes 0 (flagged). The policy drives which components count. Push back if you want
   every component to require a weight (stricter, but the policy weight VALUES are deferred-open).
2. **Normalization (the scope question).** Default vote: `normalization` undefined → raw weighted sum;
   any specified `normalization` value → **throw "unsupported normalization method"** for MVP (defer all
   named methods — no unreachable method branches now; same no-untested-branch discipline as P5.2's
   dropped dimension guard). Alternative: implement one method (e.g. normalized weighted average =
   `total / Σweights`) now. I lean **defer-all-throw** since no policy values exist yet; say so if you
   want the normalized-average method built now.
3. **Subtype-check component derivation.** Default vote: `passed / (passed + failed)` over non-skipped
   `CheckResult[]` (skipped excluded — a skipped check is "no signal," not a fail); no non-skipped checks
   → defined boundary value `0` flagged absent (Q4). Alternative: average of `CheckResult.score` where
   present. I lean pass-fraction (robust to missing scores); flag if you prefer score-average.
4. **Absent/degraded component contribution.** Default vote: an absent component (judge `present:false`,
   critic `contributingReviewCount:0`, subtype-check no-non-skipped) contributes **value 0** to the
   weighted sum (conservative — absence never inflates fitness) and is **flagged** in the explanation;
   novelty degraded contributes its **estimatedScore** (flagged estimated, not zeroed — per P5.3). Push
   back if you want absent components EXCLUDED from the sum (changes the total's meaning when a signal is
   missing) rather than zeroed.
5. **Emit seam + marker.** Default vote: inject a `FitnessEmitter` (I/O = envelope minus
   `sequence`/`occurredAt` = `AppendInput`, real impl = `EventStore.append` at P3); emit **only**
   `fitness.scored` (no operation-start marker from P5.6 — `judge.review_started` is the verifier's
   marker paired → `fitness.scored` per P4.8; `generation.scoring` is the kernel's gen-level marker).
   Confirm P5.6 emits no marker of its own.
6. **`FitnessScore.id` + idempotency.** Default vote: inject `newId()` for the id (byte-deterministic
   core, LESSONS §24); idempotency is over `total`/`components`/`explanation` (the computed content), not
   the id; the "exactly one selected per policy version" dedup is the runtime/state's job. Confirm.
7. **Component-key constants.** Default vote: export stable key constants (`NOVELTY_KEY='novelty'`,
   `ENERGY_EFFICIENCY_KEY='energy_efficiency'`, `CRITIC_SCORES_KEY='critic_scores'`,
   `SUBTYPE_CHECK_KEY='subtype_check'`, reuse `JUDGE_ACCEPTANCE_KEY`) so P5.7/P5.11 + the policy weights
   agree on the key names (no drift — the JUDGE_ACCEPTANCE_KEY precedent). Confirm.

## Dependencies + sequencing
- **Depends on:** P5.2/P5.3 (novelty), P5.4 (energy-efficiency), P5.5 (critic + judge), P0.8
  (`ScoringPolicy`/`FitnessScore` ✓), P0.7 (`CheckResult` ✓), P0.10 (`fitness.scored` payload-map ✓). All ✓.
- **Blocks:** P5.7 (cull + parent selection consumes the persisted `fitness.scored`), P5.11 (allocation =
  fitness × novelty × energy-efficiency).

## Estimated commit count
**1 — SOLO.** This is a large slice (composes five components + weighted-sum/normalization math + emits
the authoritative `fitness.scored` + applies the immutable `ScoringPolicy`, rule #6). Per the bundle
criteria it is NOT bundled — it's large on its own, emits an authoritative event, and is the
rule-#6-policy-application capstone (the bundle directive's safety/event carve-out). P5.7 follows as its
own slice (or bundles with P5.9/10/11 reproduction where safe — decided at authoring).

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §8: the fitness composition contract (component-key set,
  weighted-sum + normalization policy, absence=0-flagged, subtype-check pass-fraction) so P5.7/P5.11 +
  the verifier seam depend on a defined shape.
- **Convention candidate** — the decomposed-scorer compose pattern: gather already-persisted per-signal
  component values (never re-derive from providers — rule #7), weight by the immutable versioned policy
  (rule #6), flag absent/estimated components (never silent-score), emit one authoritative
  `fitness.scored`, keep `total` a pure function of components + policyVersion (replay-recomputable).
- **Future TODO (P3 runtime)** — the generation `scoring` step reads the per-candidate component events
  via the replay-reader, loads the immutable ScoringPolicy from immutable config, supplies the real
  `EventStore.append` emitter; the real-Postgres `fitness.scored` integration test rides that slice.

## How to invoke
1. **Read this brief end-to-end** — it's the **scoring capstone** (composes all five components); 7
   Step-2.5 questions (Q2 normalization scope + Q4 absence handling are the load-bearing ones).
2. **Run `/tdd policy_versioned_decomposed_fitness_scorer`**.
3. **Step 0/1** — confirm against Feature + Files.
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + votes Q1–Q7. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask; hold the §8 composition note for me to route.
