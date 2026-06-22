# /tdd brief — judge_output_seam_reconcile

## Feature
Reconcile the P4.8 held-out-judge runner to the frozen **P0.16 judge-output seam** (cherry-picked into the
worktree, commit `0f6c2ac`): adopt the frozen `JudgeResult` contract (drop the local `JudgeAcceptance`
interface), and **emit `judge.reviewed`←`JudgeResult`** as the authoritative, replay-faithful acceptance
record — completing the `judge.review_started`→`judge.reviewed` pair. The judge LOGIC is unchanged; only the
OUTPUT/persist layer changes. **SOLO + safety-invariant (rule #6 held-out judge anchor + rule #7 `judge.reviewed`
is the replay home); security-reviewer mandatory.**

## Use case + traceability
- **Task ID:** P4.8 (judge-output seam reconciliation to the frozen contract)
- **Architecture sections it implements:** `ARCHITECTURE.md §7/§8` (the held-out judge produces the acceptance metric; `judge.reviewed`←`JudgeResult` is its authoritative home, mirroring `novelty.scored`←`NoveltyScore`), `§4` (`judge.reviewed` terminal event + payload-map narrowing; schemaVersion 3), `§14` (judge immutable anchor; candidate-as-DATA), `§9` (replay reads the persisted `JudgeResult`, never re-judges — rule #7).
- **Related context — the divergence being fixed:** the contract track froze P0.16 (`e664f68`, cherry-picked here as `0f6c2ac`) AFTER the verifier fork. P0.16 = `JudgeResult` (`packages/contracts/src/verifier/judge-result.ts`) + a terminal `judge.reviewed` event + payload-map narrowing + schemaVersion 2→3. **My P4.8 built the OPPOSITE on the stale base** (no `judge.reviewed`; a local `JudgeAcceptance` interface; acceptance "rides `fitness.scored`"). My PROVISIONAL note was made unaware the contract froze the opposite. This slice resolves it.
- **Frozen `JudgeResult` (P0.16, now in-worktree):** strict 7-field `{ id, candidateId, axisScores: z.record(FinalJudgeAxis, number) [EXHAUSTIVE 5-axis], acceptance: number, rubricPolicyVersion: string.min(1), providerMeta: ProviderMeta, langfuseTraceId?: string.min(1) }`. It is the judge's MEASUREMENT — NO rubric/weights/immutability-flag/override field (strict; it is never scoring authority). `acceptance` is the scalar selection consumes (surfaced as `FitnessScore.components.judge_acceptance` by candidateId join — NOT a duplicate authoritative copy).
- **Current `runJudge` (`apps/api/src/verifier/judge/judge-call.ts`):** all `JudgeResult` inputs are ALREADY in hand — `runContext` (id/candidateId), `axisScores` (computed, all 5), `acceptanceMetric` (runner-computed), `rubric.policyVersion`, and the gateway `response.providerMeta` + `response.langfuseTraceId` (line 138 already uses `response.providerMeta.gatewayRequestId`). So the mapping needs no new dependency.
- **Payload-map + fixture:** `judge.reviewed`←`JudgeResult` narrows on append (fail-closed); `validJudgeResult` is in `CANONICAL_FIXTURES` (use for the producer-agreement test, lesson 20).
- **Baseline post-cherry-pick (verified):** contracts 175 green; apps/api 138 unit green — the schemaVersion-3 pull did NOT disturb the other 8 slices (readers accept ≤current).

## Acceptance criteria (what "done" means)
- [ ] `runJudge` builds a frozen **`JudgeResult`** (replacing the local `JudgeAcceptance` interface — DELETE it): `id` (deterministic — see Q1), `candidateId` (runContext), `axisScores` (the exhaustive 5-axis record the runner already produces), `acceptance` (= the runner-computed `acceptanceMetric`), `rubricPolicyVersion` (= `rubric.policyVersion`), `providerMeta` (= `response.providerMeta`), `langfuseTraceId?` (= `response.langfuseTraceId`).
- [ ] On an accepted+validated judge output, `runJudge` **emits `judge.reviewed`** (payload = the validated `JudgeResult`) via `store.append` — completing the `judge.review_started`→`judge.reviewed` pair. The persisted payload `JudgeResult.safeParse`s (producer-agreement) and narrows via the payload-map on append (fail-closed).
- [ ] **The RUNNER still computes `acceptance`** (deterministic weighted sum over `rubric.axes`); the model supplies ONLY the per-axis `JudgeModelOutput` (unchanged) — it never supplies `id`/`acceptance`/identity (rule #6 reward-hacking; the strip-parse stays).
- [ ] The judge LOGIC is otherwise **unchanged** — rubric load via `loadJudgeRubric` (immutable source, the P4.3 [low] obligation), candidate-as-DATA isolation seam (`final_judge` role), gateway validate/repair≤1/reject, deterministic acceptance compute.
- [ ] **Replay (rule #7):** `judge.reviewed`←`JudgeResult` is the authoritative home; `axisScores` + `acceptance` are persisted, so replay reads the record and never re-judges. Pin: a persisted `judge.reviewed` re-parses to the identical `JudgeResult`.
- [ ] A rejected/un-repairable judge output still emits `output_schema_rejected` and yields **NO** `JudgeResult` + **NO** `judge.reviewed` (never a fabricated record) — unchanged.
- [ ] `runJudge` **returns** the `JudgeResult` (replacing the `JudgeAcceptance` return) for the caller; the `acceptance` scalar still feeds selection P5.5 via `FitnessScore.components.judge_acceptance` (the join, preserved — NOT a duplicate authoritative copy).
- [ ] The module **doc-comment is corrected** — the "There is NO `judge.reviewed` event … RETURNS the acceptance for selection to fold into `fitness.scored`" claim (lines ~18–22) is now WRONG; replace with the P0.16 reality (`judge.reviewed`←`JudgeResult` is the authoritative home; selection reads `acceptance` via the components join).
- [ ] Full suite green: the apps/api unit suite (138 + the new `judge.reviewed`/`JudgeResult` cases) and integration (37 + the new `judge.reviewed` persisted case) against real Postgres; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — first callers are selection P5.5 (reads the persisted `JudgeResult`/`acceptance`)
+ the P3 scoring phase.** `runJudge`'s signature is unchanged (gateway + store + candidate + runContext + rubricSource, injected). It now persists `judge.reviewed` via `store.append` (the existing port — no raw write, forbidden #4) in addition to the `judge.review_started` marker. Confirm at Step 7.5: the judge.reviewed emit goes through `store.append`; the rubric source stays the immutable const.

## Files expected to touch
**Modified:**
- `apps/api/src/verifier/judge/judge-call.ts` — adopt `JudgeResult` (import from `@doppl/contracts`); DELETE the local `JudgeAcceptance` interface; build + emit `judge.reviewed`←`JudgeResult`; map the in-hand fields; deterministic `id`; corrected doc-comment.
- `apps/api/test/unit/verifier/judge/judge-call.test.ts` — assert the `JudgeResult` shape + the model-can't-supply-id/acceptance strip + deterministic id; update the return-shape assertions.
- `apps/api/test/integration/verifier/judge/run-judge.test.ts` — assert `judge.review_started`→`judge.reviewed` pair persists; the `judge.reviewed` payload `JudgeResult.safeParse`s (+ via the payload-map narrowing) + equals the produced result; rejection emits `output_schema_rejected` + no `judge.reviewed`.

**New:** none.

> The frozen `JudgeResult` + `judge.reviewed` + `validJudgeResult` fixture are already in the worktree (cherry-pick `0f6c2ac`). No contract authoring here — ADOPT only.

## RED test outline
**Unit (`judge-call.test.ts`)** — update the existing P4.8 tests + add:
1. **`produces_valid_judge_result`** — Asserts: an accepted judge output → a `JudgeResult.safeParse`-valid result with the runner-set id/candidateId, the computed acceptance, all 5 axisScores, rubricPolicyVersion, providerMeta (positive guard first, lesson 10). Why: §7/§8 (the new output shape).
2. **`runner_computes_acceptance_model_cannot_supply_it`** — Asserts: a model output carrying `acceptance`/`id`/`score` → the result's `acceptance` is the runner's weighted sum + those keys don't leak (strip-parse). Why: §7/rule #6 (unchanged invariant, new shape).
3. **`judge_result_id_deterministic`** — Asserts: same (runContext) → same `JudgeResult.id` (no random/clock). Why: §4 replay-faithfulness.
4. **`rejected_output_no_judge_result`** — Asserts: a gateway reject → null, `output_schema_rejected`, NO `judge.reviewed`. Why: §7 (never fabricated).

**Integration (`run-judge.test.ts`)** — real PG:
5. **`review_started_then_reviewed_pair_persisted`** — Asserts: an accepted judge run emits `judge.review_started` (seq N) then `judge.reviewed` (seq N+1); the `judge.reviewed` payload `JudgeResult.safeParse`s + equals the produced result (+ narrows via the payload-map on append). Why: §4/§7/§8 producer-agreement (lesson 20).
6. **`judge_reviewed_is_replay_home`** — Asserts: the persisted `judge.reviewed` carries `axisScores` + `acceptance` (rule #7 — replay reads them, no re-judge). Why: §9/rule #7.
7. **`rejection_emits_rejected_no_reviewed`** — Asserts: a rejected judge run → `output_schema_rejected`, NO `judge.reviewed`. Why: §7.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none authored here** — CONSUMES the frozen P0.16 `JudgeResult` + `judge.reviewed` + payload-map (already in-worktree). `JudgeModelOutput` (the model's per-axis output, app-level) is UNCHANGED.
- **§2.5-seam model touched?** The slice now PRODUCES the frozen `JudgeResult` into `judge.reviewed` — the `JudgeResult.safeParse` on the persisted event (test 5) is the producer-agreement pin (lesson 20). No schema CHANGE (P0.16 froze it).
- **Orchestrator doc rows to write hot (Step 9 — flag, I write):**
  - **Correct LESSONS lesson 31** (committed `1ac1df2`): its "no dedicated completion event exists → RETURN for the owning track to persist" claim is now WRONG. I'll rewrite it to the P0.16 reality (`judge.reviewed`←`JudgeResult` IS the authoritative home, mirroring `novelty.scored`←`NoveltyScore`; the runner-computes-the-aggregate + model-supplies-only-axes invariant stays; `acceptance` ALSO surfaces in `FitnessScore.components` by join).
  - The `JudgeResult` `apps/api/CLAUDE.md` cross-doc row + the §4/§7 ARCHITECTURE rows are **P0.16's** (they land via the integration merge, not this worktree) — I do NOT add them here.

## Things to flag at Step 2.5
1. **`JudgeResult.id` strategy.** My default: deterministic `judge-result:{runId}:{candidateId}` (one judge call per candidate; replay-faithful; no random/clock) — sibling to the council's `critic-review:{runId}:{candidateId}:{mandate}`. Confirm.
2. **`judge.reviewed` actor.** My P4.8 emits `judge.review_started` under `selection_controller` (the 7-role union has no `judge` member). My default: **keep `selection_controller`** for `judge.reviewed` too (consistent pairing; P0.16 doesn't pin the actor). Confirm.
3. **Return value.** My default: `runJudge` RETURNS the `JudgeResult` (replacing the `JudgeAcceptance` return) — the caller gets the full record; the emit is the authoritative persist. (Returning `null` on rejection stays.) Confirm — or return `void` and let the caller read the persisted event? I prefer return-the-record (the caller often needs it inline, like the council returns its reviews).
4. **`acceptance` ↔ `FitnessScore.components` seam.** Confirm the preserved design: selection P5.5 reads `acceptance` from the persisted `JudgeResult` via the `candidateId` join + the `judge_acceptance` component — NOT a duplicate authoritative copy. (This was the RIGHT half of my original note; only the "no judge.reviewed" half was wrong.) No code here — just confirm the seam framing for the doc note.

## Dependencies + sequencing
- **Depends on:** the P0.16 cherry-pick `0f6c2ac` (in-worktree — `JudgeResult`/`judge.reviewed`/schemaVersion 3/payload-map/`validJudgeResult`); the existing P4.8 `runJudge` + P4.3 rubric-load + P4.4 seam (all landed). **No new external dep.**
- **Blocks:** selection P5.5 (consumes the persisted `JudgeResult`/`acceptance`); the final `track/verifier→cody` merge (this slice is the resolution cody's "sv3/P0.16 reconcile finding" expects).

## Estimated commit count
**1.** SOLO safety-invariant reconciliation (rule #6 held-out judge anchor + rule #7 `judge.reviewed` replay home) — never bundled. **security-reviewer mandatory** (confirm: the runner still computes acceptance / model can't supply it; rubric source still the immutable const; `judge.reviewed`←`JudgeResult` persisted via the port; no fabricated record on rejection).

## Lessons-logged candidates anticipated
- **Convention candidate / lesson 31 correction** — the primary doc outcome is CORRECTING lesson 31 (not a new lesson): a fork-divergence where the held-out judge's authoritative home is `judge.reviewed`←`JudgeResult` (the contract froze it after the fork), not a return-for-the-caller. Possibly a small NEW lesson on "fork-divergence reconcile: cherry-pick the isolated contract commit, adopt the frozen shape, re-emit the authoritative event" — flag at Step 9; I'll decide.
- **Architecture-doc note candidate** — none new from this worktree (P0.16's §4/§7 rows land via the integration merge).

## How to invoke
1. **Read this brief end-to-end** (session re-engaged for the reconciliation; P0.16 is in-worktree via the cherry-pick). No `/session-start` needed.
2. **Run `/tdd judge_output_seam_reconcile`.**
3. **Step 0/1** — confirm Feature + file list (all MODIFIED — adopt the frozen contract, no new contract authoring).
4. **Step 2.5** — answer the 4 design questions; ping the orchestrator before GREEN.
5. **Step 9** — flag the lesson 31 correction (I write it). **security-reviewer mandatory (rule #6/#7).**
