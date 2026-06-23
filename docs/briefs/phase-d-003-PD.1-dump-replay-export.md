# /tdd brief — dump_replay_export_script

## Feature
The prepared-replay capture script `apps/api/src/event-store/scripts/dump-replay.ts` — exports a COMPLETED/terminal run's `run_events` (strictly ordered by `sequence`, validated, no gaps/reorders) to `fixtures/replay/<runId>.json` with the run's `schemaVersion` pinned. A pure read-only dump (reuses the event-store reader + `replayEvents` validator; emits no model/embedding/web calls); non-terminal runs are rejected. The committed JSON is the prepared-replay fixture PD.2 (`seed-demo`) loads — the safety-net fallback's source of truth.

## Use case + traceability
- **Task ID:** PD.1
- **Architecture sections it implements:** `ARCHITECTURE.md §16` (demo rehearsal / prepared run), §9 (persistence + replay reader), §4 (sequence is the SOLE ordering key; replay-determinism inputs persisted), KEY SAFETY RULE #7 (replay reads persisted events only — no provider call)
- **Related context:** the demo's 3-rung fallback ladder (PD.4) serves rung-3 from a prepared replay fixture; this script CAPTURES that fixture. PD.2 (`seed-demo`) loads it back; this slice is its producer (independent caller — manual/rehearsal capture vs PD.2's boot-sequence load).
- **Shipped seams this slice REUSES (do not modify):**
  - `replayEvents(rows): readonly RunEventRow[]` — `event-store/replay-reader.ts` — VALIDATES (throws `ReplayIntegrityError` `out_of_order`/`gap`/`schema_too_new`) + returns the sequence-ordered stream; **never re-sorts**. Dumping THROUGH it guarantees the fixture is the validated, gap-free, strictly-increasing-from-0 stream by construction.
  - `EventStore.readByRun(runId): RunEventRow[]` — `event-store/append.ts` — already `asc(sequence)`-ordered; the read source.
  - `isRunTerminal(log): boolean` — `runtime/worker/activeRunGuard.ts` — the 4 real run-terminal events (`RUN_TERMINALS`); the SINGLE source for "is this run dump-eligible" (matches the worker/crashForward terminal definition).
  - `CURRENT_SCHEMA_VERSION` — `@doppl/contracts`.

## Acceptance criteria (what "done" means)
- [ ] Dumps a run's `run_events` strictly ordered by `sequence` (the SOLE ordering key — NEVER `occurredAt`), validated through `replayEvents` so the written array is gap-free + strictly-increasing-from-0; a corrupt/out-of-order persisted log makes the dump FAIL LOUD (`ReplayIntegrityError`), never writes a corrupt fixture.
- [ ] Writes `fixtures/replay/<runId>.json` recording the run's `schemaVersion` (the pinned value §16 references) at the artifact top level + the runId + the ordered events.
- [ ] Reads persisted events ONLY (via `readByRun`) — emits NO model / embedding / web call (rule #7; the script imports no provider/gateway/embedding seam — structurally impossible, import-ban pinned, like LESSON 30/55).
- [ ] Persisted RNG seed, mutation/fusion outcomes, retrieval results, and embedding vectors already in the event payloads are carried VERBATIM into the artifact (replay-determinism inputs preserved, never re-sampled) — the rows are serialized as-is.
- [ ] Redaction already ran at append, so the persisted payloads carry no secret → the dumped JSON carries none; the script reads NO `process.env` secret + re-introduces none (structural — the script has no secret source).
- [ ] Export of a NON-terminal/incomplete run is REJECTED (only a run whose log `isRunTerminal` is dump-eligible) — a clear error, no file written.
- [ ] An unknown / event-less runId is rejected with a clear error (no empty fixture written).
- [ ] All unit + integration tests pass (integration against real Postgres — seed a terminal run, dump, assert the JSON); `/preflight` clean.
- [ ] Cross-doc invariant: **none** (zero new contract surface; no Appendix-A model; the fixture is a serialization of existing `RunEventRow`s, not a new model).

## Wiring / entry point (Step 7.5)
A CLI/ops script run as `pnpm --filter @doppl/api dump-replay <runId>` (new `package.json` script → `tsx src/event-store/scripts/dump-replay.ts`). The new code is reached by executing the script (boundary IO: read `DATABASE_URL` from env, build the pg pool + reader, read `runId` from argv, write the file). It is NOT wired into the server boot — it is a manual/rehearsal capture tool (the PD.8 rehearsal + the operator capture the committed fixture with it). Export a testable pure core (`buildReplayFixture(events) → ReplayFixture`) behind the thin IO runner so the integration test exercises the dump without a process side effect.

## Files expected to touch
**New:**
- `apps/api/src/event-store/scripts/dump-replay.ts` — `buildReplayFixture(events: readonly RunEventRow[], runId): ReplayFixture` (pure: `isRunTerminal` guard → `replayEvents` validate/order → pin `schemaVersion` → assemble `{schemaVersion, runId, events}`) + a thin CLI runner (`dumpReplayToFile({store, runId, dir})` does the read + `writeFile`; a guarded entry runner reads argv/env). Imports NO provider seam.
- `fixtures/replay/.gitkeep` — the committed fixtures directory (repo root `fixtures/replay/`).
- `apps/api/test/integration/event-store/dump-replay.test.ts` — real-PG: seed a terminal run, dump, assert ordering/schemaVersion/rejection.
- `apps/api/test/unit/event-store/dump-replay.test.ts` — pure `buildReplayFixture` (ordering-validated, terminal-guard, schemaVersion-pin) + the import-ban (no provider seam).

**Modified:**
- `apps/api/package.json` — add a `dump-replay` script (→ `tsx src/event-store/scripts/dump-replay.ts`). (Reuses the `tsx` devDep from PD.3 — flag at Step 9 only if anything new.)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline
**Unit (`test/unit/event-store/dump-replay.test.ts`):**
1. **`build_fixture_orders_and_pins_schema_version`** — `buildReplayFixture(terminal-run rows)` → `{schemaVersion, runId, events}` with events strictly-increasing-from-0 + `schemaVersion` = the pinned value. Why: §16/§4.
2. **`build_fixture_rejects_non_terminal`** — rows with no run-terminal event → throws (dump-ineligible). Why: §16 only-terminal-dumpable.
3. **`build_fixture_rejects_corrupt_order`** — out-of-order / gapped rows → `ReplayIntegrityError` (propagated from `replayEvents`), never a silently-resorted fixture. Why: §4 validate-not-sort.
4. **`build_fixture_rejects_empty`** — `[]` / unknown run → clear error, no fixture. Why: no-empty-fixture.
5. **`dump_imports_no_provider_seam`** — transitive import list = only `@doppl/contracts` + relative event-store modules (no gateway/embedding/web/`fetch`/`Math.random`). Why: rule #7 structural (LESSON 30/55).

**Integration (`test/integration/event-store/dump-replay.test.ts`, real PG):**
6. **`dump_terminal_run_writes_ordered_json`** — seed a terminal run (real append path), run the dump, read the file → events ordered by sequence, `schemaVersion` pinned, payloads (RNG seed / outcomes / vectors) verbatim. Why: §16/§4/§9 round-trip.
7. **`dump_rejects_non_terminal_run`** — seed `run.configured` only → dump rejects, no file. Why: §16.
8. **`dump_payloads_carry_no_secret`** — seed a run whose payload went through the append-time scrub; the dumped JSON contains no secret value. Why: rule #4 (redaction already ran; the dump re-introduces none).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. The fixture is a serialization of existing `RunEventRow`s; no Appendix-A model defined/changed.
- **Orchestrator doc rows to write hot:** likely a small `ARCHITECTURE.md §16` note (the prepared-replay fixture format: top-level `schemaVersion` + ordered events; dump validates via `replayEvents`, terminal-only) — I author it (routed to cody).
- **§2.5-seam model touched?** No — no frozen `packages/contracts` model; **no schema-snapshot test**.

## Things to flag at Step 2.5
1. **Artifact shape.** `{ schemaVersion, runId, events: RunEventRow[] }` vs `{ schemaVersion, events }`. My default vote: **`{ schemaVersion, runId, events }`** — runId for PD.2's identity + a top-level pinned `schemaVersion` PD.2 compares `≤ current`.
2. **`schemaVersion` pinning rule.** `max(rows.schemaVersion)` vs assert-uniform vs `CURRENT`. My default vote: **`max(rows.schemaVersion)`** — records the highest version any event used (uniform in practice for a single run; PD.2 fail-fasts if it's `> current` at seed time). Flag if rows are non-uniform (a single demo run shouldn't span a bump).
3. **Pure core vs IO split.** `buildReplayFixture(events, runId) → ReplayFixture` (pure: guard + validate + assemble) separate from `dumpReplayToFile({store, runId, dir})` (the read + `writeFile` IO) + a guarded argv/env runner. My default vote: **split** — pure core is unit-tested (ordering/terminal/schemaVersion), IO is integration-tested; IO at the boundary (§4; LESSON 84).
4. **Terminal-eligibility source.** Reuse `isRunTerminal(events)` (the 4 run-terminal events). My default vote: **yes** — single source matching the worker/crashForward definition (a `run.completed`/`failed`/`stopped`/`cancelled` makes it dump-eligible; `energy_exhausted` is mid-flight, NOT terminal).
5. **`occurredAt` in the dump.** Keep each row's `occurredAt` in the serialized events (it's a persisted column) but NEVER order by it. My default vote: **keep the column verbatim** (faithful row serialization) — ordering is by `sequence` only; PD.2 re-inserts preserving `sequence`, and the canonical-equivalence check is `toJSON`-aware (LESSON 31).

## Dependencies + sequencing
- **Depends on:** the event-store reader (P1), `replayEvents` (P1.8), `isRunTerminal` (P3.12) — all shipped; and a runnable demo (PD.3 boot-spine `f330475`) to produce a real run to capture (the SCRIPT is tested against synthetically-seeded runs; the real committed fixture is captured later, e.g. at PD.8 rehearsal).
- **Blocks:** PD.2 (`seed-demo` loads `fixtures/replay/<runId>.json` — round-trips against this dump); PD.3 completion (the seed step); PD.4 rung-3 (labeled replay).

## Estimated commit count
**1.** A focused read-only export script + its tests. Not a safety-invariant slice (pure read; rule #7 is satisfied structurally by the import-ban). Atomic, NOT bundled with PD.2 — PD.2 WRITES `run_events` (write-path-adjacent, its own security-reviewer surface) and has an independent caller (the boot sequence vs this manual capture tool).

## Lessons-logged candidates anticipated
- **Convention candidate** — "a replay-fixture dump goes THROUGH `replayEvents` (validate-not-sort) so a corrupt log fails loud instead of producing a silently-resorted fixture; the dump is read-only + import-bans the provider seam (rule #7 structural); the artifact pins top-level `schemaVersion` for the loader's `≤ current` gate."
- **Architecture-doc note candidate** — pin the prepared-replay fixture format in §16 (top-level `schemaVersion` + sequence-ordered events; terminal-only; dump validates via `replayEvents`).
- **Future TODO — operational** — capturing the REAL committed demo fixture (run the demo → dump → commit the JSON) is a downstream artifact step (PD.8 rehearsal / operator), not this slice.

## How to invoke
1. Read this brief end-to-end (5 Step-2.5 design questions, pre-loaded with my default votes).
2. Confirm cwd is the **`Capstone-phased`** worktree (`git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased branch --show-current` → `phase-d`) before any edit — same cwd gate as PD.3.
3. Run `/tdd dump_replay_export_script`.
4. Step 0 (Restate) → confirm against the Feature line.
5. Step 1 → confirm the file list + the `replayEvents`/`isRunTerminal` reuse.
6. Step 2.5 → send the test-design write-up (asserted-invariant lines + the acceptance-bullet→test coverage map); wait for `APPROVED.`/`TWEAK:`/`ADD:` before GREEN.
7. Step 9 → surface anything beyond the anticipated lessons-logged candidates.
