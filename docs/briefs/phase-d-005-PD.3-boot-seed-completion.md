# /tdd brief — boot_seed_step_and_seed_per_event_validation

## Feature
Complete the unified boot sequence (migrate → **seed** → start) by wiring the conditional `seedDemo` step into `bootApp`, AND harden `seed-demo` with per-event envelope validation at the seed boundary (the deferred PD.2 [low](b) LESSON 46 fix). When `DOPPL_SEED_FIXTURE=<runId>` is set, boot restores that committed fixture after migrations + before `crashForward`/listen; a missing/invalid fixture ABORTS boot with a clear re-record instruction; absent → the seed step is a no-op (normal live boot). This makes the seed the demo's load-bearing fallback source — so it now validates each event vs the frozen envelope (no seeding a row that would fail on read).

## Use case + traceability
- **Task ID:** PD.3 (the boot-completion portion — `migrate → seed → start`; completes PD.3, which the boot-spine `f330475` left at "migrate → [seed] → start" with the slot reserved at `main.ts:105`)
- **Architecture sections it implements:** `ARCHITECTURE.md §17` (the single migrate → seed → start boot sequence, env-parameterized; seeding failure aborts before serving), §15 (fail-fast boot config/env), §9 (persistence), §5 (crash-forward ordering), KEY SAFETY RULE #2 (no seeding a row that fails its frozen contract on read — LESSON 46-class)
- **Related context:** PD.1 dump (`c8102a4`) + PD.2 seed (`86d62de`) shipped the dump→seed pipeline; PD.3 boot-spine (`f330475`) shipped `bootApp`. This wires the seed step into `bootApp` (the line-105 reserved slot) + folds the PD.2 [low](b) hardening I elevated (a malformed committed event INSERTS via jsonb + PASSES `replayEvents` ordering-only → fails on READ = a corrupt demo run; the restore bypasses the append path's per-event validation).
- **Shipped seams this slice REUSES/EXTENDS:**
  - `bootApp(overrides)` — `main.ts` — the boot order is `loadConfig → runMigrations(106) → pool/db(110-111) → eventStore → … → crashForward(119) → buildServer → listen`. The seed step inserts AFTER `db` exists (it needs the drizzle handle) + BEFORE `crashForward` (the seeded run is TERMINAL, so crashForward skips it — clean).
  - `seedDemo({db, dir, runId})` + `buildSeedPlan(fixture)` — `event-store/scripts/seed-demo.ts` (PD.2) — the named consumer; extend `buildSeedPlan` with per-event validation.
  - `RunEventEnvelope` (+ `validateEventPayload`) — `@doppl/contracts` — the per-event validation mirroring the append path (P1.3 / LESSON 26).

## Acceptance criteria (what "done" means)
- [ ] `bootApp` runs the seed step in the FIXED order `runMigrations → seedDemo(conditional) → crashForward → listen`: the seed inserts after the `db` handle exists + before `crashForward` (the seeded terminal run is left untouched by crashForward).
- [ ] The seed step is env-gated: `DOPPL_SEED_FIXTURE=<runId>` present → `seedDemo({db, dir: fixtureDir, runId})`; absent → SKIPPED (a normal live boot seeds nothing). `fixtureDir` resolves from `DOPPL_FIXTURE_DIR` (default the repo `fixtures/replay/`); both are overridable for tests.
- [ ] A configured-but-missing/invalid fixture (file absent, `schemaVersion > current`, or a malformed event) ABORTS boot BEFORE `app.listen()` (the seedDemo throw rejects `bootApp` → the guarded runner surfaces the re-record/seed instruction + exits) — the API never serves a half-seeded demo (§17).
- [ ] **[(b) LESSON 46 hardening]** `buildSeedPlan` validates EACH event vs `RunEventEnvelope` (the full envelope incl. `sequence`/`occurredAt`) — and per-type via `validateEventPayload` — BEFORE insert, failing LOUD on a malformed event (no insert). Mirrors the append path's per-event validation that the direct restore bypasses (rule #2 — never seed a row that fails on read, LESSON 46).
- [ ] Boot completes the full demo path locally with the seeded replay run even when Langfuse / a hosted provider is unavailable (recorded gateway default; Postgres is the only authoritative boot dependency — §17). The seeded run reconstructs via the replay reader with no provider call (rule #7).
- [ ] The existing boot-spine + stop + seed tests stay green (the seed step is additive; absent `DOPPL_SEED_FIXTURE` = today's behavior).
- [ ] All unit + integration tests pass (real Postgres); `/preflight` clean.
- [ ] Cross-doc invariant: **none** (zero new contract surface; env-gated wiring + per-event validation over existing models).

## Wiring / entry point (Step 7.5)
`bootApp` (the production boot root + the `start` script) gains the conditional seed step at the `main.ts:105` reserved slot. Reached in production by `pnpm --filter @doppl/api start` with `DOPPL_SEED_FIXTURE` set (the demo boot); in tests by `bootApp({env: {…DOPPL_SEED_FIXTURE…}, fixtureDir})`. The `buildSeedPlan` validation is reached by every `seedDemo` call (CLI + boot).

## Files expected to touch
**Modified:**
- `apps/api/src/main.ts` — add the conditional seed step (after `db`, before `crashForward`); a `fixtureDir`/`seedFixtureRunId` resolved from env (`DOPPL_SEED_FIXTURE`/`DOPPL_FIXTURE_DIR`) with `BootOverrides` fields for tests. A seedDemo throw propagates (aborts boot).
- `apps/api/src/event-store/scripts/seed-demo.ts` — `buildSeedPlan` validates each event vs `RunEventEnvelope` + `validateEventPayload` before insert (fail-loud; the [low](b) LESSON 46 fix).
- `apps/api/test/integration/boot/main-boot.test.ts` — boot-with-seed-fixture / missing-fixture-aborts / no-seed-skips.
- `apps/api/test/unit/event-store/seed-demo.test.ts` — `build_seed_plan_rejects_malformed_event`.
- (possibly) a committed test fixture under `apps/api/test/fixtures/` for the boot-seed test, OR generate it in-test via PD.1 `buildReplayFixture` (flag at Step 2.5).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline
**Integration (`test/integration/boot/main-boot.test.ts`, real PG):**
1. **`boot_with_seed_fixture_loads_replayable_run`** — boot with `DOPPL_SEED_FIXTURE=<runId>` + a fixture (generated via PD.1 dump of a seeded terminal run, written to a tmp `fixtureDir`) → after boot the run is present in `run_events` (identical-by-sequence) + replay-reconstructs, zero provider calls. Why: §17 migrate→seed→start; rule #7.
2. **`boot_missing_seed_fixture_aborts_before_listen`** — `DOPPL_SEED_FIXTURE` set + the fixture file absent → `bootApp` rejects with the re-record/seed instruction; nothing listening. Why: §17 seeding-failure-aborts.
3. **`boot_no_seed_fixture_skips_seed`** — no `DOPPL_SEED_FIXTURE` → boot seeds nothing (the live path is unchanged; existing boot tests stay green). Why: additive env-gate.
4. **`boot_seed_runs_before_crash_forward`** — the seeded TERMINAL run is present + untouched after boot (crashForward left it alone — it's terminal). Why: §5 order (seed before crashForward; the seeded run is terminal).

**Unit (`test/unit/event-store/seed-demo.test.ts`):**
5. **`build_seed_plan_rejects_malformed_event`** — a fixture whose events pass `replayEvents` ordering but include one that fails `RunEventEnvelope`/`validateEventPayload` → `buildSeedPlan` throws, NO rows. Why: rule #2 / LESSON 46 — never seed a row that fails on read.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. Env-gated wiring + per-event validation over existing `RunEventEnvelope`; no Appendix-A model defined/changed.
- **Orchestrator doc rows to write hot:** the `ARCHITECTURE.md §17` boot-sequence note (migrate → seed(conditional, env-gated) → crashForward → start; seeding-failure-aborts) + the §9 seed-restore note now carries the per-event-validation line — I author it (routed to cody).
- **§2.5-seam model touched?** No — **no schema-snapshot test**.

## Things to flag at Step 2.5
1. **Seed gate + fixture-dir resolution.** `DOPPL_SEED_FIXTURE=<runId>` + `DOPPL_FIXTURE_DIR` (default repo `fixtures/replay/`), with `BootOverrides` fields for tests. My default vote: **env-gated + overridable** — matches the boot-spine's env+override pattern; absent → no-op.
2. **Seed position vs crashForward.** Seed AFTER `db` + BEFORE `crashForward` (migrate → seed → crashForward → listen). My default vote: **before crashForward** — the seeded run is terminal so crashForward is a no-op on it; keeps the plan's migrate→seed→start with crashForward as start-prep. (Either order is correct since the seeded run is terminal; before is cleaner.)
3. **[(b) validation] depth.** Per-event `RunEventEnvelope.parse` only, vs `RunEventEnvelope` + `validateEventPayload` (per-type), vs reuse the append path's exact validation chain. My default vote: **`RunEventEnvelope` + `validateEventPayload`** — mirrors the append path's per-event validation (P1.3) so a seeded row matches what a read expects (the LESSON 46 fix is complete, not just envelope-shaped). The append-time scrub already ran (no re-scrub).
4. **Test fixture source.** Generate the boot-seed test fixture in-test via PD.1 `buildReplayFixture`/`dumpReplayToFile` (a real round-trip) vs commit a static JSON. My default vote: **generate in-test** (a real dump→seed→boot round-trip; no committed fixture to maintain; the static committed demo fixture is the PD.8 artifact step).
5. **Seed failure surface.** The seedDemo throw propagates → `bootApp` rejects → the guarded runner `console.error(err.message)` + `exit(1)`. My default vote: **propagate** (fail-fast abort; seedDemo's error already names the missing fixture / schemaVersion / malformed event) — no swallow, no partial serve.

## Dependencies + sequencing
- **Depends on:** PD.3 boot-spine (`f330475` — `bootApp`), PD.1 (`c8102a4`), PD.2 (`86d62de` — `seedDemo`/`buildSeedPlan`).
- **Blocks:** PD.4 (the fallback ladder serves the seeded run as rung-3 labeled replay); PD.8 (the config-boot smoke + the real committed fixture capture).

## Estimated commit count
**1.** A bundled completion of the SAME component (the seed) for boot: the conditional boot-wiring + the per-event validation hardening (the [low](b) LESSON 46 fix — defensive validation on a demo restore tool, bundled with its boot-completion; flagged for **security-reviewer (invariant policy)** because it's rule-#2/LESSON 46-adjacent, but it's hygiene on a demo tool, not a core key-safety-rule slice). Same area, small, bisectable together.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the migrate → seed → start boot sequence makes the seed step ENV-GATED + conditional (absent → no-op live boot); a configured-but-missing/invalid fixture aborts boot before listen; the seed runs before crashForward (the seeded terminal run is untouched)."
- **Architecture-doc note candidate** — pin the completed boot sequence in §17 (migrate → seed(env-gated) → crashForward → start; seeding-failure-aborts) + the seed's per-event validation in §9 (the restore validates each event vs the frozen envelope, closing the LESSON 46 read-corruption gap).
- **Future TODO — operational** — multi-fixture / fixture-catalog seeding for the fallback ladder (PD.4) is a later extension.

## How to invoke
1. Read this brief end-to-end (5 Step-2.5 design questions, pre-loaded with my default votes).
2. Confirm cwd is the **`Capstone-phased`** worktree (`git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased branch --show-current` → `phase-d`) before any edit.
3. Run `/tdd boot_seed_step_and_seed_per_event_validation`.
4. Step 0 (Restate) → confirm against the Feature line.
5. Step 1 → confirm the file list + the `main.ts:105` seed-slot + the `buildSeedPlan` validation point.
6. Step 2.5 → send the test-design write-up; wait for `APPROVED.`/`TWEAK:`/`ADD:` before GREEN.
7. Step 7→8 → run security-reviewer (invariant — the [(b)] per-event validation / seed boot-load-bearing).
8. Step 9 → surface anything beyond the anticipated lessons-logged candidates.
