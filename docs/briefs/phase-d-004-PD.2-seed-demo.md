# /tdd brief — seed_demo_replay_fixture_loader

## Feature
The prepared-replay loader `apps/api/src/event-store/scripts/seed-demo.ts` — loads a committed `fixtures/replay/<runId>.json` (the PD.1 dump) into the demo DB AFTER migrations, inserting its `run_events` preserving the recorded per-run `sequence` + `occurredAt` exactly, idempotently. Validates `schemaVersion ≤ current` (fail-fast re-record if newer) + the event ordering (via `replayEvents`) before any insert; refuses if migrations haven't run. Closes the prepared-replay loop: dump (PD.1) → seed (this) → replay-equivalent.

## Use case + traceability
- **Task ID:** PD.2
- **Architecture sections it implements:** `ARCHITECTURE.md §17` (migrate → seed → start; re-record on schemaVersion bump, not upcast), §9 (persistence + replay reader), §4 (sequence is the SOLE ordering key), KEY SAFETY RULE #2 (append-only authoritative log — the seed is a RESTORE under the append-only trigger; INSERT-only, never UPDATE/DELETE), rule #7 (seeded data is replay-truth — reconstructs with no provider call)
- **Related context:** PD.1 dump-replay (`c8102a4`) writes the fixture this loads (round-trips against it); PD.3 completion wires this seed step between `runMigrations` and `listen`; PD.4 rung-3 serves the seeded run as a labeled replay.
- **Shipped seams this slice REUSES (do not modify):**
  - `runEvents` table — `event-store/schema.ts` — columns `{id, runId, generationId?, agenomeId?, candidateId?, type, sequence, occurredAt, actor, correlationId?, langfuseTraceId?, langfuseObservationId?, payload, schemaVersion}`; `uniqueIndex(run_id, sequence)`; the append-only trigger (hand-SQL migration) blocks UPDATE/DELETE/TRUNCATE but ALLOWS INSERT — so a direct restore-insert is legal.
  - `replayEvents(rows)` — `event-store/replay-reader.ts` — re-validate ordering (fail loud `ReplayIntegrityError` on a corrupt/tampered fixture) before insert.
  - `assertSafeRunId` (PD.1, `event-store/scripts/dump-replay.ts` — promote/share it) — path-guard the argv runId → `fixtures/replay/<runId>.json`.
  - `CURRENT_SCHEMA_VERSION` — `@doppl/contracts` — the `≤ current` gate.
  - the existing replay reader (`createReplayReader`) — the closed-loop reconstruction check (seeded run replays equivalent, zero provider calls).

## Acceptance criteria (what "done" means)
- [ ] Inserts the fixture's `run_events` preserving the recorded per-run `sequence` AND `occurredAt` EXACTLY (a direct drizzle insert — NOT the append path, which re-allocates `sequence` + stamps `occurredAt=now()`); the loaded run is identical-by-`(sequence, type, payload, occurredAt)` to the dumped run.
- [ ] Runs strictly AFTER migrations: refuses to load if the `run_events` table is absent (a clear "run migrations first" error), never a partial/cryptic failure.
- [ ] Accepts a fixture whose top-level `schemaVersion ≤ CURRENT_SCHEMA_VERSION`; a `schemaVersion > current` FAILS FAST with a clear re-record instruction (MVP policy = re-record, not upcast — §17) and inserts NOTHING.
- [ ] Idempotent / safe to re-run: re-seeding does NOT duplicate the run or corrupt sequence ordering (`onConflictDoNothing` on the unique `(run_id, sequence)`); a second seed is a clean no-op.
- [ ] Validates the fixture's event ordering via `replayEvents` BEFORE insert (a gapped/out-of-order/tampered committed fixture fails loud, never a partially-seeded corrupt run).
- [ ] The seeded run reconstructs to a valid projection via the existing replay reader with NO model/web/embedding call (loaded data is replay-truth, rule #7) — the closed-loop: dump (PD.1) → seed → replay-equivalent to the original.
- [ ] Loads ONLY from a committed `fixtures/replay/<runId>.json` (path-guarded via `assertSafeRunId`); does not fetch remotely; imports no provider seam (rule #7 structural).
- [ ] All unit + integration tests pass (integration against real Postgres); `/preflight` clean.
- [ ] Cross-doc invariant: **none** (zero new contract surface; restores existing `RunEventRow`s; no Appendix-A model).

## Wiring / entry point (Step 7.5)
A CLI/boot step run as `pnpm --filter @doppl/api seed-demo <runId>` (new `package.json` script → `tsx src/event-store/scripts/seed-demo.ts`) AND the importable `seedDemo(...)` that PD.3 completion calls between `runMigrations` and `app.listen()` (the migrate → SEED → start sequence, §17). The new code is reached by executing the script (boundary IO: read `DATABASE_URL`, build the pg pool + drizzle handle, read the fixture, insert) and by PD.3's boot. Export a testable pure core (`buildSeedPlan(fixture) → {runId, rows}`) behind the thin IO so the integration test exercises the seed without a process side effect.

## Files expected to touch
**New:**
- `apps/api/src/event-store/scripts/seed-demo.ts` — `buildSeedPlan(fixture) → {runId, rows}` (pure: assert `schemaVersion ≤ current` → re-record error if newer; `replayEvents` validate; deserialize each row's `occurredAt` ISO string → `Date`) + `seedDemo({db, dir, runId}) → SeedResult` (path-guard → read fixture → assert tables exist → buildSeedPlan → `db.insert(runEvents).values(rows).onConflictDoNothing()`) + a guarded CLI runner. Imports NO provider seam.
- `apps/api/test/unit/event-store/seed-demo.test.ts` — pure `buildSeedPlan` (schemaVersion gate, ordering validation, occurredAt parse).
- `apps/api/test/integration/event-store/seed-demo.test.ts` — real-PG: insert-preserving-sequence, idempotent re-seed, refuse-without-migrations, the dump→seed→replay round-trip.

**Modified:**
- `apps/api/package.json` — add a `seed-demo` script (reuses the `tsx` devDep).
- (possibly) `apps/api/src/event-store/scripts/dump-replay.ts` — if `assertSafeRunId` is promoted to a shared helper for both scripts (flag at Step 2.5).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline
**Unit (`test/unit/event-store/seed-demo.test.ts`):**
1. **`build_seed_plan_preserves_rows`** — `buildSeedPlan({schemaVersion, runId, events})` → `{runId, rows}` with `sequence`/`type`/`payload` intact + `occurredAt` parsed to `Date`. Why: §4 faithful restore.
2. **`build_seed_plan_rejects_schema_too_new`** — `schemaVersion > current` → throws with a re-record instruction; no rows. Why: §17 re-record-not-upcast.
3. **`build_seed_plan_accepts_schema_le_current`** — `schemaVersion == current` (and an older value) accepted. Why: §17 `≤ current`.
4. **`build_seed_plan_rejects_corrupt_order`** — gapped/out-of-order fixture events → `ReplayIntegrityError` (via `replayEvents`); no rows. Why: §4 validate-before-insert.
5. **`seed_imports_no_provider_seam`** — transitive import list bans the provider seam (`model-gateway|adapters/|openai|embedding|retrieval|web-search|fetch|node:https?|undici|Math.random`). Why: rule #7 structural.

**Integration (`test/integration/event-store/seed-demo.test.ts`, real PG):**
6. **`seed_inserts_preserving_sequence_and_occurred_at`** — seed a fixture → `run_events` rows match the fixture by `(sequence, type, payload, occurredAt)` exactly (occurredAt is the RECORDED value, not now()). Why: §4/§9 identical-by-sequence.
7. **`seed_idempotent_reseed`** — seed twice → row count unchanged, no duplicate `(run_id, sequence)`, ordering intact. Why: idempotent restore (`onConflictDoNothing`).
8. **`seed_refuses_without_migrations`** — seed against a DB with no `run_events` table → fail-fast "run migrations first"; nothing inserted. Why: §17 migrate-before-seed.
9. **`seed_round_trip_replays_equivalent`** — dump a terminal run (PD.1 `buildReplayFixture`/`dumpReplayToFile`) → seed it into a fresh DB → the replay reader reconstructs an EQUIVALENT projection, zero provider calls. Why: the closed-loop PD acceptance (dump → seed → replay-truth, rule #7).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. The seed restores existing `RunEventRow`s; no Appendix-A model defined/changed.
- **Orchestrator doc rows to write hot:** likely an `ARCHITECTURE.md §17/§9` note (seed-demo = a direct restore-insert preserving sequence/occurredAt, under the append-only INSERT-allowed trigger, idempotent, schemaVersion-gated, after-migrations-only) — I author it (routed to cody).
- **§2.5-seam model touched?** No — no frozen `packages/contracts` model; **no schema-snapshot test**.

## Things to flag at Step 2.5
1. **Insert approach.** Direct `db.insert(runEvents).values(rows).onConflictDoNothing()` preserving recorded `sequence`+`occurredAt`, vs the append path. My default vote: **direct insert** — the append path re-allocates `sequence` (advisory lock) + stamps `occurredAt=now()`, so it CAN'T restore a recorded log; a restore MUST preserve. The append-only trigger allows INSERT; `onConflictDoNothing` on `(run_id, sequence)` makes re-seed idempotent. (This is the write-path-adjacent decision — security-reviewer reviews it.)
2. **`occurredAt` deserialization.** The fixture serialized `occurredAt` as an ISO string (`toJSON`); the timestamp column needs a `Date`. My default vote: **parse each row's `occurredAt` → `new Date(...)`** in `buildSeedPlan` (deserialize at the boundary); assert the round-trip is exact (LESSON 31 toJSON-aware).
3. **Tables-exist check.** A `SELECT to_regclass('run_events')` probe vs a caught insert error. My default vote: **explicit `to_regclass` probe** → fail-fast "run migrations first" (clearer than a caught FK/relation error).
4. **Re-validate via `replayEvents` before insert.** Even though PD.1 validated at dump time, a committed fixture could be hand-edited. My default vote: **yes, re-validate** — fail loud on a tampered/corrupt fixture before any insert (cheap; a partially-seeded corrupt run is worse).
5. **`assertSafeRunId` sharing.** Promote PD.1's `assertSafeRunId` to a shared helper both scripts import, vs duplicate. My default vote: **promote to a shared helper** (`event-store/scripts/` shared util) — single-source the path guard (LESSON 5), reused by dump + seed.

## Dependencies + sequencing
- **Depends on:** PD.1 dump-replay (`c8102a4` — the fixture format + `assertSafeRunId` + `buildReplayFixture` for the round-trip test); the `runEvents` schema + the append-only trigger (P1); `replayEvents` (P1.8).
- **Blocks:** PD.3 completion (the seed step in the boot sequence); PD.4 rung-3 (labeled replay of the seeded run).

## Estimated commit count
**1.** A focused loader + its tests. **Write-path-adjacent** (a direct insert into the authoritative `run_events`) → flag for **security-reviewer (invariant policy)**: confirm it's a bounded RESTORE (idempotent, append-only-trigger-compatible INSERT-only, schemaVersion-gated, `replayEvents`-validated, committed-fixtures-only, path-guarded), NOT a rule-#2 violation. Atomic — NOT bundled (its own write-path review surface).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a replay-fixture seed is a DIRECT restore-insert preserving the recorded `(sequence, occurredAt)` (the append path re-allocates, so it can't restore); idempotent via `onConflictDoNothing` on `(run_id, sequence)`; guarded by schemaVersion-`≤-current` + `replayEvents` re-validation + after-migrations + path-guard + committed-fixtures-only; legal because the append-only trigger blocks UPDATE/DELETE but allows INSERT."
- **Architecture-doc note candidate** — pin the seed-demo restore in §17/§9 (direct insert preserving sequence/occurredAt; idempotent; schemaVersion-gated; after-migrations-only).
- **Future TODO — operational** — multi-fixture seeding (a catalog of prepared runs for the fallback ladder) is a later extension; this slice seeds one `<runId>` fixture.

## How to invoke
1. Read this brief end-to-end (5 Step-2.5 design questions, pre-loaded with my default votes).
2. Confirm cwd is the **`Capstone-phased`** worktree (`git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased branch --show-current` → `phase-d`) before any edit — same cwd gate as PD.3.
3. Run `/tdd seed_demo_replay_fixture_loader`.
4. Step 0 (Restate) → confirm against the Feature line.
5. Step 1 → confirm the file list + the direct-insert + `replayEvents`/`assertSafeRunId` reuse.
6. Step 2.5 → send the test-design write-up (asserted-invariant lines + the acceptance-bullet→test coverage map); wait for `APPROVED.`/`TWEAK:`/`ADD:` before GREEN.
7. Step 7→8 → run security-reviewer (invariant policy — the write-path restore).
8. Step 9 → surface anything beyond the anticipated lessons-logged candidates.
