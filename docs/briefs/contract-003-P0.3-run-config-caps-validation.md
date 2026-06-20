# /tdd brief — run_config_caps_and_validation

## Feature
Freeze the `RunCaps` and `RunConfig` Zod contracts (+ the canonical closed `Subtype` union they reference) and a **pure** boot config-validation entry that merges config layers (`defaults < file < env`) and validates them, failing fast with a clear, field-identifying error — so an invalid cap/config is rejected at boot, not at runtime.

## Use case + traceability
- **Task ID:** P0.3
- **Architecture sections it implements:** `ARCHITECTURE.md §4`/§5 (`RunCaps`/`RunConfig` + the per-run RNG seed capture), §15 (config Zod-validated at startup; fail-fast; precedence `defaults < file < env`), Appendix A.
- **Related context:** `RunCaps` is the cap set the runtime kernel enforces (key safety rule #1 — caps are kernel-enforced, NOT prompt-enforced; this slice freezes the *schema* + boot validation, not the kernel enforcement, which is P3). `rngSeed` is the per-run seed persisted in `run.configured` for deterministic replay (§4). **Purity principle (from the P0.2 redaction env-value layering):** `packages/contracts` is env-less (§9 layer rule) — the validator is a PURE merge+validate over already-loaded source objects; the actual file/env *reading* happens at the boot layer (P1), which calls this validator.

## Acceptance criteria (what "done" means)
- [ ] `RunCaps` is a strict Zod object carrying EXACTLY: `maxPopulation`, `maxGenerations`, `energyBudget` (doppl_energy integer), `maxSpawnDepth`, `maxToolCalls`, `wallClockTimeoutMs` (Appendix A §4/§5). Each is a **positive integer**; `0`, negative, and non-integer values are rejected.
- [ ] `energyBudget` is a single integer in the `doppl_energy` unit (the same unit `EnergyEvent` uses, §4).
- [ ] `Subtype` is a closed Zod enum with EXACTLY `cross_domain_transfer | zeitgeist_synthesis`; any other value rejected. (Canonical home for the union P0.5 `CandidateIdea.subtype` will import — single-source-of-truth.)
- [ ] `RunConfig` is a strict Zod object carrying EXACTLY: `seed`, `enabledSubtypes[]` (array of `Subtype`, ≥1), `caps: RunCaps`, `modelProfile`, `scoringPolicyVersion`, `rngSeed` (Appendix A).
- [ ] `rngSeed` is **required** on `RunConfig` (so the per-run seed is persistable in `run.configured` for deterministic replay, §4).
- [ ] `RunCaps` and `RunConfig` reject unknown fields (strictObject) and missing required fields.
- [ ] A **pure** config-validation entry (default `validateRunConfig(sources: { defaults; file; env })`) merges the three layers with **`defaults < file < env`** precedence and validates the result against `RunConfig`, returning a typed `RunConfig` on success.
- [ ] On an invalid merged field the validator **throws a clear, field-identifying error** (the path of the offending field appears in the message) — fail-fast (§15, REQ-NF-001). It does **not** read files or `process.env` itself (that's the boot layer's job).
- [ ] `z.infer` types (`RunCaps`, `RunConfig`, `Subtype`) exported from the barrel; no redefinition outside contracts.
- [ ] **Schema-snapshot test (§2.5 gate, tagged `spec(§4)`):** `RunCaps` field-name set, `RunConfig` field-name set, and `Subtype` member set each equal a checked-in frozen snapshot.
- [ ] All unit tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
Entry point = the `@doppl/contracts` barrel exports `RunCaps`, `RunConfig`, `Subtype`, `validateRunConfig`. `validateRunConfig` is consumed by the **boot layer** (P1 runtime/config) which reads the actual config file + `process.env`, passes them as the `sources` object, and fails fast on the thrown error. `none — boot wiring (read file/env → call validateRunConfig → start or exit) lands in P1`. Reachability for this slice = barrel-exported + exercised by the validation + snapshot tests.

## Files expected to touch
**New:**
- `packages/contracts/src/run/run-caps.ts` — `RunCaps` + type.
- `packages/contracts/src/run/run-config.ts` — `RunConfig` + type.
- `packages/contracts/src/domain/subtype.ts` — canonical `Subtype` closed union + type. *(Not in the plan's P0.3 file list — added because `RunConfig.enabledSubtypes` needs the union and P0.5 must import the same one. Flagging per the brief-template "files beyond the list" rule.)*
- `packages/contracts/src/config/validate.ts` — pure `validateRunConfig(sources)`.
- `packages/contracts/test/run/run-caps.test.ts`, `packages/contracts/test/run/run-config.test.ts`, `packages/contracts/test/config/validate.test.ts`, `packages/contracts/test/__schema-snapshots__/` (extend the snapshot set).

**Modified:**
- `packages/contracts/src/index.ts` — re-export the above.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
1. **`run_caps_accepts_valid`** — Asserts: all 6 positive-int fields parse. Why: §4/§5 happy path.
2. **`run_caps_rejects_nonpositive_or_noninteger`** — Asserts: `0`, `-1`, `1.5` rejected for each cap. Why: §15 fail-fast on invalid caps.
3. **`run_caps_strict_unknown_and_missing`** — Asserts: unknown field + missing field rejected. Why: §4 strict contract.
4. **`subtype_accepts_both_members_rejects_others`** — Asserts: both members parse; `'other'`/`''` rejected. Why: closed subtype union.
5. **`run_config_accepts_valid`** — Asserts: full object (caps:RunCaps, enabledSubtypes, seed, rngSeed, modelProfile, scoringPolicyVersion) parses + round-trips. Why: Appendix A happy path.
6. **`run_config_requires_rngSeed`** — Asserts: omitting `rngSeed` throws. Why: §4 replay seed capture.
7. **`run_config_enabledSubtypes_min_one_and_closed`** — Asserts: empty array rejected; an array with a non-`Subtype` value rejected. Why: at least one subtype enabled, closed union.
8. **`run_config_strict_unknown_and_missing`** — Asserts: unknown/missing required rejected. Why: §4 strict contract.
9. **`validate_applies_precedence_defaults_lt_file_lt_env`** — Asserts: per-field, `env` overrides `file` overrides `defaults` in the merged result. Why: §15 precedence.
10. **`validate_throws_field_identifying_error_on_invalid`** — Asserts: a merged config with e.g. `maxPopulation:-1` throws an error whose message names the offending path. Why: §15 fail-fast, clear error.
11. **`validate_returns_typed_runconfig_on_valid`** — Asserts: a valid merge returns a `RunConfig` (parses clean). Why: §15 happy path.
12. **`validate_is_pure_no_io`** — Asserts: `validateRunConfig` operates only on its `sources` arg (no file/env read) — e.g. setting an env var that isn't in `sources` has no effect on the result. Why: §9 purity / boundary-loads principle.
13. **`schema_snapshot_caps_config_subtype_sets`** *(spec §4/§2.5)* — Asserts: `RunCaps` field-set (6) + `RunConfig` field-set (6) + `Subtype` member-set (2) equal frozen snapshots. Why: §2.5 cross-track regression gate.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** NEW — `RunCaps`, `RunConfig` (and the shared `Subtype` union; `Subtype` is folded into the `CandidateIdea` row in Appendix A but is defined canonically here).
- **§2.5-seam model touched?** **YES** — `RunCaps`/`RunConfig` are `Shared across tracks: yes`. The RED outline MUST include the schema-snapshot test (#13).
- **Orchestrator doc rows to write hot:** add `RunCaps §4/§5` + `RunConfig §4` rows to the `apps/api/CLAUDE.md` cross-doc table; note `Subtype` as the shared union defined in P0.3 (consumed by P0.5). Appendix A already carries the `RunConfig`/`RunCaps` row — no arch edit unless GREEN surfaces a shape drift.

## Things to flag at Step 2.5
1. **Config-validation purity — pure(sources) vs reads-file/env.** My default vote: **pure** — `validateRunConfig({defaults, file, env})` merges + validates; the boot layer (P1) reads the file + `process.env` and passes them in. Rationale: `packages/contracts` is env-less by design (§9), exactly the layering the P0.2 redaction env-value escalation established — keep IO at the boundary.
2. **`Subtype` placement.** My default vote: **define it here** (`src/domain/subtype.ts`), P0.5 imports it. Single-source-of-truth (a redefinition in P0.5 risks divergence). Adds one file beyond the plan's P0.3 list (flagged above).
3. **`seed` vs `rngSeed` — types + roles.** My default vote: `rngSeed` = **`z.number().int().nonnegative()`** (the deterministic PRNG seed, §4 replay); `seed` = **`z.string().min(1)`** (the run/problem-scenario seed, distinct from the RNG seed; same field the `Run` entity carries in P0.15). Flag if the kernel PRNG (P3) will want a string `rngSeed` instead.
4. **Cap bounds — positive only vs positive + upper sanity ceiling.** My default vote: **positive integer, no upper ceiling for MVP** (`z.number().int().positive()`); "bounded" = bounded-below by positivity. Upper sanity caps (fat-finger guard) can be added later. Flag if you want generous `.max()` ceilings now.
5. **`enabledSubtypes` constraints.** My default vote: **`z.array(Subtype).min(1)`** (≥1 enabled); no schema-level uniqueness (runtime can dedupe). Flag if you want `.refine` uniqueness.
6. **`modelProfile` / `scoringPolicyVersion` types.** My default vote: both **`z.string().min(1)`** (a named profile id / a policy-version string — `scoringPolicyVersion` ties to `ScoringPolicy.version` in P0.8). Flag if numeric versions are preferred.
7. **Commit count.** My default vote: **1** — `RunCaps` + `RunConfig` + `Subtype` + `validateRunConfig` are one cohesive config contract unit; no safety-mechanism enforcement here (the schema's positivity check is not the kernel cap enforcement, which is P3). Commit: `feat(contracts): RunConfig/RunCaps + Subtype + boot config-validation (P0.3)`.

## Dependencies + sequencing
- **Depends on:** none (independent; defines `Subtype` for later slices).
- **Blocks:** P0.5 (`CandidateIdea.subtype` imports `Subtype`); P0.15 (`Run` carries `caps: RunCaps` + `seed`/`enabledSubtypes`); P1 boot (calls `validateRunConfig`); P3 kernel (enforces `RunCaps`).

## Estimated commit count
**1** — cohesive config contract unit; not a safety-invariant slice (schema-level cap positivity ≠ kernel cap enforcement, which lands in P3 as its own safety slice).

## Lessons-logged candidates anticipated
- **Convention candidate** — "Contract validators are pure over loaded sources; IO (file/env reads) lives at the boot/infra boundary, never in `packages/contracts`" (generalizes the redaction env-value + config-validation layering into one rule).
- **Convention candidate** — "A union shared by ≥2 models is defined once in its own module and imported, never redefined per model" (`Subtype`).
- **Architecture-doc note candidate** — confirm §15 names `validateRunConfig` + the `defaults < file < env` precedence as the canonical boot-validation entry.

## How to invoke
1. **Read this brief end-to-end** (session already oriented — no `/session-start`). Don't skip the Step-2.5 questions (Q1 purity + Q2 `Subtype` placement are the load-bearing ones).
2. **Run `/tdd run_config_caps_and_validation`.**
3. **Step 0/1** — confirm restatement + file list (note the added `subtype.ts`).
4. **Step 2.5** — send the test-design write-up + answers to the 7 questions. Wait for `APPROVED.`/`TWEAK:`/`ADD:`.
5. **Step 9** — categorized flags + ship-ask.
