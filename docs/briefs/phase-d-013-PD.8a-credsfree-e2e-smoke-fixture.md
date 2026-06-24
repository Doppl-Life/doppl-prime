# /tdd brief — credsfree_e2e_demo_smoke_and_fixture_capture

## Feature
PD.8a (PD.8, slice 1 of 2) — the **creds-free end-to-end proof** the user asked for, plus its hard prerequisite. (1) **Capture + commit the real demo fixture**: drive a full demo run to a run-terminal via the existing loop-capable recorded gateway (no provider creds) → `dump-replay` → commit `fixtures/replay/<runId>.json` (today `fixtures/replay/` holds only `.gitkeep`, so `seed-demo` has nothing to load — this closes that gap). (2) **Automated creds-free e2e smoke** (§16): boot the real stack (migrate → seed the committed fixture → start) against a **real Postgres + RECORDED gateway** (NO creds) → the seeded run reconstructs to a **run-terminal** + the **final-idea projection** resolves (selected-winner lineage node + its candidate) — asserting the demo-of-record pipeline end-to-end. (3) **§16 config-boot smoke**: config (registry/scoring/caps/problem-sets) Zod-loads-and-validates + required env is fail-fast checked at boot. Real PG, NO mocks on the load-bearing path, NO creds. The web final-idea RENDER is already covered by the P7.15 `dashboard-smoke.spec.ts` (cite, don't duplicate).

## Use case + traceability
- **Task ID:** PD.8 (slice a — the creds-free proof + fixture; PD.8b authors the runbook + .env.example + remaining rehearsals)
- **Architecture sections it implements:** `ARCHITECTURE.md §16` (demo rehearsals — prepared-run + config-boot smoke; reuse existing safety tests, never weaken), `ARCHITECTURE.md §17` (local-first boot sequence migrate→seed→start + prepared-replay pipeline), `ARCHITECTURE.md §4` (replay state-equivalence — reconstruct from the persisted log, zero provider calls), `ARCHITECTURE.md §15` (Zod config validation + fail-fast env at boot). Api impl home territory (`apps/api/`).
- **USER DELIVERABLE (lead-relayed, 2026-06-23 — explicit acceptance):** the **automated creds-free end-to-end smoke** (#3) — boot the real stack (migrate→seed→start) against real PG + RECORDED gateway (no creds) → drive the recorded/replay path → ASSERT the pipeline reaches a terminal + the final-idea surface renders. Must run in-slice (test-first, real PG) AND be invokable from the runbook as a documented command (the runbook lands in PD.8b and references this command). **Flag the lead at Step-2.5** (the user is invested in this deliverable's shape).
- **Related context — what EXISTS (build on, don't rebuild):**
  - `apps/api/src/event-store/scripts/dump-replay.ts` — `dumpReplayToFile` / `buildReplayFixture`: read-only export of a run-TERMINAL run's events → `fixtures/replay/<runId>.json`, THROUGH `replayEvents` validation (`isRunTerminal` dump-eligibility; imports NO provider seam — rule #7; payloads already scrubbed — rule #4).
  - `apps/api/src/event-store/scripts/seed-demo.ts` — `seedDemo` / `buildSeedPlan`: loads a committed fixture into `run_events` AFTER migrations via a direct insert preserving the recorded `(sequence, occurredAt)`; idempotent (`onConflictDoNothing` on `unique(run_id,sequence)`); schemaVersion-gated `≤ current` (fail-fast re-record if newer); re-validated through `replayEvents` before any insert.
  - `apps/api/test/integration/boot/main-boot.test.ts` (22.6K) — the EXISTING real-PG boot integration harness that drives a run to a run-terminal creds-free (a bespoke loop-capable multi-role fake gateway; `runWorker` + `crashForward`). PD.8a's capture + e2e smoke EXTEND/MIRROR this harness — don't invent a new one.
  - `apps/api/src/main.ts` — the boot entry (PD.3 boot-spine `f330475`: `crashForward` AWAITED before listen + `POST /runs → createStartRun`; NOTE the tracker's planned `apps/api/scripts/boot-demo.ts` was realized in `main.ts` — path drift, build against `main.ts`). The replay reader + lineage/current-state projections (P1.8/P6) reconstruct the final-idea data from the log.
  - `apps/api/src/runtime/config/{loadConfig,envSchema}.ts` — the authoritative closed env→config allowlist + Zod config validation (the config-boot smoke asserts against THIS; PD.8b single-sources `.env.example` from it).
- **Known cross-area carry-forward (governs Step-2.5 Q1):** `createFakeGateway`'s `population_generator` + `final_judge` ROLE_FIXTUREs are loop-INCOMPATIBLE (stale), so it can't drive the generation loop alone — every loop-driving test injects a bespoke multi-role fake (the `main-boot` pattern). The fixture-capture must use that loop-capable fake (creds-free), NOT `createFakeGateway` as-is, AND NOT the live gateway (no creds in CI). Fixing the shared fixtures is OUT of scope (gateway-stub/selection territory — carry-forward).

## Acceptance criteria (what "done" means)
- [ ] **A real demo fixture is committed** at `fixtures/replay/<runId>.json` — produced by driving a full demo run to a run-terminal via the loop-capable recorded fake (no creds) and `dump-replay`; the artifact records its pinned `schemaVersion` and carries the persisted RNG seed / outcomes / vectors verbatim (replay-determinism inputs preserved); contains NO secret (already scrubbed at append — rule #4).
- [ ] The committed fixture's run reaches a **run-terminal** (`run.completed`/`failed`/`stopped`) and produces a **selected-winner** lineage node (so the final-idea surface has a winner to show) — i.e. it's a defensible demo-of-record, not an empty run.
- [ ] **Creds-free e2e smoke** (NEW, real PG, RECORDED gateway, NO provider keys set): boots migrate → `seedDemo`(committed fixture) → start; asserts (a) the seeded run is **run-terminal** via the replay reader, (b) the **final-idea projection resolves** — a `status:'selected'` candidate lineage node + its candidate is fetchable (the data the §12 panel renders), (c) reconstruction calls **NO** model/embedding/web provider (rule #7 — replay-determinism; structural: the replay path imports no provider seam).
- [ ] **Replay state-equivalence**: the projection rebuilt from the seeded fixture equals the projection at the original run's end over the canonical serialization (§4) — the seed→replay round-trips identically (no gaps/reorders; `sequence` sole ordering).
- [ ] **§16 config-boot smoke** (NEW): `loadConfig`/`validateRunConfig` over the real config sources loads + Zod-validates (registry/scoring/caps/problem-sets); a **missing/invalid required env** (e.g. absent `DATABASE_URL`) **fails fast at boot** with a clear key-naming error BEFORE the worker serves; Langfuse absence degrades cleanly (local trace metadata retained) and never blocks boot.
- [ ] The e2e smoke is **invokable as a documented command** (a package.json script, e.g. `pnpm -C apps/api test:smoke:demo` or a tagged vitest) so PD.8b's runbook can reference it.
- [ ] **Reuses existing invariant/safety tests; weakens none** (§16) — the smoke is additive; it does not replace cap-enforcement / replay-equivalence / redaction tests.
- [ ] All new tests pass against **real Postgres** (Docker harness, the project's integration pattern); `/preflight` clean; `pnpm audit --prod` unaffected.

## Wiring / entry point (Step 7.5)
The e2e smoke drives the REAL boot path: `main.ts` boot (migrate → `seedDemo` → start) + the replay reader + the lineage/current-state projections — the same code the demo runs, not a test-only path. The capture uses `dumpReplayToFile` against a run produced through `runWorker` (the production worker) driven by the loop-capable fake. Confirm at Step 7.5 that the smoke exercises the production boot entry (`main.ts`/`composeRuntime`), not a bespoke re-implementation, and that the committed fixture is loaded by the real `seedDemo`.

## Files expected to touch
**New:**
- `fixtures/replay/<runId>.json` — the committed demo fixture (the capture artifact).
- `apps/api/test/integration/<area>/demo-e2e-smoke.test.ts` — the creds-free boot→seed→replay→assert-terminal+final-idea smoke (real PG, recorded gateway). *(Place under `test/integration/boot/` or a new `demo/` — Step-2.5 Q3.)*
- `apps/api/test/integration/<area>/config-boot-smoke.test.ts` — the §16 config-loads-and-validates + fail-fast-env smoke. *(Or fold into the demo-e2e smoke file — Step-2.5 Q3.)*
- *(maybe)* `apps/api/runtime/demo/rehearsals/` scaffold IF the smoke is authored as a rehearsal module (Step-2.5 Q2); else a plain integration test.
- A tiny capture harness/script IF the fixture isn't producible from an existing test path (Step-2.5 Q1).

**Modified:**
- `apps/api/package.json` — a documented smoke script (`test:smoke:demo` or similar) the runbook references.
- *(maybe)* `apps/api/src/event-store/scripts/seed-demo.ts` — ONLY if seeding a default/committed fixture path needs a tiny convenience entry (flag at Step-2.5 if so; prefer leaving the script as-is and pointing it at the committed artifact).

If implementation needs files beyond this list (e.g. the loop-capable fake must be extracted to a shared test util), **flag at Step 2.5**.

## RED test outline (Step 2)
Integration (real PG) — `demo-e2e-smoke.test.ts`:
1. **`boot_seed_replay_reaches_terminal`** — boot migrate→seed(committed fixture)→start with the RECORDED gateway + NO provider env → the seeded run is run-terminal via the replay reader. Why: §17/§16 demo-of-record; creds-free.
2. **`final_idea_projection_resolves`** — the seeded run's lineage projection has a `status:'selected'` candidate node + the candidate is fetchable (the §12 panel's data). Why: §12/§17 — the proof surface has a winner.
3. **`replay_calls_no_provider`** — the boot→seed→replay path performs NO model/embedding/web call (structural: no provider seam imported on the replay path; assert via the recorded-gateway call-count = 0 / no live deps). Why: rule #7 (replay-determinism).
4. **`replay_state_equivalence`** — projection rebuilt from the fixture == projection at the original run end (canonical serialization). Why: §4 replay-equivalence.

Integration — `config-boot-smoke.test.ts`:
5. **`config_loads_and_validates`** — `loadConfig`/`validateRunConfig` over real sources → valid config (registry/scoring/caps/problem-sets). Why: §15.
6. **`missing_required_env_fails_fast`** — boot with an absent required env (e.g. `DATABASE_URL`) → fail-fast error naming the key, BEFORE serving. Why: §15 fail-fast.
7. **`langfuse_absence_degrades_cleanly`** — boot with Langfuse vars absent → boot completes, local trace metadata retained, never blocks. Why: §13/§17 local-first.

Capture (in-slice, one-time — produces the committed artifact; assert it's well-formed):
8. **`captured_fixture_is_terminal_and_validatable`** — the committed fixture loads through `replayEvents` without `ReplayIntegrityError` + is run-terminal + has a selected winner. Why: PD.1 dump-eligibility + the fixture is demo-worthy.

> NO mocks on the load-bearing path (real PG). The recorded gateway is the ONLY double, and only to keep the run creds-free + deterministic (it stands in for providers, which replay never calls anyway).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** ZERO new contract surface — composes existing scripts (`dump-replay`/`seed-demo`), the real boot (`main.ts`), the replay reader, and existing projections; no new event type, no new Appendix-A model, no new route.
- **Orchestrator doc rows to write hot (Step 9 routing):** likely an **Architecture-doc note** (§16/§17): the creds-free demo-of-record e2e smoke + the committed fixture exist; the boot→seed→replay path is CI-asserted creds-free. **Possible carry-forward:** if the capture needed the loop-capable fake extracted to a shared util, note it. **No cross-doc invariant row** (no model field changed).
- **§2.5-seam (shared-contract) model touched?** No.

## Things to flag at Step 2.5
1. **Fixture-capture gateway path (load-bearing).** The committed fixture needs a full run to terminal, creds-free. Options: (a) drive it via the existing **loop-capable bespoke multi-role fake** (the `main-boot.test.ts` pattern) → `dump-replay` → commit; (b) a one-time **live** capture (creds) committed once, thereafter pure replay. My default vote: **(a) loop-capable fake** — fully creds-free + CI-reproducible + no provider dependency; the stale shared `createFakeGateway` fixtures stay OUT of scope (carry-forward). Confirm the bespoke fake reaches a SELECTED winner (not just terminal) so the final-idea surface is non-empty.
2. **Smoke as a `rehearsals/` module or a plain integration test?** The tracker names `apps/api/runtime/demo/rehearsals/*.rehearsal.ts`. My default vote: **a plain integration test** under `test/integration/` (it's a real-PG assertion; the `rehearsals/` naming is a PD.8b concern for the operator-facing scripts) — unless a `rehearsals/` module that's BOTH a test AND a runbook-invokable command is cleaner (then co-locate). Keep it CI-gating + creds-free.
3. **One smoke file or two (demo-e2e + config-boot)?** Default: **two files** (distinct concerns — pipeline vs config/env), both creds-free, both CI-gating. Fold if the setup is heavily shared.
4. **`final-idea surface renders` — api projection assertion + cite the web e2e, or a Playwright-against-real-backend?** My default vote: **assert the final-idea PROJECTION resolves (api integration, creds-free, CI-able)** + cite the existing `dashboard-smoke.spec.ts` for the React render (it already drives the mounted panel). A full Playwright-against-real-backend is heavier + flakier for CI; keep the creds-free smoke at the api/projection tier (the render is separately covered).

## Dependencies + sequencing
- **Depends on:** PD.1 (`dump-replay`), PD.2 (`seed-demo`), PD.3 (boot spine in `main.ts`) — all landed; PD.7 (the final-idea projection the smoke asserts resolves) — landed `1277cd1`; the `main-boot.test.ts` harness.
- **Blocks:** PD.8b (the DEMO_RUNBOOK references this smoke as a documented command + the committed fixture; the remaining §16 rehearsals build on the same harness). PD.8a + PD.8b both precede `/phase-exit PD`.

## Estimated commit count
**2.** (1) the committed fixture + the capture path; (2) the creds-free e2e smoke + the config-boot smoke + the package.json script. Bundle-able into 1 if the capture is a thin test-path artifact (Step-2.5). Non-safety (additive tests + a data artifact; reuses existing invariant tests, weakens none). NOT bundled with PD.8b (docs/.env are a separate slice).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the creds-free demo-of-record e2e seeds a committed replay fixture + boots the REAL stack (migrate→seed→start) against real PG + recorded gateway, asserting terminal + final-idea projection — replay calls no provider (rule #7), so it needs no keys; the fixture is captured once via the loop-capable fake."
- **Architecture-doc note candidate** — §16/§17: the committed fixture + the creds-free CI smoke close the prepared-replay pipeline end-to-end.
- **Future TODO — operational** — re-record the committed fixture on a `schemaVersion` bump (§17 — never upcast); the runbook (PD.8b) documents the re-record command.

## How to invoke
1. Read this brief end-to-end — especially Step-2.5 Q1 (fixture-capture gateway path) + Q4 (where the e2e asserts).
2. Run `/tdd credsfree_e2e_demo_smoke_and_fixture_capture` in the implementer session (`apps/api` hat; real-PG integration — Docker harness).
3. Step 0 (Restate) — confirm the creds-free + real-PG + no-mocks-on-load-bearing-path framing.
4. **Step 2.5 — send me the test design; I FLAG THE LEAD** (the user is invested in this deliverable — per the lead's instruction). Take defaults or ping back.
5. Step 9 — categorized flags + ship-ask; note if the capture forced any shared-util extraction.
