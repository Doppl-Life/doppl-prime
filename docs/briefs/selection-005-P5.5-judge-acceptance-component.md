# /tdd brief — held_out_judge_acceptance_fitness_component (P5.5 — judge half; COMPLETES P5.5)

## Feature
The **held-out-judge acceptance** fitness-component input for the selection track: a pure
`judgeAcceptance(judgeResult, rubric, deps?)` that **reads** the persisted `JudgeResult.acceptance`
(never recomputes it — rule #6), validates it against the **immutable held-out rubric** at the load
boundary (the **full 5-axis set** + `immutableToAgents:true` + a `rubricPolicyVersion` match — the
completeness the contract can't enforce, lesson §17), and produces the distinct named
`judge_acceptance` fitness component, with a defined **absence** boundary (a candidate with no judge
result is **not accepted by default**). Selection **never invokes or mutates** the judge/rubric — the
held-out judge is **immutable to selection** (safety rule #6, the bedrock anti-reward-hacking anchor).

> **This COMPLETES P5.5** (the critic half shipped in `df8b899`). On landing, **P5.5 is tickable** at
> close-out (both halves done).

## Use case + traceability
- **Task ID:** P5.5
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (held-out judge applies the fixed 5-axis
  rubric outside the breeding loop; immutable to agents), `§8` (decomposed fitness — held-out-judge
  acceptance as a distinct named component, separate from rotating critic scores; explainability), `§14`
  (rule #6 immutability).
- **Related context:**
  - **Unblocked by the Option-A amendment** (merged into this worktree at `19e0833`): frozen `JudgeResult`
    (`{id, candidateId, axisScores(enum-keyed exhaustive over the 5 FinalJudgeAxis), acceptance, rubricPolicyVersion, providerMeta, langfuseTraceId?}`),
    `judge.reviewed` terminal event (→ `JudgeResult` in the payload-map), `CURRENT_SCHEMA_VERSION=3`.
    `validJudgeResult` + `CANONICAL_FIXTURES` entry available.
  - **The carry-forward this folds in** (held-out-judge LOAD path): `FinalJudgeRubric.axes` is
    `z.array(FinalJudgeAxis)` — **shape only**; a rubric carrying just `[grounding]` still PARSES. So the
    **full-5-axis-set completeness + `immutableToAgents:true` assertion before scoring is a real load-path
    check the contract does NOT enforce** (lesson §6/§17). This slice performs it on the selection side.
  - Mirrors the prior component slices (energy-efficiency P5.4, critic-scores P5.5-critic): a pure
    read-only `{value, explanation, …}` that **P5.6** composes into `FitnessScore.components` under the
    `judge_acceptance` key (the fitness↔judge link is `candidateId` join + that component — NOT a duplicate
    authoritative copy, exactly like the fitness↔novelty link; `FitnessScore` is unchanged).
  - Carry-forward: treat `candidateId` as **opaque untrusted bytes**.

## Acceptance criteria (what "done" means)
- [ ] `judgeAcceptance(judgeResult: JudgeResult | undefined, rubric: FinalJudgeRubric, deps?)` is **pure**
      (no IO, no gateway/judge invocation, no clock/RNG).
- [ ] **Reads, never recomputes (rule #6):** the component value is exactly `JudgeResult.acceptance` —
      NOT derived/re-aggregated from `axisScores` (a `JudgeResult` whose `acceptance` ≠ any function of its
      `axisScores` still yields `acceptance` verbatim).
- [ ] **Held-out-rubric load validation (the carry-forward, fail-CLOSED):** before producing a value the
      function asserts the injected `rubric` carries the **FULL 5-axis set** (`rubric.axes` ⊇ all 5
      `FinalJudgeAxis`) AND `rubric.immutableToAgents === true`; a rubric missing an axis (or not
      immutable) **fails closed** (throws — a misconfigured immutable anchor is a fail-fast safety error,
      never a silent score).
- [ ] **PolicyVersion binding (rule #6):** `JudgeResult.rubricPolicyVersion` must equal
      `rubric.policyVersion`; a mismatch (a result produced under a different/superseded rubric) does NOT
      yield an acceptance — it is treated as a defined **invalid/absent** boundary, never silently accepted.
- [ ] **Distinct named component:** the value is surfaced under the `judge_acceptance` component key,
      separate from the rotating critic-council scores (`§8`).
- [ ] **Absence boundary — not accepted by default:** `judgeResult === undefined` → a defined result
      `{ present:false, value:<neutral=0>, explanation }` flagging absence; the candidate is **not** scored
      as accepted (no fabricated high acceptance). P5.6 keys off `present:false` (mirrors critic
      `contributingReviewCount===0`).
- [ ] **Immutable to selection (rule #6):** `judgeAcceptance` never mutates the input `judgeResult` or
      `rubric`, and exposes no path to invoke/alter the judge or its rubric.
- [ ] **Replay-faithful (rule #7):** the value is reproduced deterministically from the persisted
      `JudgeResult` with **no provider/judge call** (pure function — there is nothing to re-invoke).
- [ ] `explanation` enumerates the per-axis scores + the `acceptance` + the `rubricPolicyVersion` so the
      decision is explainable from persisted events (`§8`).
- [ ] All unit tests in `apps/api/test/unit/selection/components/judge-acceptance.test.ts` pass; full
      `apps/api` unit suite green (no regressions).
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — consumer + source wiring lands in P5.6 / runtime.** `judgeAcceptance` is a pure component
exported from the selection barrel. **First consumer (named) = P5.6** (the fitness scorer), which reads
the persisted `JudgeResult` for a candidate from the **`judge.reviewed`** event (via the merged
event-store replay-reader `apps/api/src/event-store/replay-reader.ts`) and supplies it + the **immutable
rubric** here, then places `judgeAcceptance(...).value` into `FitnessScore.components.judge_acceptance`.
**The rubric is INJECTED** — loaded from immutable config (never an agent-writable path — rule #6/§14) by
the boot/runtime composition root (the same immutable-config load the verifier P4.3/P4.8 rubric path
uses; not in this worktree yet — a named deferral, like the P5.2 emitter / P5.8 RNG-seed seams). Selection
**validates** the injected rubric (full-axis + immutable + version) but does not own the load mechanism.
Reachable now via the unit suite (`CANONICAL_FIXTURES.validJudgeResult` + a full-5-axis rubric fixture).

## Files expected to touch
**New:**
- `apps/api/src/selection/components/judge-acceptance.ts` — `judgeAcceptance(judgeResult, rubric, deps?)`
  → `{ present, value, explanation, policyVersion }` + `JudgeAcceptanceResult` type. Pure.
- `apps/api/test/unit/selection/components/judge-acceptance.test.ts`

**Modified:**
- `apps/api/src/selection/index.ts` — export `judgeAcceptance` + `JudgeAcceptanceResult`.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `apps/api/test/unit/selection/components/judge-acceptance.test.ts`:

1. **`judge_value_is_persisted_acceptance`** — value === `JudgeResult.acceptance` for `validJudgeResult` +
   a full-5-axis immutable rubric. Why: §8 component.
2. **`judge_value_never_recomputed_from_axisScores`** — a `JudgeResult` whose `acceptance` is deliberately
   inconsistent with `axisScores` still yields `acceptance` verbatim. Why: **rule #6** (read, never
   recompute the anchor).
3. **`judge_component_key_is_judge_acceptance`** — the component is surfaced under `judge_acceptance`,
   distinct from critic scores. Why: §8 decomposed/distinct component.
4. **`judge_rubric_missing_axis_fails_closed`** — a rubric with `axes:[grounding]` (parses, but incomplete)
   → throws / fails closed; no value produced. Why: **carry-forward / lesson §17** — full-axis-set is a
   load rule the contract can't enforce.
5. **`judge_rubric_full_5_axis_accepted`** — a rubric with all 5 `FinalJudgeAxis` + `immutableToAgents:true`
   → validates, value produced. Why: positive guard (lesson §10 — all-negative tests need a positive).
6. **`judge_immutableToAgents_asserted_at_load`** — the load validation checks `immutableToAgents===true`
   (the contract makes `false` unrepresentable; this pins the load-path guard exists). Why: rule #6 defense-in-depth.
7. **`judge_policyVersion_mismatch_not_accepted`** — `JudgeResult.rubricPolicyVersion` ≠ `rubric.policyVersion`
   → defined invalid/absent boundary, NOT an acceptance. Why: **rule #6** — a result from a different/
   superseded rubric can't move fitness.
8. **`judge_absence_not_accepted_by_default`** — `judgeResult === undefined` → `{present:false, value:0, …}`
   flagging absence; not a fabricated high acceptance. Why: §8 boundary (not accepted by default).
9. **`judge_does_not_mutate_inputs`** — `judgeResult` + `rubric` deep-equal a pre-call snapshot. Why: rule
   #6 (judge/rubric immutable to selection).
10. **`judge_replay_faithful_no_invocation`** — value reproduced deterministically from the persisted
    `JudgeResult`; no gateway/judge call on any path (pure). Why: **rule #7**.
11. **`judge_explanation_enumerates_axes_and_policyVersion`** — explanation includes per-axis scores +
    acceptance + `rubricPolicyVersion` (inclusion-based). Why: §8 explainability.
12. **`judge_result_validates_against_JudgeResult`** — binds `CANONICAL_FIXTURES.validJudgeResult`; parses
    via the frozen `JudgeResult`. Why: §2.5 frozen-seam conformance.
13. **`judge_acceptance_deterministic`** — same `(judgeResult, rubric)` → identical output. Why: replay-faithful.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes the now-frozen `JudgeResult` (P0.16), `FinalJudgeRubric`
  (P0.15), `FinalJudgeAxis`. Does NOT touch `FitnessScore` (P5.6 composes the component; the fitness↔judge
  link is `candidateId` + `components.judge_acceptance`, no field change).
- **Orchestrator doc rows to write hot (Step 9 routing):**
  - §8/§7 arch-note — pin the **held-out-judge-load selection-side validation** (full-5-axis +
    `immutableToAgents:true` + `policyVersion` match before scoring; absence ⇒ not-accepted) so P5.6 + the
    verifier seam depend on a defined contract. (Mine to route → integration.)
  - **Carry-forward DELETE** — the held-out-judge-LOAD carry-forward item is **consumed** by this slice on
    the selection side (P5.5); note the verifier P4.8 still owns the rubric-load-for-application echo. (Mine.)
- **§2.5-seam model touched?** No shape change — consume-only; `JudgeResult`/`FinalJudgeRubric` field-set
  snapshots already exist in `packages/contracts`. No new schema-snapshot; conformance pinned by test 12.

## Things to flag at Step 2.5
1. **Rubric: injected vs selection-loaded (the load-path division).** Default vote: **rubric is INJECTED**
   (the boot/runtime loads it from immutable config — never an agent-writable path, rule #6/§14 — and
   passes it in); `judgeAcceptance` **validates** it (full-axis + immutable + version) but does not own the
   file/config load. Rationale: the rubric-config loader is verifier P4.3 territory (not in this worktree);
   selection loading it directly would duplicate it + build against absent code. The "load from immutable
   config" mechanism is the named Step-7.5 deferral. Push back if you think selection should own the loader.
2. **Value source.** Default vote: **value = `JudgeResult.acceptance` verbatim** (read, never recomputed
   from `axisScores` — rule #6; recomputing would let selection re-derive the anchor's metric). Confirm.
3. **Absence + policyVersion-mismatch boundary.** Default vote: **absence → `{present:false, value:0}`**
   (0 = "no acceptance evidence," not a midpoint that reads as partial acceptance); **policyVersion
   mismatch → same not-accepted boundary with a distinct reason** (the result doesn't belong to the current
   immutable rubric). P5.6 keys off `present:false`. Alternative: throw on mismatch. I lean present:false +
   reason (a stale/foreign result is a data condition, shouldn't crash the whole scoring pass); push back
   if you want mismatch to fail-fast/throw.
4. **Rubric-invalid failure mode.** Default vote: **THROW** on a structurally-incomplete/non-immutable
   rubric (missing axis / not `immutableToAgents`) — a misconfigured *immutable anchor* is a fail-fast
   programmer/boot error (like `validateRunConfig`), distinct from the per-candidate data boundaries in Q3.
   Confirm the throw-vs-result split (rubric-invalid = throw; result absent/mismatched = present:false).
5. **Input shape + persisted-event read.** Default vote: **pure `judgeAcceptance(judgeResult | undefined,
   rubric)`**; reading the `JudgeResult` from the persisted `judge.reviewed` event (via the merged
   replay-reader) is the **caller's** (P5.6/runtime) job — keeps the component pure + matches the
   deferral pattern. Confirm.
6. **Component key string.** Default vote: **`'judge_acceptance'`** (matches the `JudgeResult` contract
   note's `FitnessScore.components.judge_acceptance`). Confirm so P5.6 + any consumer agree on the key.

## Dependencies + sequencing
- **Depends on:** P0.16 (`JudgeResult` + `judge.reviewed` ✓ merged `19e0833`), P0.15 (`FinalJudgeRubric`/
  `FinalJudgeAxis` ✓), P5.1 ✓ via P0. (Independent of P5.6.)
- **Blocks:** P5.6 (the fitness scorer composes `judgeAcceptance.value` into `FitnessScore.components`).
- **Completes:** **P5.5** (critic half `df8b899` + this judge half) → tick P5.5 at close-out.

## Estimated commit count
**1 — SOLO (safety carve-out).** This slice **enforces** the held-out-judge-load validation (full-5-axis +
`immutableToAgents:true` + policyVersion-match before scoring) — the rule-#6 bedrock anti-reward-hacking
anchor's selection-side gate. Per root `CLAUDE.md` TDD posture + the bundle directive's hard carve-out,
**safety-invariant slices are NEVER bundled** — so this does not ride with P5.6. (It also completes P5.5;
keeping it atomic gives P5.5 a clean two-commit closure: critic `df8b899` + judge.)

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §7/§8: the selection-side held-out-judge-load validation
  (full-axis-set completeness — the part `z.array(FinalJudgeAxis)` can't pin, lesson §17 — + immutable +
  policyVersion-match + absence⇒not-accepted), so P5.6 + the verifier seam depend on a defined contract.
- **Convention candidate** — consume-an-immutable-anchor: read the persisted measurement (`acceptance`)
  verbatim (never recompute), validate the anchor's completeness at the load boundary (the contract pins
  shape, the load path pins set-completeness + version-binding), fail CLOSED on an incomplete/foreign
  anchor, and treat absence as not-accepted-by-default (never a fabricated pass).
- **Future TODO (P5.6 / runtime)** — read the `JudgeResult` from the `judge.reviewed` event (replay-reader)
  + inject the immutable-config-loaded rubric at the composition root.

## How to invoke
1. **Read this brief end-to-end** — note this **completes P5.5** (judge half) and is a **safety-invariant
   SOLO** slice (rule #6); 6 Step-2.5 questions.
2. **Run `/tdd held_out_judge_acceptance_fitness_component`**.
3. **Step 0/1** — confirm against Feature + Files.
4. **Step 2.5** — send the test-design write-up (one `Asserts: <invariant> (§anchor)` line per test +
   coverage map per acceptance bullet) + votes Q1–Q6. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask. Flag that this **completes P5.5** (I tick P5.5 at close-out)
   and that the held-out-judge-LOAD carry-forward is consumed (selection side); hold the §7/§8 note for me.
