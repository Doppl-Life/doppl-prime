# /tdd brief — env_example_single_sourced_with_drift_guard

## Feature
PD.8b (PD.8, slice 2 of 2), the **impl half** — author `.env.example` **single-sourced from the real boot env allowlist** (`REQUIRED_CREDENTIAL_ENV` + `ENV_ALLOWLIST` + the `main.ts` boot-orchestration vars) and pin it with a **drift-guard test**: the example lists EXACTLY the env the boot reads, every var carries a non-secret placeholder, and NO real secret value appears (rule #4). The example is the operator's authoritative env reference for the demo (both creds-free replay + live paths).

> **Companion deliverable authored by the orchestrator (NOT this slice):** `docs/DEMO_RUNBOOK.md` — the operational prose runbook (step-by-step boot→run for the creds-free replay path AND the live path; the §16 rehearsal procedures + a coverage map citing the existing automated tests). It's a deliverable/operational doc = orchestrator territory; it references this `.env.example` + the PD.8a `test:smoke:demo` command. **Scope note (orch will flag the lead):** the §16 rehearsals are delivered as RUNBOOK PROCEDURES + a coverage map over existing automated tests (PD.8a e2e + config-boot · PD.4 fallback-ladder + cap-override · P7.15 dashboard-smoke · existing replay-equivalence), NOT as duplicate `runtime/demo/rehearsals/*.rehearsal.ts` modules — the substance is already covered; standalone modules would duplicate. This slice ships only the `.env.example` + its guard.

> **Step-2.5 resolution (2026-06-23) — Langfuse OMITTED.** The impl verified there are NO `LANGFUSE_*` env vars in the repo: Langfuse is P2.8-deferred (`packages/observability` takes injected values, reads no `process.env`; not wired into boot). So "derive the Langfuse names from `packages/observability`" was an unsatisfiable premise (inventing names would mislead). **The `.env.example` + the drift-guard's closed-equality set = exactly the 3 code constants** (`REQUIRED_CREDENTIAL_ENV` ∪ `ENV_ALLOWLIST` ∪ the `main.ts` boot vars = 12 vars). The acceptance-bullet / RED-test references to Langfuse below are SUPERSEDED by this note (omitted, not asserted). PD.8a's `langfuse_absence_degrades_cleanly` already covers boot-needs-no-Langfuse; the runbook notes Langfuse is deferred. Not a scope change (Langfuse was already deferred).

## Use case + traceability
- **Task ID:** PD.8 (slice b — `.env.example` + drift-guard here; the `DEMO_RUNBOOK.md` is orchestrator-authored alongside)
- **Architecture sections it implements:** `ARCHITECTURE.md §15` (Zod config validation + the closed env→config allowlist + fail-fast env at boot), `ARCHITECTURE.md §14` (KEY SAFETY RULE #4 — secrets env-only, never echoed/persisted; `.env.example` carries placeholders only), `ARCHITECTURE.md §17` (local-first demo — the example documents the demo env), `ARCHITECTURE.md §16` (the config-boot smoke this complements — already shipped in PD.8a).
- **USER DELIVERABLE (lead-relayed):** the `.env.example` "derived from the REAL loadConfig env allowlist; every var REQUIRED/OPTIONAL + placeholders, no secrets (rule #4)." This slice delivers it + the mechanical guard that keeps it correct.
- **The authoritative env sources to single-source FROM (read these; the example must match them EXACTLY):**
  - `apps/api/src/model-gateway/registry.ts` → `REQUIRED_CREDENTIAL_ENV = ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL']` — the fail-fast-required vars (`assertProviderCredentials`).
  - `apps/api/src/runtime/config/envSchema.ts` → `ENV_ALLOWLIST` = `DOPPL_MAX_POPULATION` · `DOPPL_MAX_GENERATIONS` · `DOPPL_ENERGY_BUDGET` (→ caps) · `DOPPL_RNG_SEED` (→ runConfig) — the CLOSED config-override allowlist (optional knobs).
  - `apps/api/src/main.ts` → boot-orchestration vars: `DOPPL_GATEWAY` (default `recorded`; `live` opt-in) · `DOPPL_SEED_FIXTURE` (e.g. `demo-recorded-001`; absent → no-seed live boot) · `DOPPL_FIXTURE_DIR` (default repo `fixtures/replay/`) · `HOST` (default `0.0.0.0`) · `PORT` (default `3000`).
  - Langfuse vars (OPTIONAL — non-authoritative §13; absence degrades cleanly, pinned by PD.8a `langfuse_absence_degrades_cleanly`): derive the exact names from `packages/observability` (single-source — do NOT invent names); mark OPTIONAL.
- **Related context:** PD.8a (`phase-d-013`) shipped the creds-free smoke + `fixtures/replay/demo-recorded-001.json` + `test:smoke:demo`/`capture:demo-fixture` scripts. The runbook references those; this `.env.example` documents the env they need (incl. `DOPPL_SEED_FIXTURE=demo-recorded-001` for the replay path).

## Acceptance criteria (what "done" means)
- [ ] `.env.example` exists (repo root — confirm location at Step-2.5 Q1) listing **every** env the boot reads: the 3 required credentials, the 4 `ENV_ALLOWLIST` knobs, the 5 `main.ts` boot-orchestration vars, and the OPTIONAL Langfuse vars — each with a **non-secret placeholder** and a one-line comment marking it **REQUIRED** or **OPTIONAL** (+ default where one exists).
- [ ] **No real secret value** appears anywhere in `.env.example` (rule #4) — credential vars carry an obvious placeholder (e.g. `OPENROUTER_API_KEY=sk-REPLACE_ME` / `…=changeme`), never a real-looking key.
- [ ] **Drift-guard test** (deterministic, unit): parse `.env.example`'s keys and assert the set **equals** `REQUIRED_CREDENTIAL_ENV ∪ ENV_ALLOWLIST.map(e=>e.envVar) ∪ {the main.ts boot vars}` — imported FROM the code (not a hand-copied literal), so a future allowlist add/remove **fails the test** until `.env.example` is updated (single-source enforcement). Langfuse vars are asserted present-and-optional but excluded from the closed-equality set if they're not a code constant (assert as a documented superset — Step-2.5 Q2).
- [ ] **Rule-#4 test**: every credential var in `.env.example` has a placeholder value that is NOT a real secret (assert the value matches an obvious-placeholder pattern; assert no value would pass an entropy/real-key heuristic). Belt-and-suspenders for the no-secrets guarantee.
- [ ] All new tests pass; `/preflight` clean.

## Wiring / entry point (Step 7.5)
none — wiring lands in no slice. `.env.example` is operator-facing documentation consumed by a human setting up the demo (the boot reads `process.env`, which the operator populates from this example); the drift-guard test is the mechanical link to the code allowlist (it imports `REQUIRED_CREDENTIAL_ENV`/`ENV_ALLOWLIST` so the example can't silently drift). No production code path imports `.env.example`. (This is the legitimate "no runtime wiring — it's a documented config artifact + its guard test" case.)

## Files expected to touch
**New:**
- `.env.example` (repo root — Step-2.5 Q1) — the single-sourced env reference (NEW root artifact; flag at Step 9 like PD.8a's `.prettierignore`/fixture — it's a new artifact, not an edit to an orch-owned doc).
- `apps/api/test/unit/config/env-example-drift.test.ts` — the drift-guard + rule-#4 placeholder tests (reads `.env.example` via a repo-relative path; imports the code allowlist constants).

**Modified:**
- *(maybe)* `apps/api/src/runtime/config/envSchema.ts` — ONLY if `ENV_ALLOWLIST` needs an exported accessor for the test to import the envVar set without duplicating it (prefer exporting a small `ENV_ALLOWLIST_VARS: readonly string[]` or reusing the existing export; flag at Step-2.5 if a new export is needed). Do NOT change the allowlist behavior.

If implementation needs files beyond this list, **flag at Step 2.5**.

## RED test outline (Step 2)
Unit — `apps/api/test/unit/config/env-example-drift.test.ts`:
1. **`env_example_lists_exactly_the_code_allowlist`** — parse `.env.example` keys; assert they EQUAL `REQUIRED_CREDENTIAL_ENV ∪ ENV_ALLOWLIST envVars ∪ {DOPPL_GATEWAY, DOPPL_SEED_FIXTURE, DOPPL_FIXTURE_DIR, HOST, PORT}` (imported/derived from code, not a literal). Why: §15 single-source — the example can't drift from the real allowlist.
2. **`env_example_credentials_are_placeholders_not_secrets`** — each `REQUIRED_CREDENTIAL_ENV` var has a value matching an obvious-placeholder pattern + failing a real-secret heuristic. Why: §14 / rule #4 — no secret in the committed example.
3. **`env_example_marks_required_vs_optional`** — every var line carries a REQUIRED/OPTIONAL marker (comment convention); the 3 credentials + `DATABASE_URL` are REQUIRED, the knobs + boot-orchestration + Langfuse are OPTIONAL. Why: operator clarity (the user's deliverable ask).
4. **`env_example_has_no_unknown_vars`** — no `.env.example` key outside the union (so a stale/typo var can't mislead the operator). Why: §15 closed allowlist (the converse of test 1).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. ZERO new contract surface.
- **Orchestrator doc rows to write hot (Step 9 routing):** likely none (an Architecture-doc note may already be covered by the §17 demo notes). The `DEMO_RUNBOOK.md` is orchestrator-authored separately.
- **§2.5-seam model touched?** No.
- **New-root-artifact flag:** `.env.example` is a new root file — flag at Step 9 (the sanctioned new-artifact exception, like PD.8a's `.prettierignore`).

## Things to flag at Step 2.5
1. **`.env.example` location** — repo root vs `apps/api/.env.example`. My default vote: **repo root** (most discoverable for an operator; the runbook points there). Confirm the boot/demo convention.
2. **Langfuse vars in the closed-equality set?** The credentials + `ENV_ALLOWLIST` + the `main.ts` vars are code constants (closed set). Langfuse vars live in `packages/observability` and are OPTIONAL/non-authoritative. My default vote: **assert Langfuse vars are present-and-marked-OPTIONAL but keep the strict closed-equality set to the code-constant vars** (so the test stays single-sourced); document Langfuse as a known optional superset. Flag if you'd rather pull the Langfuse names into a shared constant too.
3. **Exporting `ENV_ALLOWLIST` var names for the test** — if the test can't import the envVar set without a new export, add a minimal `ENV_ALLOWLIST_VARS` export (no behavior change). My default vote: **add the tiny export** (single-source the test from the code; never hand-copy the list). Flag if the existing surface already suffices.

## Dependencies + sequencing
- **Depends on:** PD.8a (`phase-d-013`, the smoke + fixture the runbook references) — shipping/shipped; the env-source code (`registry.ts`/`envSchema.ts`/`main.ts`) — all landed.
- **Blocks:** `/phase-exit PD` (the last build slice; the runbook + .env.example are the final user deliverables). The orchestrator authors `DEMO_RUNBOOK.md` in parallel; both land before `/phase-exit PD`.

## Estimated commit count
**1.** A focused slice (`.env.example` + its guard test), same concern, non-safety (additive guard + a config-doc artifact; ZERO new contract surface). Not bundled with the orch-authored runbook (different territory + different commit).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a committed `.env.example` is single-sourced from the code env allowlist (`REQUIRED_CREDENTIAL_ENV`/`ENV_ALLOWLIST`) via a drift-guard test that imports the constants — so the example can't silently drift from what boot reads, and rule #4 (no real secret in the committed example) is mechanically pinned."
- **Architecture-doc note candidate** — §15/§17: the demo env surface is exactly the closed allowlist + the boot-orchestration vars; `.env.example` documents it, guard-tested.

## How to invoke
1. Read this brief end-to-end + the three env-source files (`registry.ts`/`envSchema.ts`/`main.ts`).
2. Run `/tdd env_example_single_sourced_with_drift_guard` (`apps/api` hat; unit test).
3. Step 0 (Restate) — confirm the single-source-from-code framing + rule-#4 no-secrets.
4. Step 2.5 — answer Q1–Q3 (or defaults).
5. Step 9 — flag the new `.env.example` root artifact; note any added export.
