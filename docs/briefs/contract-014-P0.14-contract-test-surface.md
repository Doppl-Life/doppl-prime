# /tdd brief — contract_test_surface

## Feature
Establish the **contracts-package contract-test surface** — the cross-track agreement gate that every consumer of a shared schema agrees with the producer on payload shapes BEFORE the parallel tracks fork (§16 contract tests, RISK-014 / REQ-T-007). Three deliverables, shipped from the package: (1) a **single canonical valid fixture per Appendix-A model**, exported so any track's producer/consumer validates against it; (2) a **consolidated field-name-set snapshot harness** (extractor + frozen per-model field-sets) so any added/removed/renamed field on any §2.5 shared model is caught as a regression; (3) a **closed-union out-of-set rejection** sweep over every closed union. **NOT a safety slice** (test infrastructure; it PROTECTS the safety pins but introduces no new invariant). This is the **last P0 task** — after it lands, `/phase-exit P0` closes the freeze.

## Use case + traceability
- **Task ID:** P0.14
- **Architecture sections it implements:** `ARCHITECTURE.md §16` (contract tests — consumer/producer payload agreement; RISK-014; REQ-T-007), §2.5 (shared contracts frozen before tracks fork; single import boundary), §4 (Zod-authored, `z.infer` types — single source of truth). Covers the FULL Appendix-A inventory frozen across P0.1→P0.15 (the depends-on list predates the P0.15 split — this slice covers Run/Generation/CullingEvent/LineageGraphProjection/FinalJudgeRubric too).
- **Related context:** Per-slice field-set snapshot tests already exist (`test/__schema-snapshots__/*-field-sets.test.ts`, one per landed slice) — this slice CONSOLIDATES the harness into a single shipped source (Q3) and adds the canonical fixtures + the full closed-union sweep. Reuses lesson §1 (strict-closed-contract pinned two ways: reject-out-of-set + member/field snapshot), lesson §5 (single import boundary — barrel), lesson §10 (positive-guard-first on reject tests). The fixtures are the cross-track producers'/consumers' shared truth (a kernel/verifier/selection/demo track imports `@doppl/contracts` test-fixtures to validate its own I/O).

## Acceptance criteria (what "done" means)
- [ ] **Canonical fixtures:** `src/test-fixtures/index.ts` exports exactly one canonical VALID fixture per Appendix-A model (`RunEventEnvelope`, `RunConfig`, `RunCaps`, `Agenome`, `CandidateIdea` (both subtypes) + `CrossDomainTransferPayload` + `ZeitgeistSynthesisPayload`, `EvidenceRef`, `CriticReview`, `criticInput`, `CheckResult`, `CheckRunnerAdapter`, `NoveltyScore`, `FitnessScore`, `ScoringPolicy`, `EnergyEvent`, `ReproductionEvent`, `ProviderMeta`, `ModelRoute`, `ProviderCapability`, `ModelGatewayRequest`, `ModelGatewayResponse`, the 6 high-traffic payload-map narrowings, `Run`, `Generation`, `CullingEvent`, `LineageGraphProjection`, `FinalJudgeRubric`). Each fixture `.parse()`-round-trips through its schema (a test asserts every fixture is valid).
- [ ] **Field-set harness:** `src/__schema-snapshots__/field-sets.ts` exports a pure field-name extractor + a frozen field-set per §2.5 model; a test asserts each model's CURRENT field-set === the frozen snapshot — the single consolidated cross-track regression gate (Q3 settles its relation to the existing per-slice snapshot tests).
- [ ] **Closed-union sweep:** every closed union rejects an out-of-set value (positive-guard-first): `RunEventType`, `actor`/`Actor`, `ModelRole`, `CriticMandate`, `Subtype`, `ChatRole`, `ValidationResult`, `EvidenceKind`, `CheckStatus`, `CandidateStatus`, `AgenomeStatus`, `EnergyEventType`, `ReproductionMode`, `RunStatus`, `GenerationStatus`, `LineageNodeType`, `FinalJudgeAxis` — table-driven, each asserts a valid member parses AND an out-of-set value rejects.
- [ ] **Type single-source:** `z.infer` TS types for every model are exported from the barrel; a type-level check confirms consumers import types from contracts (no model redefined outside the package).
- [ ] **Barrel completeness:** `src/index.ts` re-exports every frozen schema + enum + type + the new fixtures/harness; a test asserts the barrel surface includes every expected symbol (a track imports exactly one package boundary, §2.5).
- [ ] All unit tests pass; `/preflight` clean (package-pinned prettier — lesson §14). Full suite green.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel additionally exports the canonical fixtures (`src/test-fixtures`) + the field-set harness (`src/__schema-snapshots__/field-sets`). Consumed by **every downstream track's contract tests** (kernel/verifier/selection/demo import the canonical fixtures to validate their producers/consumers against the frozen shapes) and by this package's own snapshot tests. `none — cross-track consumers wire to these fixtures in their own P1–P7 contract tests`. Reachability = barrel-exported + exercised by this slice's fixture-validity + snapshot + union-sweep tests.

## Files expected to touch
**New:**
- `packages/contracts/src/test-fixtures/index.ts` — one canonical valid fixture per Appendix-A model (exported).
- `packages/contracts/src/__schema-snapshots__/field-sets.ts` — field-name extractor + frozen per-model field-sets (exported harness).
- `packages/contracts/test/test-fixtures/fixtures-valid.test.ts` — every fixture round-trips.
- `packages/contracts/test/__schema-snapshots__/contract-surface.test.ts` — consolidated field-set snapshot + the closed-union sweep + barrel-completeness. _(Corrected: an earlier draft named this `field-sets.test.ts` — but that file already exists as the P0.1 envelope snapshot (lesson-§1 pin); do NOT overwrite it. The new SRC harness `src/__schema-snapshots__/field-sets.ts` is a distinct, genuinely-new file.)_

**Modified:**
- `packages/contracts/src/index.ts` — re-export the fixtures + harness.

If implementation needs files beyond this list (e.g. refactoring the existing per-slice snapshot tests onto the harness — Q3), **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
1. **`every_canonical_fixture_is_valid`** *(spec §16)* — Asserts: each exported fixture `.parse()`-round-trips through its schema (table-driven over the model→fixture map). Why: a canonical fixture that doesn't validate is worse than none (RISK-014).
2. **`field_sets_match_frozen_snapshot`** *(spec §2.5)* — Asserts: each §2.5 model's current field-name set === the frozen field-set in `field-sets.ts`. Why: any added/removed/renamed field is caught before tracks fork.
3. **`every_closed_union_rejects_out_of_set`** *(spec §4, lesson §1)* — Asserts (positive-guard-first): for each closed union, a valid member parses AND an out-of-set value rejects (table-driven over the full union list). Why: closed unions are the cross-track agreement on enumerated values.
4. **`barrel_exports_every_model_and_type`** *(spec §2.5, lesson §5)* — Asserts: the barrel surface includes every expected schema + enum + `z.infer` type + the fixtures/harness. Why: a track imports exactly one package boundary; a missing export breaks a consumer.
5. **`types_are_single_source`** *(spec §4)* — Asserts (type-level / `expectTypeOf` or a compile-time check): each model's `z.infer` type is exported + assignable from the canonical fixture. Why: consumers import types from contracts, never redefine (single-source-of-truth).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NONE — this slice adds fixtures + a harness over the already-frozen models; it changes no model shape.
- **§2.5-seam model touched?** No new model; it CONSOLIDATES the §2.5 snapshot gate. If Q3 = refactor the per-slice snapshots onto the shared harness, note it (no shape change).
- **Orchestrator doc rows to write hot:** none expected (no model change). At Step 9 I confirm the cross-doc table + Appendix A are complete for all P0 models (this slice is the natural completeness checkpoint before `/phase-exit P0`).

## Things to flag at Step 2.5
1. **Fixture export shape.** My default vote: one named const per model (`validRunEventEnvelope`, `validFinalJudgeRubric`, …) PLUS a `CANONICAL_FIXTURES` registry map (model-name → fixture) for table-driven tests + cross-track iteration. Flag if you'd rather only the map or only named consts. I lean both (named for ergonomics, map for the sweep).
2. **Field-set extractor.** My default vote: a pure helper that derives the field-name set from a Zod object/strictObject schema's `.shape` (and for discriminated unions, walks `.options` per variant — the P0.5 pattern, lesson §7). Frozen field-sets live as literal arrays in `field-sets.ts` (the snapshot). Flag the discriminated-union/enum handling.
3. **Relation to the existing per-slice snapshot tests.** My default vote: ADD the consolidated harness + a single full-inventory snapshot test; LEAVE the existing per-slice `*-field-sets.test.ts` green (don't refactor them this slice — avoid churn/risk at the phase gate). Optionally have them re-import the shared extractor if trivially safe. Flag if you'd rather consolidate them all now (more churn, one source).
4. **Fixtures ship in the package public API.** Confirm: the canonical fixtures are intentionally part of `@doppl/contracts`'s exported surface (the task says "exported from the contracts package for cross-track producers/consumers"), not test-only — so they live in `src/`, not `test/`. My default vote: yes, ship them (cross-track consumers import them). Flag if you'd rather a separate `@doppl/contracts/fixtures` subpath export.
5. **Closed-union list completeness.** My default vote: the 17 unions listed in AC3. Confirm none is missed (cross-check against the barrel enums).
6. **Commit count.** My default vote: **1** — the contract-test surface is one cohesive cross-track gate (fixtures + harness + union sweep are facets of one deliverable). Not a safety slice. Commit: `test(contracts): canonical fixtures + field-set harness + closed-union sweep (P0.14)`.

## Dependencies + sequencing
- **Depends on:** ALL P0 model slices (P0.1–P0.13, P0.15) — every Appendix-A model must be frozen. All landed.
- **Blocks:** `/phase-exit P0` (this is the last P0 task; the phase-exit checklist runs after it). Every downstream track (P1–P7) consumes these fixtures in its own contract tests.

## Estimated commit count
**1** — the contract-test surface is one logical unit (the cross-track agreement gate). Sizable but mechanical (fixtures + a field-set harness + a table-driven union sweep). Not a safety slice — no key-safety-rule invariant is introduced (it PROTECTS the existing pins). Commit: `test(contracts): …` (a `test(...)` type — it adds the contract-test surface, no production-shape change).

## Step-8 reviewer policy
**security-reviewer: phase-boundary** (no new safety invariant — test infrastructure; the `/phase-exit P0` review covers the accumulated phase diff incl. the safety pins). **code-quality-reviewer: phase-boundary.** (This slice's review naturally folds into `/phase-exit P0` since it IS the last slice.)

## Lessons-logged candidates anticipated
- **Convention candidate** — possibly "the contract-test surface ships canonical fixtures + a field-set harness FROM the package so cross-track consumers validate against one source" (if it proves reusable beyond this project's pattern). Likely folded into §1 rather than a new lesson.
- **Architecture-doc note candidate** — none expected (no shape change).

## How to invoke
1. **Read this brief end-to-end.** Q3 (relation to existing per-slice snapshots) + Q4 (fixtures ship in public API) are the load-bearing scope calls.
2. **Run `/tdd contract_test_surface`.**
3. **Step 0/1** — confirm restatement + file list; confirm this covers the FULL Appendix-A inventory (incl. the P0.13/P0.15 models) and changes NO model shape.
4. **Step 2.5** — send the test-design write-up (per-test `Asserts` + per-acceptance-bullet coverage map) + answers. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask. After this lands, signal done — I run `/phase-exit P0` to close the freeze.
