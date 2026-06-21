# /tdd brief — final_judge_rubric

## Feature
Freeze `FinalJudgeRubric` — the held-out judge's fixed rubric and the **bedrock fitness anchor the organism cannot move** (key safety rule #6, anti-reward-hacking). Strict object carrying EXACTLY: `axes` (the CLOSED 5-axis set `grounding`/`novelty`/`feasibility`/`falsification_survival`/`subtype_check_pass`), `weights` (structure frozen, numeric values deferred-open), `policyVersion` (required — immutability-via-versioning), `immutableToAgents` (literal `true` — the rule-#6 structural pin). Encodes the immutability anchor by SHAPE: the axis set is closed (no agent can add/remove a judging axis), `immutableToAgents` cannot be set false at the contract boundary, and NO agent-writable/override/mutation field is representable (strict). **SAFETY slice (rule #6 — held-out judge immutable to agents; §14 security invariant). SOLO — own commit, never bundled** (lead-mandated; the P0.15 entity portion already shipped separately).

## Use case + traceability
- **Task ID:** P0.15 (FinalJudgeRubric — the remainder split out of P0.15; the Run/Generation/CullingEvent entities shipped in the prior bundle)
- **Architecture sections it implements:** `ARCHITECTURE.md §7` ("a frozen held-out `final_judge` role… applies a fixed rubric… The held-out judge config and the rubric are **immutable to agents** (a security invariant, §14): metric mutation… cannot move this bedrock anchor. The MVP rubric is a 5-axis 0–5 scale — grounding, novelty, feasibility, falsification-survival, subtype-check pass — applied by the held-out judge; weights start equal with a small energy-efficiency tiebreak, are **policy-versioned**, and are refined post-spike (the numeric weights are the only deferred-open piece of the scoring contract)"), §8 (the held-out judge acceptance score is a `FitnessScore` component; selection explainable from events), §14 (immutable-to-agents security invariant). Appendix A `FinalJudgeRubric` row (§7).
- **Related context:** Reuses the safety-by-shape patterns: **immutability-via-versioning** (lesson §12 — `policyVersion` required + identically typed to `ScoringPolicy.version`, the P0.8 pattern); **emit-only / no-authority-field via shape** (lesson §9 — strict + field-set snapshot makes a mutation/override field unrepresentable, the CriticReview rule-#6 pattern); **structure-frozen / values-deferred-open** (P0.8 `ScoringPolicy.weights`, lesson §6). The 5 axes mirror the `/eval` held-out-rubric harness (root `CLAUDE.md` TDD posture). **Sibling to `ScoringPolicy`** (P0.8) — both are policy-versioned scoring contracts; the rubric is the held-out anchor, `ScoringPolicy` the in-loop fitness policy. Key safety rule #6: the held-out judge, its rubric, and the scoring policy are immutable to agents.

## Acceptance criteria (what "done" means)
- [ ] `FinalJudgeRubric` is a strict object carrying EXACTLY: `axes`, `weights`, `policyVersion`, `immutableToAgents` — unknown rejected; all required (none omittable).
- [ ] **`FinalJudgeAxis`** is the CLOSED 5-member union `grounding | novelty | feasibility | falsification_survival | subtype_check_pass` (§7/§8); any other axis name (e.g. `vibes`, `''`) rejected — an agent cannot introduce a judging axis.
- [ ] `axes` carries the active axis set as `z.array(FinalJudgeAxis)` (Q1); the MVP rubric fixture carries all 5.
- [ ] `weights` is an OPEN name→number record (`z.record(z.string(), z.number())`) — **structure frozen, numeric values deferred-open** (the only deferred-open piece of the scoring contract, §7; lesson §6); a non-number weight rejected (Q2).
- [ ] **Immutability-via-versioning (rule #6, lesson §12):** `policyVersion` is REQUIRED and typed identically to `ScoringPolicy.version` (`z.string().min(1)`) — a rubric without it is rejected; the rubric is never mutated in place, a new version supersedes (Q5).
- [ ] **Immutable-to-agents structural pin (rule #6, §14):** `immutableToAgents` is `z.literal(true)` — a rubric with `immutableToAgents:false` OR omitting it is rejected. The anchor's immutability flag cannot be flipped at the contract boundary (Q3).
- [ ] **No agent-authority field representable (rule #6 anti-reward-hacking, lesson §9):** the strict object + field-set snapshot make any mutation/override/authority field unrepresentable — a rubric carrying `mutable`/`editableBy`/`scoreOverride`/`weightOverride`/`agentWritable` is rejected (Q6). (positive-guard-first — lesson §10.)
- [ ] NO `scale`/`min`/`max` field — the 0–5 per-axis scoring scale is how the judge applies the rubric (runtime/scoring detail), NOT a rubric field; the frozen field-set is exactly the 4 Appendix-A fields (Q4).
- [ ] **Schema-snapshot test (§2.5 gate, tagged `spec(§7)`):** `FinalJudgeRubric` field-set + `FinalJudgeAxis`(5) + the `immutableToAgents` literal-`true` pin == frozen snapshot — any added/removed/renamed field or axis, or a weakening of the literal, is a cross-track regression.
- [ ] `z.infer` types + the `FinalJudgeAxis` enum re-exported from the barrel; all unit tests pass; `/preflight` clean (package-pinned prettier — lesson §14).

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports `FinalJudgeRubric` (schema + `z.infer` type) + `FinalJudgeAxis`. Consumed downstream by the **verifier track (P4 — the held-out `final_judge` role applies this rubric; the rubric/config is loaded immutably, never from an agent-writable path)** and the **selection track (P5 — the judge acceptance score feeds `FitnessScore` components; "gen N+1 beats gen N" is measured against it)**. `none — runtime wiring (the held-out judge applying the rubric + the no-agent-writable-path enforcement) lands in P4/P5 by design`. Reachability = barrel-exported + schema-snapshot-covered. **NOTE for P4/P5 (cross-track):** the contract pins the rubric's SHAPE + the immutability flag; the *runtime* guarantee that no agent code path can write/mutate the rubric or its weights is a P4/P5 kernel/verifier invariant (the contract cannot enforce a no-write path) — pin it there.

## Files expected to touch
**New:**
- `packages/contracts/src/verifier/final-judge-rubric.ts` — `FinalJudgeRubric` + `FinalJudgeAxis`.
- `packages/contracts/test/verifier/final-judge-rubric.test.ts`
- `packages/contracts/test/__schema-snapshots__/final-judge-rubric-field-sets.test.ts`

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `packages/contracts/test/verifier/final-judge-rubric.test.ts` (+ snapshot):

1. **`final_judge_rubric_accepts_valid_and_strict`** *(spec §7)* — Asserts (positive-guard-first): a full rubric (all 5 axes, weights, policyVersion, immutableToAgents:true) round-trips; unknown key rejected; each of the 4 fields required (omitting any rejected). Why: Appendix-A §7 shape.
2. **`final_judge_axis_closed_5_union`** *(spec §7/§8)* — Asserts: `grounding`/`novelty`/`feasibility`/`falsification_survival`/`subtype_check_pass` parse; `'vibes'`/`''`/`'grounding '` rejected. Why: the judging axis set is frozen — an agent cannot add an axis (rule #6).
3. **`final_judge_immutable_to_agents_literal_true`** *(spec §7/§14, rule #6)* — Asserts: `immutableToAgents:true` parses; `false` rejected; omitting it rejected. Why: the anchor's immutability flag cannot be flipped or dropped at the contract boundary.
4. **`final_judge_policy_version_required`** *(spec §7, rule #6, lesson §12)* — Asserts: omitting `policyVersion` rejected; empty string rejected; typed like `ScoringPolicy.version` (`z.string().min(1)`). Why: immutability-via-versioning — never mutated in place.
5. **`final_judge_no_authority_field`** *(spec §7, rule #6, lesson §9)* — Asserts (positive-guard-first): `{...valid, mutable:true}`, `{...valid, editableBy:'agent'}`, `{...valid, scoreOverride:10}`, `{...valid, weightOverride:{}}`, `{...valid, agentWritable:true}` each REJECTED (strict). Why: no agent-authority/mutation/override field representable (anti-reward-hacking).
6. **`final_judge_weights_structure_frozen_values_open`** *(spec §7, lesson §6)* — Asserts: `weights` accepts an arbitrary name→number map (values open); a non-number weight rejected. Why: structure frozen, numeric values deferred-open (the only deferred-open scoring piece).
7. **`final_judge_no_scale_field`** *(spec §7)* — Asserts: a rubric carrying `scale`/`min`/`max` is rejected (strict) — the 0–5 scale is a runtime scoring detail, not a rubric field. Why: frozen field-set = exactly the 4 Appendix-A fields.
8. **`barrel_exports_final_judge_rubric`** *(spec §2.5)* — Asserts: `FinalJudgeRubric` + `FinalJudgeAxis` re-exported. Why: §2.5 single import boundary.
9. **`schema_snapshot_final_judge_rubric`** *(spec §7/§2.5)* — Asserts: `FinalJudgeRubric` field-set + `FinalJudgeAxis`(5) + the `immutableToAgents` literal-`true` == frozen snapshots. Why: §2.5 cross-track regression gate + a weakening of the immutability pin is caught.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `FinalJudgeRubric` (+ `FinalJudgeAxis`). The Appendix-A `FinalJudgeRubric` row already exists; at Step 9 I confirm/settle the field shapes (`axes` encoding (Q1), `weights` keying (Q2)) against what GREEN freezes.
- **§2.5-seam model touched?** **YES** — shared (verifier→selection). RED outline MUST include the schema-snapshot (#9).
- **Orchestrator doc rows to write hot:** add a cross-doc row for `FinalJudgeRubric` (§7) to `apps/api/CLAUDE.md`; confirm the Appendix-A row matches the frozen shape. **Safety-relevant:** any weakening of the closed-axis set, the `immutableToAgents` literal, the required `policyVersion`, or the no-authority-field pin is a Step-9 **Finding** (rule #6).

## Things to flag at Step 2.5
1. **`axes` encoding.** My default vote: `axes = z.array(FinalJudgeAxis)` (`FinalJudgeAxis` = closed 5-`z.enum`), the active axis set, MVP = all 5. Flag the alternative `axes = z.record(FinalJudgeAxis, …)` (axis→config) if per-axis config is needed now — I lean the simple array (weights live in `weights`; §7 keeps weights separate).
2. **`weights` keying.** My default vote: OPEN `z.record(z.string(), z.number())` — mirrors `ScoringPolicy.weights` (lesson §6, values deferred-open), consistent sibling shape. Flag the tighter `z.record(FinalJudgeAxis, z.number())` (weights keyed strictly by axis) if you want the axis↔weight binding structural — I lean open string for ScoringPolicy parity, but the tighter keying is defensible (it binds weights to the closed axis set). Genuine call; whatever GREEN settles I record in Appendix A.
3. **`immutableToAgents` typing.** My default vote: `z.literal(true)` — the rule-#6 structural pin (a `false` or omitted value is rejected; the flag is asserted-true-by-shape, like the literal-value pins elsewhere). Flag if you'd rather a boolean + a refine (I lean the literal — strongest pin, unflippable).
4. **No `scale`/`min`/`max` field.** My default vote: NO scale field — the 0–5 per-axis scale is how the judge SCORES (runtime), not a rubric field; the frozen field-set is exactly the 4 Appendix-A fields. Flag if you read §7's "0–5 scale" as a required rubric field (I lean no — Appendix A doesn't list it).
5. **`policyVersion` ↔ `ScoringPolicy.version`.** My default vote: `z.string().min(1)`, typed IDENTICALLY to `ScoringPolicy.version` (lesson §12 structural-identity, not a shared symbol — value-level binding is a P5 runtime concern, mirrors P0.8's `FitnessScore.policyVersion`). Flag if you want a shared `PolicyVersion` symbol now (P0.8 ruled YAGNI — no shared symbol; I lean keeping that).
6. **No-authority-field adversarial list (rule #6).** My default vote: reject `mutable`/`editableBy`/`scoreOverride`/`weightOverride`/`agentWritable` via strict + snapshot. Confirm the list is representative of the anti-reward-hacking surface.
7. **Commit count.** My default vote: **1 — SAFETY slice (rule #6, held-out judge immutable to agents — SOLO, never bundled).** Commit: `feat(contracts): FinalJudgeRubric — held-out judge anchor (P0.15)`.

## Dependencies + sequencing
- **Depends on:** P0.8 (`ScoringPolicy` — landed; `policyVersion` mirrors `ScoringPolicy.version` typing). Independent of the P0.15 entity bundle (already landed).
- **Blocks:** P0.14 (contract-test surface needs all P0 models); the verifier (P4 held-out judge) + selection (P5 acceptance metric) tracks. **This is the LAST schema slice before P0.14** — after it lands, P0.14 (contract-test phase-gate) is the only remaining P0 task, then `/phase-exit P0`.

## Estimated commit count
**1** — SAFETY slice. `FinalJudgeRubric` carries key safety rule #6 (the held-out judge/rubric/scoring-policy is immutable to agents — the bedrock anti-reward-hacking anchor). Lead-mandated SOLO; never bundled with feature work. Single cohesive commit.

## Step-8 reviewer policy
**security-reviewer: FAN OUT** — invariant slice (rule #6 + §14). Review surface: confirm (a) the axis set is genuinely closed (no agent can add a judging axis), (b) `immutableToAgents` cannot be set false or omitted, (c) `policyVersion` is required (no unversioned rubric), (d) no mutation/override/authority field is representable, (e) the schema-snapshot pins all of the above so a future weakening is caught mechanically. `code-quality-reviewer`: phase-boundary.

## Lessons-logged candidates anticipated
- **Convention candidate** — likely none new (reuses §6 structure-frozen/values-open, §9 no-authority-field-via-shape, §12 immutability-via-versioning, §10 positive-guard); possibly a note that the held-out anchor stacks ALL THREE (closed-axis + literal-true + required-version + no-authority-field) as the strongest immutability pin in the package.
- **Architecture-doc note candidate** — confirm the Appendix-A `FinalJudgeRubric` row matches the frozen `axes`/`weights` encodings (Q1/Q2).

## How to invoke
1. **Read this brief end-to-end.** Q2 (weights keying) + Q3 (`immutableToAgents` literal) are the load-bearing calls; Q3/Q6 are the rule-#6 pins.
2. **Run `/tdd final_judge_rubric`.**
3. **Step 0/1** — confirm restatement + file list; confirm `policyVersion` mirrors `ScoringPolicy.version` typing (no shared symbol) and the 5 axes match §7/the eval harness.
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map) + answers. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 7→8** — security-reviewer fans out (invariant slice).
6. **Step 9** — categorized flags + ship-ask; any weakening of the closed-axis / immutability / versioning / no-authority pins is a Finding.
