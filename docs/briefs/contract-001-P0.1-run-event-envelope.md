# /tdd brief — run_event_envelope_and_registry

## Feature

Bootstrap the greenfield `packages/contracts` pnpm workspace package (root workspace + package toolchain + `src` layout + index barrel) and freeze the first three shared contracts: the `RunEventEnvelope` (strict 14-field Zod object), the **closed** `RunEventType` registry (25 members incl. every failure/terminal type), and the **closed** 7-role `Actor` union — each with its `z.infer` TS type and a field-name-set schema-snapshot test.

## Use case + traceability

- **Task ID:** P0.1
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (contracts & event model — source of truth), §2.5 (subsystem seams / shared contracts), Appendix A (model inventory rows: `RunEventEnvelope`, `RunEventType`).
- **Related context:** This is the **forced-serial bottleneck** — Phase 0 freezes the §2.5 shared contracts before the four parallel tracks (kernel/verifier/selection/demo) fork; a field change after fork is a cross-track Finding. The monorepo is **fully greenfield** — there is NO root `package.json` / `pnpm-workspace.yaml` / `tsconfig` anywhere yet, so this slice stands up the workspace foundation that every later package copies. Safety rule #2 (the `run_events` log is append-only + authoritative — this envelope is its row shape). **RISK-006:** the closed registry must contain every §3/§5 failure/terminal type so no failure path is unrepresentable.

## Acceptance criteria (what "done" means)

**Bootstrap (greenfield toolchain — prerequisite scaffolding, not test-driven):**

- [ ] Root workspace exists: `pnpm-workspace.yaml` (globs `packages/*` + `apps/*`), root `package.json` (`private: true`; delegating scripts `lint` / `format:check` / `typecheck` / `test` / `test:unit` / `test:integration` that recurse the workspace, e.g. via `pnpm -r`), root `tsconfig.base.json` with **strict: true** plus the strict family (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`).
- [ ] `packages/contracts` package: `package.json` (name `@doppl/contracts`, `type: module`, exports → built/`src` entry, scripts `lint`/`format:check`/`typecheck`/`test`/`test:unit`), `tsconfig.json` extending the base, `vitest.config.ts`, ESLint flat config + Prettier config — such that `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test` all run green.
- [ ] `/preflight` is clean run from repo root AND from `packages/contracts`.

**Contracts:**

- [ ] `Actor` is a closed Zod enum with EXACTLY the 7 roles `operator, runtime, agenome, critic, check_runner, selection_controller, system`; parsing any other string fails (supersedes any `actor: string`). (§4)
- [ ] `RunEventType` is a closed Zod enum with EXACTLY these 25 members, and parsing any unlisted string fails (§4 / RISK-006):
      `run.configured, run.started, run.completed, run.failed, run.stopped, generation.started, generation.completed, agenome.spawned, agenome.fused, agenome.mutated, agenome.reproduced, candidate.created, critic.reviewed, check.completed, novelty.scored, fitness.scored, lineage.culled, energy.spent, provider_call_failed, output_schema_rejected, candidate_invalidated, energy_exhausted, generation_failed, reproduction_aborted_insufficient_parents, novelty_scoring_degraded`.
- [ ] `RunEventEnvelope` is a **strict** Zod object (unknown keys rejected, not stripped) carrying EXACTLY these 14 fields, with the marked required/optional split (§4 / Appendix A):
  - required: `id`, `runId`, `type: RunEventType`, `sequence`, `occurredAt`, `actor: Actor`, `payload`, `schemaVersion`
  - optional: `generationId?`, `agenomeId?`, `candidateId?`, `correlationId?`, `langfuseTraceId?`, `langfuseObservationId?`
- [ ] An envelope with an **unknown extra field** fails to parse; an envelope **missing a required field** fails to parse; a valid 14-field envelope parses and round-trips.
- [ ] `sequence` validates as an **integer ≥ 0** (per-run monotonic; the sole ordering key per §4 — single-envelope schema pins integer + non-negative only; cross-event monotonicity is a Phase-1 event-store invariant, not enforced here).
- [ ] `occurredAt` validates as an **ISO-8601 UTC datetime string** (display/analytics-only; never used for ordering, §4); a non-datetime string fails.
- [ ] `schemaVersion` is a **required positive integer** on every envelope; the package exports a `CURRENT_SCHEMA_VERSION` constant (the registry pins the current version). The "accept all `schemaVersion ≤ current`" _reader_ behavior is descriptive of Phase-1 readers and is NOT implemented in this slice (see Step-2.5 Q5).
- [ ] `payload` is the generic JSON-object shape at envelope level (per-type narrowing is layered later by P0.10).
- [ ] `z.infer` TS types for `RunEventEnvelope`, `RunEventType`, `Actor` are exported from the `src/index.ts` barrel; no model is redefined outside `packages/contracts`.
- [ ] **Schema-snapshot test (§2.5 cross-track regression gate, tagged `spec(§4)`):** the envelope's field-name set, the `RunEventType` member set, and the `Actor` member set each equal a checked-in frozen snapshot — any field/member add/remove/rename fails the test.
- [ ] All unit tests in `packages/contracts/test/` pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)

Entry point = the `@doppl/contracts` package **public surface** — `packages/contracts/src/index.ts` (the barrel). This is a pure-contract package frozen _before_ the tracks fork; there is **no runtime call path in Phase 0**. Downstream tracks (kernel/verifier/selection/demo) import these schemas after the freeze. **Reachability for a contracts package** = the symbol is re-exported from the barrel AND covered by the schema-snapshot test — not a runtime caller. `none — runtime wiring lands in the kernel track (P1+)`.

## Files expected to touch

**New (root bootstrap):**

- `pnpm-workspace.yaml` — workspace package globs.
- `package.json` — private root; delegating quality/test scripts.
- `tsconfig.base.json` — shared strict TS config.
- `eslint.config.mjs` — flat ESLint config (typescript-eslint).
- `.prettierrc` (+ `.prettierignore` if needed) — formatting config.
- `.npmrc` — pnpm settings (optional; only if a setting is needed).

**New (package):**

- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/vitest.config.ts`
- `packages/contracts/src/events/actor.ts` — `Actor` enum + `ActorRole` type.
- `packages/contracts/src/events/event-type.ts` — `RunEventType` enum + type.
- `packages/contracts/src/events/envelope.ts` — `RunEventEnvelope` strict object + type.
- `packages/contracts/src/version.ts` — `CURRENT_SCHEMA_VERSION` constant.
- `packages/contracts/src/index.ts` — barrel re-exporting the above.
- `packages/contracts/test/events/actor.test.ts`
- `packages/contracts/test/events/event-type.test.ts`
- `packages/contracts/test/events/envelope.test.ts`
- `packages/contracts/test/__schema-snapshots__/field-sets.test.ts` — the snapshot gate (frozen field-name / member sets).

**Modified:** none (greenfield).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

Tests across `packages/contracts/test/`:

1. **`actor_accepts_all_seven_roles`** — Asserts: each of the 7 roles parses. Why: §4 closed actor union.
2. **`actor_rejects_out_of_set_value`** — Asserts: `Actor.parse('hacker')` / `'admin'` throws. Why: §4 closed union supersedes `actor: string`.
3. **`event_type_accepts_every_registry_member`** — Asserts: all 25 named members parse. Why: §4 / RISK-006 — every lifecycle + failure/terminal type is representable.
4. **`event_type_rejects_unlisted_type`** — Asserts: `RunEventType.parse('run.exploded')` throws. Why: §4 closed registry.
5. **`event_type_includes_all_failure_terminal_types`** — Asserts: the 7 failure types (`provider_call_failed`, `output_schema_rejected`, `candidate_invalidated`, `energy_exhausted`, `generation_failed`, `reproduction_aborted_insufficient_parents`, `novelty_scoring_degraded`) all parse. Why: RISK-006 closure.
6. **`envelope_parses_valid_full_object`** — Asserts: a fully-populated 14-field envelope parses and the result equals the input. Why: §4 happy path.
7. **`envelope_parses_with_optionals_omitted`** — Asserts: an envelope with only the 8 required fields parses. Why: §4 optional-field set.
8. **`envelope_rejects_unknown_field`** — Asserts: adding `{ ...valid, bogus: 1 }` throws (strict object, not stripped). Why: §4 "an unknown envelope field is rejected."
9. **`envelope_rejects_missing_required_field`** — Asserts: omitting `runId` (and each required field) throws. Why: §4 required set.
10. **`envelope_rejects_non_enum_type_or_actor`** — Asserts: `type`/`actor` outside the closed sets throw. Why: §4 closed unions at the envelope boundary.
11. **`sequence_is_nonnegative_integer`** — Asserts: `1.5`, `-1`, `'3'` rejected; `0` and `42` accepted. Why: §4 sequence = per-run monotonic integer (single-envelope domain pin).
12. **`occurred_at_is_iso_utc_datetime`** — Asserts: a valid ISO-8601 UTC string accepted; `'not-a-date'` / a bare date rejected. Why: §4 occurredAt display-only string.
13. **`schema_version_required_positive_int_and_constant_exported`** — Asserts: `schemaVersion` of `0`/`-1`/`1.2` rejected, `1` accepted; `CURRENT_SCHEMA_VERSION` is a positive integer. Why: §4 schemaVersion present on every envelope; registry pins current.
14. **`barrel_exports_schemas_and_types`** — Asserts: `RunEventEnvelope`, `RunEventType`, `Actor`, `CURRENT_SCHEMA_VERSION` are importable from `@doppl/contracts` (the index barrel). Why: §2.5 single import boundary / single-source-of-truth.
15. **`schema_snapshot_field_and_member_sets`** _(tagged `spec(§4)`)_ — Asserts: envelope field-name set == frozen 14-name snapshot; `RunEventType` member set == frozen 25-member snapshot; `Actor` member set == frozen 7-member snapshot. Why: §2.5 — a mid-build field/member change is caught as a cross-track regression before tracks fork.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)

- **Model field changes:** NEW — `RunEventEnvelope`, `RunEventType` (and the `Actor` union, carried inside the envelope row) enter the codebase.
- **Orchestrator doc rows to write hot (Step-9 routing):** add rows to the `apps/api/CLAUDE.md` cross-doc invariants table for `RunEventEnvelope §4` and `RunEventType §4`. `ARCHITECTURE.md` Appendix A **already** carries both rows (verified at orient) — no arch edit needed unless GREEN surfaces a field-shape drift (then it's a Cross-doc invariant Finding). The orchestrator may also pin `CURRENT_SCHEMA_VERSION = 1` in §4 as an Architecture-doc note if the implementer requests it.
- **§2.5-seam (shared-contract) model touched?** **YES** — all three are `Shared across tracks: yes (all)`. The RED outline MUST include the schema-snapshot test (field-name / member sets == checked-in snapshot, tagged `spec(§4)`) — test #15 above. The implementer authors it in this same `/tdd` cycle; Step 2.5 reviews it like any test.

## Things to flag at Step 2.5

1. **Zod major version — v4 vs v3.** My default vote: **Zod 4 (latest stable, ≥4.0.1)**. Greenfield → no migration cost; v4 is faster, smaller, and gives the cleaner closed-contract API this package leans on: `z.enum([...])` (closed enum, rejects out-of-set), `z.strictObject({...})` (rejects unknown keys — replaces v3 `.strict()`), `z.iso.datetime()` (UTC ISO-8601 — replaces v3 `z.string().datetime()`), `z.record(z.string(), z.unknown())` (both key+value schemas required in v4). Pin the exact version in `package.json`.
2. **`id` field format — UUID vs opaque non-empty string.** My default vote: **opaque non-empty string** (`z.string().min(1)`). The contract should not force producers' id-generation strategy; correlation works on any stable string. UUID can be tightened later without breaking consumers that already emit UUIDs. (Same reasoning applies to `runId`/`generationId`/etc.)
3. **`sequence` domain — int ≥ 0 vs int ≥ 1.** My default vote: **int ≥ 0** (`z.number().int().nonnegative()`). Let the runtime/event-store choose the base value; the single-envelope contract pins integer + non-negative only. Monotonicity + sole-ordering is a Phase-1 event-store invariant, not assertable on one envelope.
4. **`payload` shape — object-map vs any-JSON.** My default vote: **object map** — `z.record(z.string(), z.unknown())`. Event payloads are objects; this stays "generic JSONB at envelope level" while P0.10 narrows per-type. (`z.unknown()` would also admit scalars/arrays, which no event uses.)
5. **`schemaVersion` reader-acceptance (`≤ current`) helper — here or Phase 1?** My default vote: **export `CURRENT_SCHEMA_VERSION` here; defer the "accept ≤ current" reader logic to Phase 1** (the replay/projection readers live there). This slice's envelope only validates `schemaVersion` is a positive integer. Acceptance bullet is written accordingly.
6. **Toolchain layout — per-package scripts + root delegation vs root-only.** My default vote: **both** — `packages/contracts/package.json` owns `lint`/`typecheck`/`test`/`format:check`; the root `package.json` delegates via `pnpm -r` so `/preflight` (which runs `pnpm lint` etc.) is green from repo root AND from the package dir. Keep ESLint/Prettier config minimal (typescript-eslint recommended + Prettier defaults) — tighten later if friction surfaces.
7. **Commit count — 1 bundled vs 2 split.** My default vote: **2** — (a) `chore(contracts): bootstrap pnpm workspace + @doppl/contracts package` (pure scaffolding, not test-driven), then (b) `feat(contracts): RunEventEnvelope + closed RunEventType registry + 7-role actor union (P0.1)` (test-driven). Keeps the bootstrap bisectable from the first real contract. Neither is a safety-mechanism commit, so the split is for clarity, not the safety-isolation rule. I author both messages at Step 9.
8. **Package name scope.** My default vote: **`@doppl/contracts`** (matches the planned `@doppl/observability` sibling). Flag if you'd prefer an unscoped name.

## Dependencies + sequencing

- **Depends on:** none (first slice of the project).
- **Blocks:** every other Phase-0 task (P0.2–P0.15 extend the same barrel + reuse this package toolchain; P0.10's payload map narrows this envelope) **and** all four downstream tracks (kernel/verifier/selection/demo) — they cannot fork until the freeze.

## Estimated commit count

**2** (see Step-2.5 Q7): one `chore` bootstrap + one `feat` for the three contracts + snapshot test. **Not** a safety-invariant slice in the own-commit sense — `RunEventEnvelope` is the truth-log _row shape_, but no append/redaction/cap/allowlist _enforcement_ lives here (those are P0.2 redaction, P0.7 allowlist, and the Phase-1 append-only writer). The split is for bisectability.

## Lessons-logged candidates anticipated

- **Convention candidate** — "Shared contract objects are `z.strictObject` (unknown keys **rejected**, never stripped); closed unions are `z.enum([...])`, each pinned by a reject-out-of-set test **and** a member-set snapshot." (Pattern every P0.2–P0.15 slice repeats.)
- **Convention candidate** — the greenfield package toolchain shape (workspace globs + `tsconfig.base.json` strict family + per-package scripts + root `pnpm -r` delegation) that P1+ packages copy.
- **Architecture-doc note candidate** — pin `CURRENT_SCHEMA_VERSION = 1` explicitly in `ARCHITECTURE.md §4` if it isn't already named there.

## How to invoke

1. **First slice of this session** → run `/session-start` (implementer) to orient, then **read this brief end-to-end** — don't skip "Things to flag at Step 2.5".
2. **Run `/tdd run_event_envelope_and_registry`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 1 (Identify files)** — confirm against "Files expected to touch" (note the greenfield bootstrap files).
5. **Step 2.5** — send the test-design write-up + answers to the 8 design questions (take defaults or push back). Wait for `APPROVED.` / `TWEAK:` / `ADD:` before GREEN.
6. **Step 9** — surface the cross-doc invariant rows + anything outside the anticipated lessons candidates.
