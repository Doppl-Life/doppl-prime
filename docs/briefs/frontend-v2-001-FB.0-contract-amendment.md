# /tdd brief — runconfig_run_controls_contract_amendment

## Feature
Amend the frozen `RunConfig` contract (`packages/contracts`) with three new **optional** run-control fields the frontend-v2 launcher introduces — `generationOperators?` (allowlisted mutagen-skill enum), `generationBias?` (the diverge/converge **generation** hint, a bounded scalar), `modelRouteOverride?` (per-role model override) — plus a new closed `GenerationOperator` enum, and bump `CURRENT_SCHEMA_VERSION` 5→6. The amendment is **additive/backward-compatible** and leaves the `ScoringPolicy` / `FinalJudgeRubric` / `FinalJudgeAxis` schemas **byte-identical** (safety rule #6 — the held-out judge anchor the organism cannot move). This ships the validated contract surface that FB.1–FB.4 (gateway adapter, route override, operators, bias) and FV.3 (launcher) build against.

## Use case + traceability
- **Task ID:** FB.0
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (contracts & event model — `RunConfig`, `schemaVersion` handling, `CURRENT_SCHEMA_VERSION` reader-acceptance `≤ current`), `ARCHITECTURE.md §6` (model gateway — `ModelRole` roles, the MVP-lean capability matrix)
- **Related context:**
  - Phase plan: `docs/planning/frontend-v2-phase-plan.md` (FB.0 row + the "Backend reconciliation" section — the three new controls are bounded by rules #1/#4/#5/#6/#9).
  - **Announce-before-merge protocol** (`docs/runbooks/cross-track-contract-coordination.md`) — this is a frozen-contract-surface change: a `CURRENT_SCHEMA_VERSION` bump + a new closed enum. Announce + verify cody's contract state before the merge. (frontend-v2 is currently the only active track, so the collision audience is empty, but the pre-merge contract-state check + one-merger-at-a-time hygiene still apply.)
  - Prior amendment pattern to mirror: the P0.16 judge-output seam + the kernel-020 linearization (the version.ts history + the snapshot/fixture/version-test update checklist).
  - Safety rule #6 (immutable judge/rubric/scoring), rule #1 (caps kernel-enforced — an operator/bias is a generation HINT, never a cap or a scoring lever), rule #5 (model output untrusted; operator text is DATA, isolated in FB.3).

## Acceptance criteria (what "done" means)
- [ ] A new closed `GenerationOperator` Zod enum exists with exactly the 7 mutagen skills in **snake_case** (machine-truth, DS rule 5): `breakthrough`, `first_principles`, `polymath`, `breakout`, `blindside`, `subtraction`, `constraint` — exported from the contracts barrel.
- [ ] `RunConfig` gains exactly 3 new **optional** fields, all additive (existing 6 required fields unchanged):
  - `generationOperators?: GenerationOperator[]` (when present, `.min(1)`)
  - `generationBias?: number` — bounded to the agreed range (see Step 2.5 Q1), recorded as a **generation input** (not a scoring/judge input)
  - `modelRouteOverride?` — a per-`ModelRole` partial override of `{provider, modelId}` (the shape; allowlist-clamping is runtime, FB.2)
- [ ] `CURRENT_SCHEMA_VERSION` is bumped 5→6 with the version-history comment extended; readers still accept `schemaVersion ≤ 6` (old v1–5 envelopes still validate — additive).
- [ ] **Safety pin (rule #6):** `ScoringPolicy` (`{version, weights, normalization?}`), `FinalJudgeRubric` (`{axes, weights, policyVersion, immutableToAgents}`), and `FinalJudgeAxis` (the 5-member enum) field-sets are **unchanged** by this amendment — asserted explicitly against the frozen snapshots.
- [ ] The shared-contract seam schema-snapshot surface is updated in the same cycle: `RunConfig` field-set 6→9 in `FIELD_SET_SNAPSHOTS` + the per-topic `run-config-field-sets.test.ts`, a field-set/enum snapshot for `GenerationOperator`, the canonical `validRunConfig` fixture still validates, and the `CURRENT_SCHEMA_VERSION` assertion test reads 6.
- [ ] **No provider-enum change.** `ModelRoute.provider` / `ProviderMeta.provider` stay open `z.string()` (adding `ollama` is a runtime allowlist concern — FB.1); `ProviderCapability` is unchanged (ollama is expressible with the existing `structuredOutputs`/`embeddings`/`toolCalling?`/`streaming?` flags).
- [ ] All contracts unit/snapshot tests pass (`pnpm -C packages/contracts test`).
- [ ] `/preflight` clean.
- [ ] Cross-doc invariant flagged at Step 9 (RunConfig is an Appendix-A model — the orchestrator writes the `ARCHITECTURE.md` Appendix-A `RunConfig` row + `CURRENT_SCHEMA_VERSION` prose + the `apps/api/CLAUDE.md` cross-doc row hot).

## Wiring / entry point (Step 7.5)
**none — runtime honoring lands in FB.1–FB.4** (FB.1 ollama adapter, FB.2 route-override clamp, FB.3 operators→prompt-as-DATA, FB.4 bias→generation). FB.0 ships only the validated contract surface. The one production consumer touched now is the **boot config validator** (`packages/contracts/src/config/validate.ts` — the `RunConfig` parse path): confirm it accepts a `RunConfig` carrying the new optional fields and still rejects an out-of-range `generationBias` / an unknown `GenerationOperator` member (the schema does the rejecting). Do NOT wire operator/bias/override into the generation or gateway path in this slice — that is FB.1–FB.4 and would bundle feature work onto the contract amendment.

## Files expected to touch
**New:**
- `packages/contracts/src/run/generation-operator.ts` — the `GenerationOperator` closed enum (+ `z.infer` type)
- (optional) `packages/contracts/src/run/model-route-override.ts` — the `ModelRouteOverride` shape, IF cleaner than inlining into `run-config.ts` (Step 2.5 Q3)

**Modified:**
- `packages/contracts/src/run/run-config.ts` — add the 3 optional fields
- `packages/contracts/src/index.ts` — export the new enum/type (barrel)
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` 5→6 + history comment
- `packages/contracts/src/__schema-snapshots__/field-sets.ts` — `RunConfig` field-set (6→9) + a `GenerationOperator` enum snapshot entry
- `packages/contracts/src/test-fixtures/index.ts` — keep `validRunConfig` valid (optionally add a `validRunConfigWithControls` variant exercising the new fields)
- `packages/contracts/test/__schema-snapshots__/run-config-field-sets.test.ts` — the RunConfig field-set constant
- `packages/contracts/test/__schema-snapshots__/field-sets.test.ts` — the `CURRENT_SCHEMA_VERSION` assertion (→ 6)
- `packages/contracts/test/__schema-snapshots__/contract-surface.test.ts` — fixture-lockstep (new fixture variant, if added)
- A new/extended test asserting the rule-#6 immutability pin (scoring/judge field-sets unchanged) — colocate with the snapshot tests

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Tests in `packages/contracts/test/` (snapshot tests under `__schema-snapshots__/`, schema-behavior tests colocated):

1. **`test_generation_operator_enum_members`** — Asserts: `GenerationOperator` parses exactly the 7 snake_case members and rejects an unknown member (e.g. `'first-principles'` with a hyphen, `'magic'`). Why: closed allowlist + DS rule 5 (snake_case machine-truth); §4 closed-enum discipline.
2. **`test_runconfig_accepts_new_optional_controls`** — Asserts: a `RunConfig` WITH `generationOperators`/`generationBias`/`modelRouteOverride` parses; a `RunConfig` WITHOUT them still parses (additive/optional). Why: §4 additive amendment, backward compatibility.
3. **`test_generation_bias_bounds`** — Asserts: `generationBias` at the bound endpoints parses; out-of-range rejects. Why: a bounded generation hint, not an unbounded lever (Step 2.5 Q1 fixes the range).
4. **`test_model_route_override_shape`** — Asserts: `modelRouteOverride` keyed by a valid `ModelRole` with `{provider, modelId}` parses; an unknown role key rejects. Why: §6 role-keyed routing; the shape FB.2 clamps.
5. **`test_runconfig_field_set_snapshot`** (`spec(§4)`) — Asserts: `objectFieldNames(RunConfig)` == the frozen 9-field snapshot. Why: shared-contract seam frozen-contract snapshot (RunConfig is crossed by gateway/runtime/selection edges) — the mandatory schema-snapshot test for a shared-contract change.
6. **`test_current_schema_version_is_6`** — Asserts: `CURRENT_SCHEMA_VERSION === 6` and a v5 envelope still validates (`≤ current`). Why: §4 `schemaVersion` reader-acceptance + monotonic bump.
7. **`test_scoring_and_judge_field_sets_unchanged`** (rule #6) — Asserts: `ScoringPolicy`, `FinalJudgeRubric`, `FinalJudgeAxis` field-sets equal their frozen snapshots (byte-identical, untouched by this amendment). Why: safety rule #6 — the immutable judge/scoring anchor is not moved by a run-control amendment.
8. **`test_valid_runconfig_fixtures_parse`** — Asserts: the canonical `validRunConfig` (and the new-controls variant, if added) `safeParse` OK. Why: fixture-lockstep gate (every frozen field-set has a passing canonical fixture).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** `RunConfig` +3 optional fields; new `GenerationOperator` enum; `CURRENT_SCHEMA_VERSION` 5→6. `ScoringPolicy`/`FinalJudgeRubric`/`FinalJudgeAxis` **unchanged**.
- **Orchestrator doc rows to write hot (Step 9 routing):** `ARCHITECTURE.md` Appendix-A `RunConfig` row (the 3 new optional fields) + the §4 `CURRENT_SCHEMA_VERSION` prose (→ 6, with the FB.0 history note) + the `apps/api/CLAUDE.md` cross-doc invariants row. The implementer does NOT touch these — flag categorized at Step 9.
- **shared-contract seam (shared-contract) model touched?** **Yes** — `RunConfig` is a frozen `packages/contracts` Appendix-A model crossed by subsystem-boundary edges (gateway/runtime/selection all read it). The RED outline MUST include the schema-snapshot test (test 5, tagged `spec(§4)`) — authored this same cycle.

## Things to flag at Step 2.5
1. **`generationBias` range + semantics.** Plausible: (a) `−1..+1` with `0` = neutral, `−1` = converge/grounding, `+1` = diverge/novelty; (b) `0..1`. My default vote: **(a) `−1..+1`, 0 neutral** — symmetric around neutral reads cleanly as a dial and makes "no bias" the explicit default. Record it as a **generation input** only; it must never appear on a scoring/judge path (rule #6).
2. **Fold the FB.6–FB.8 telemetry fields into THIS amendment, or land them additively in their own slices?** The phase-plan DRAFT text says "extend the telemetry surfaces in the same amendment." But the FB.6 raw-capture event/provenance shape, the FB.7 tool-call payload, and the FB.8 `axisRationales` shape are **genuinely under-designed** (they're FB.6/7/8 design decisions), and frontend-v2 is the only active track (so multiple additive schemaVersion bumps are cheap — no cross-track collision). My default vote: **FB.0 = run-controls surface ONLY; FB.6/7/8 each carry their own additive contract bump alongside their behavior** — keeps FB.0 tight, avoids premature telemetry design, and keeps FB.6's secret-surface work solo (never bundled). *(I have flagged this deviation-from-DRAFT to the lead; if the user prefers the single-bump fold, it's an easy `ADD:` at Step 2.5.)*
3. **`modelRouteOverride` shape: inline in `run-config.ts` vs its own `model-route-override.ts`; and `z.record(ModelRole, …)` vs an array of `{role, provider, modelId}`.** My default vote: **a partial record keyed by `ModelRole`** (`z.record`/partial-record with `{provider, modelId}` values) in its own small `model-route-override.ts` — role-keyed reads naturally as "override THIS role," matches `ModelRoute.role`, and a separate file mirrors the existing one-model-per-file layout. Allowlist-clamping stays runtime (FB.2); the contract only fixes the shape.
4. **`GenerationOperator` array bounds.** Allow multiple operators per run? My default vote: **yes — `GenerationOperator[]` with `.min(1)` when present**, no hard max in the contract (a sane cap, if any, is a launcher/runtime concern). FB.3 composes the selected operators into the generation prompt as isolated DATA.

## Dependencies + sequencing
- **Depends on:** P0 frozen contracts (merged to cody); the contracts package at `CURRENT_SCHEMA_VERSION = 5`.
- **Blocks:** FB.1 (ollama adapter), FB.2 (route override), FB.3 (operators), FB.4 (bias) — all build against this surface; **FV.3 (launcher)** wires the three controls. This is the **announce-before-merge** contract slice — it lands on cody before FV.3 builds against it.

## Estimated commit count
**1.** A single frozen-contract amendment (schema + snapshots + fixtures + version + the rule-#6 immutability assertion) is one logical, bisectable unit. It is a **contract/cross-doc-invariant change** (atomic doc-edit pairing wants traceability) — kept as its own commit, never bundled with FB.1+ runtime work. The rule-#6 pin is a safety assertion that rides this same contract commit (it asserts the amendment's non-effect on the judge surface — not separable from it).

## Lessons-logged candidates anticipated
- **Convention candidate** — "Run-control additions to `RunConfig` are optional + additive + a single monotonic `CURRENT_SCHEMA_VERSION` bump; the snapshot/fixture/version-test trio updates in the same cycle (mirror the P0.16/kernel-020 checklist)."
- **Architecture-doc note candidate** — clarify in §4/§6 that `generationOperators`/`generationBias` are **generation inputs** (rule #5 DATA, rule #6-safe), never scoring/judge inputs; `modelRouteOverride` is allowlist-clamped at runtime (the contract fixes the shape only).
- **Future TODO — operational** — the telemetry-fold decision (Step 2.5 Q2) determines whether FB.6/7/8 each carry their own bump; record the outcome so those briefs cite it.
