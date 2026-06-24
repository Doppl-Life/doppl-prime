# /tdd brief — api_startup_log_and_env_example_fixture_dir_fix

## Feature
PD.19 — two small boot/config demo-polish fixes, bundled: (#3) **`main.ts` logs nothing after `app.listen`** → "nothing happens" confusion; add a clear startup line. (#4) **`.env.example` `DOPPL_FIXTURE_DIR=fixtures/replay` is RELATIVE** → breaks the documented `pnpm -C apps/api start` (CWD=`apps/api` → resolves to `apps/api/fixtures/replay` → ENOENT); OMIT it (rely on the correct module-relative default) + fix the drift-guard test + the DEMO_RUNBOOK note. api/config. ZERO contract surface. Bundled (both small, non-invariant, boot/config area).

## Use case + traceability
- **Task ID:** PD.19 (demo-polish; boot/config UX)
- **Architecture sections it implements:** `ARCHITECTURE.md §17` (boot sequence / local-first demo), `§15` (cross-cutting config/env).
- **Origin:** user demo-polish round (hands-on testing, 2026-06-23 via lead) — the silent boot + the relative fixture-dir cost real debugging time.

## Acceptance criteria (what "done" means)
- [ ] **(#3 boot log)** After a successful `app.listen({host, port})`, `main.ts` emits a clear startup line (e.g. `Doppl API listening on http://<host>:<port>`) — to the existing kernel logger / console sink. Test-asserted via an injected log sink or a console spy (no real network).
- [ ] **(#4 fixture dir)** `.env.example` no longer documents a RELATIVE `DOPPL_FIXTURE_DIR` that breaks `pnpm -C apps/api start`: OMIT the var (the code's module-relative default resolves correctly from any CWD) — confirm boot with no `DOPPL_FIXTURE_DIR` seeds from the correct `fixtures/replay`.
- [ ] The drift-guard test (`env-example-drift.test.ts`) is updated so the omission passes — `DOPPL_FIXTURE_DIR` has a code default + no fail-fast boot requirement, so omitting it from the example is correct (assert it's NOT required; never silently weaken the guard's required-set check).
- [ ] DEMO_RUNBOOK §3 note updated (the fixture-dir default; no need to set it) — **orchestrator-authored** (flag at Step 9).
- [ ] `/preflight` clean (api).

## Wiring / entry point (Step 7.5)
The boot log rides the real boot path (`bootApp` after `app.listen`). The fixture-dir default is the seed path (`seedDemo` reads `DOPPL_FIXTURE_DIR ?? <module-relative default>`); omitting the env var exercises the default. Confirm a no-`DOPPL_FIXTURE_DIR` boot seeds correctly from `apps/api`'s CWD.

## Files expected to touch
**Modified:** `apps/api/src/main.ts` (the startup log after listen); `.env.example` (omit `DOPPL_FIXTURE_DIR` + comment); `apps/api/test/unit/config/env-example-drift.test.ts` (the omission passes); a boot test asserting the log line (+ optionally a no-DOPPL_FIXTURE_DIR seed-from-default test).
**Orchestrator (NOT this slice):** DEMO_RUNBOOK §3 note.

## RED test outline (Step 2)
1. **`boot_logs_listening_line`** (api) — after `app.listen`, an injected log sink/console spy receives a line containing the host:port. RED: no log emitted. Why: §17/§13 boot UX.
2. **`env_example_omits_relative_fixture_dir`** (api — drift-guard update) — `.env.example` does NOT carry a relative `DOPPL_FIXTURE_DIR`; the drift-guard asserts the example's key set matches the code allowlist with `DOPPL_FIXTURE_DIR` treated as code-defaulted/optional (not required). RED: the current example carries the relative var. Why: §15 config correctness.
3. *(optional)* **`boot_seeds_from_default_fixture_dir`** — a boot with no `DOPPL_FIXTURE_DIR` seeds from the module-relative default (no ENOENT). Why: §17 — the actual fix.

## Cross-doc invariant impact
- **Model field changes:** none. ZERO contract.
- **Orchestrator doc rows (Step 9):** DEMO_RUNBOOK §3 note (orch); possibly an apps/api LESSONS note on relative-vs-module-relative config paths (orch — convention candidate). No cross-doc invariant.

## Things to flag at Step 2.5
1. Log sink: the existing kernel logger vs plain `console.log` (use the existing observability sink if clean; the boot log is a process-stdout signal, NOT a `run_event` — rule #2). Confirm it's outside the append path.
2. `.env.example` fix: OMIT vs make-absolute — default OMIT (the module-relative default is correct + portable). Confirm the drift-guard treats `DOPPL_FIXTURE_DIR` as optional/code-defaulted (apps/api LESSON 95 single-source — don't break the guard's required-set logic).
3. Bundle confirm: #3 + #4 in one commit (both non-invariant boot/config) — or split if cleaner.

## Dependencies + sequencing
- **Depends on:** none (independent boot/config fixes).
- **Blocks:** nothing (demo-polish); pre-merge polish round.
- **Sequencing:** last polish slice (after PD.18).

## Estimated commit count
**1** (bundled boot-log + env fix). Non-safety; no security-reviewer (no invariant — a stdout log + a config-doc fix; the redaction boundary is untouched — the boot log carries host:port only, no secret).

## Lessons-logged candidates anticipated
- **Convention candidate:** "a committed `.env.example` value that's a RELATIVE path breaks the documented per-package run command (CWD-dependent); document only absolute or rely on the code's module-relative default — and the drift-guard must treat a code-defaulted var as optional, not required."

## How to invoke
1. Read this brief + `main.ts` (listen), `.env.example`, `env-example-drift.test.ts`, the seed path (`seedDemo`/`DOPPL_FIXTURE_DIR`).
2. `/tdd api_startup_log_and_env_example_fixture_dir_fix` (api hat).
3. Step 0 — confirm: a startup log line + the `.env.example` DOPPL_FIXTURE_DIR omission + the drift-guard update; ZERO contract.
4. Step 2.5 — Q1–Q3.
5. Step 9 — flag the DEMO_RUNBOOK §3 note (orch) + any LESSONS convention candidate + the bundle.
