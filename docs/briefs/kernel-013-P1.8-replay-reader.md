# /tdd brief — replay_reader

## Feature
The replay reader + canonical-serialization primitive: reconstruct a run's state from the persisted `run_events` log, **strictly ordered by `(run_id, sequence)`**, accepting `schemaVersion ≤ current` (rejecting newer), **detecting any gap / out-of-order** rather than silently producing a wrong projection, and performing **NO model/embedding/web call** (rule #7 — structural, per lesson 30). State-equivalence — the projection rebuilt from the log equals the one captured at run end — is asserted over a **deterministic canonical serialization**. The reader is generic over the fold (the P6 projection builders supply the real reducers later).

## Use case + traceability
- **Task ID:** P1.8
- **Architecture sections it implements:** `ARCHITECTURE.md §9` (persistence & projections — replay reader; canonical projection set), §4 (replay-determinism contract: state-equivalence over a canonical serialization; `sequence` sole ordering key; `schemaVersion ≤ current` reader-acceptance), §14 (no external call on the replay path).
- **Consumed frozen contract (Phase 0):** `RunEventEnvelope` + `CURRENT_SCHEMA_VERSION` (exported `=2`) — `@doppl/contracts` (P0.1 + P0.1-amend). The reader consumes these; never redefines them.
- **Related context:** builds on P1.3 (`createEventStore().readByRun(runId)` → ordered `RunEventRow[]`; P1.3 guarantees monotonic gapless `sequence` per run — the reader DEFENDS against a corrupted log on top of that) and P1.4 (the migration chain). **Directly applies lesson 30** (replay-safety by construction — the reader imports no provider/model/web seam, so rule #7 holds structurally). Replay-determinism = §4 "the demo's safety net" (line ~196): the seed-to-summary fixture is a recorded-event replay, not a live re-run.

## Acceptance criteria (what "done" means)
- [ ] `replayEvents(rows)` validates + yields a run's events **strictly by `sequence`** (never `occurredAt`): given rows whose `occurredAt` order differs from `sequence` order, the `sequence` order wins.
- [ ] A **gap** in the stored sequence (e.g. 0,1,3) → throws a typed `ReplayIntegrityError{ reason: 'gap' }`; the reader does NOT silently re-sort or skip (a corrupted authoritative log fails LOUD).
- [ ] An **out-of-order** sequence (e.g. 0,2,1) → throws `ReplayIntegrityError{ reason: 'out_of_order' }`.
- [ ] The reader accepts every envelope with `schemaVersion ≤ CURRENT_SCHEMA_VERSION` (an older-`schemaVersion` fixture replays **without upcasters**) and rejects `schemaVersion > current` → `ReplayIntegrityError{ reason: 'schema_too_new' }`.
- [ ] `replayRun(rows, fold, initial)` folds the validated ordered stream into a state — **generic over the fold** (P6 projection builders inject their real reducers); the reader supplies the ordered/validated stream, not a specific projection.
- [ ] Replay performs **NO** model / embedding / web call and reads only the persisted rows — **structural** (the module imports no provider/gateway/embedding/web seam — lesson 30; verify by the import list), so replay is deterministic and reproducible (rule #7).
- [ ] Replay is **read-only**: the input rows are not mutated; no append/insert/update/re-stamp occurs.
- [ ] `canonicalSerialize(state)` is a deterministic stable serialization — **recursive key-sort, array order preserved** — so two content-equal states (any key insertion order) serialize identically; state-equivalence is `canonicalSerialize(rebuilt) === canonicalSerialize(captured)`.
- [ ] **State-equivalence (integration, real PG):** append N events via `createEventStore().append`, `readByRun`, `replayRun(rows, fold)` → its canonical serialization equals the same fold applied at "run end"; assert ordered + no provider call.
- [ ] All unit tests in `apps/api/test/unit/event-store/{replay-reader,canonical-serialization}.test.ts` pass; the integration test in `apps/api/test/integration/event-store/replay.test.ts` passes.
- [ ] `/preflight` clean (unit only — Docker-free, lesson 25); integration via `test:integration`.

## Wiring / entry point (Step 7.5)
**none — wiring lands in later phases.** Reachable now via `createEventStore().readByRun` (P1.3) → `replayRun`. First consumers: **P6** projection builders (inject their real current-state / lineage folds into `replayRun`) + the **PD** replay-fallback demo (the recorded-event seed-to-summary replay). Per lesson 20 explicit-deferral: first-impl path (P1.3 store → reader) + first-consumers (P6 + PD) named as real tasks — no tested-but-unwired silent gap.

## Files expected to touch
**New:**
- `apps/api/src/event-store/replay-reader.ts` — `replayEvents` (validated ordered stream) + `replayRun` (generic fold) + `ReplayIntegrityError` (+ optional thin `createReplayReader(store)` async wrapper — see Q1).
- `apps/api/src/event-store/canonical-serialization.ts` — `canonicalSerialize`.
- `apps/api/test/unit/event-store/replay-reader.test.ts`
- `apps/api/test/unit/event-store/canonical-serialization.test.ts`
- `apps/api/test/integration/event-store/replay.test.ts` (testcontainers — real PG round-trip, lesson 25)

**Modified:**
- `apps/api/src/event-store/index.ts` — export the reader + serialization surface.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
`apps/api/test/unit/event-store/replay-reader.test.ts`:
1. **`replay_yields_events_ordered_by_sequence`** — rows whose `occurredAt` order ≠ `sequence` order.
   - Asserts: yielded order follows `sequence`, not `occurredAt`.
   - Why: §4/§9 — `sequence` is the sole ordering key.
2. **`replay_detects_gap_throws`** — sequence 0,1,3.
   - Asserts: throws `ReplayIntegrityError{reason:'gap'}`; no silent skip/re-sort.
   - Why: never produce a silently-wrong projection.
3. **`replay_detects_out_of_order_throws`** — sequence 0,2,1.
   - Asserts: throws `ReplayIntegrityError{reason:'out_of_order'}`.
   - Why: same integrity guarantee.
4. **`replay_accepts_schema_version_le_current`** — an envelope with `schemaVersion` 1 (< current 2).
   - Asserts: replays fine, no upcaster invoked.
   - Why: `schemaVersion ≤ current` reader-acceptance (older fixture replays).
5. **`replay_rejects_schema_version_gt_current`** — `schemaVersion` = `CURRENT_SCHEMA_VERSION + 1`.
   - Asserts: throws `ReplayIntegrityError{reason:'schema_too_new'}`.
   - Why: reject events newer than the reader understands (fail loud, don't misread).
6. **`replay_run_state_equivalence`** — fold a representative log with a deterministic reducer.
   - Asserts: `canonicalSerialize(replayRun(log, fold, init)) === canonicalSerialize(liveFold(log))`.
   - Why: §4 replay-determinism — rebuilt == captured.
7. **`replay_deterministic_no_external_seam`** — replay the same log twice.
   - Asserts: identical result; (structural) the module imports no provider/gateway/embedding/web symbol.
   - Why: rule #7 — replay-safety by construction (lesson 30).
8. **`replay_is_read_only`** — frozen input rows.
   - Asserts: rows not mutated; no insert/append/update path touched.
   - Why: replay never mutates/re-stamps historical events.

`apps/api/test/unit/event-store/canonical-serialization.test.ts`:
9. **`canonical_serialize_key_order_independent`** — two objects, same content, different key insertion order.
   - Asserts: identical serialization.
   - Why: state-equivalence needs a stable canonical form.
10. **`canonical_serialize_preserves_array_order`** — arrays in different orders serialize differently.
    - Asserts: array order is significant (events are ordered).
    - Why: ordering is semantic.
11. **`canonical_serialize_deterministic_nested`** — nested objects/arrays/primitives, serialized twice.
    - Asserts: stable + identical across calls; handles arbitrary JSONB payload.
    - Why: determinism over the event payload.

`apps/api/test/integration/event-store/replay.test.ts` (real PG, testcontainers):
12. **`replay_round_trip_state_equivalence_real_pg`** — append a small ordered event log via `createEventStore().append`, `readByRun`, `replayRun(rows, fold)`.
    - Asserts: canonical serialization equals the fold applied as the events were appended ("run end"); yielded order is by sequence; no provider call.
    - Why: replay asserts state-equivalence from the PERSISTED log (no mocks on the load-bearing path — brief-template pitfall + lesson 25).

> **Positive-guard discipline (lesson 10):** each throw/reject test leads with a positive happy-path guard.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **NONE.** Consumes frozen `RunEventEnvelope` + `CURRENT_SCHEMA_VERSION` (P0.1); `ReplayIntegrityError` + `canonicalSerialize` output are adapter-local.
- **Orchestrator doc rows to write hot:** none required. Possible **Architecture-doc note** (§9) — the `ReplayIntegrityError` taxonomy (`gap`/`out_of_order`/`schema_too_new`) + the validate-not-sort + canonical-serialization mechanism; orchestrator writes at `/orchestrate-end` if Step 9 surfaces it.
- **§2.5-seam model touched?** No — consumes `RunEventEnvelope` (no extend/define). Tests assert against the frozen schema/constant (consumer-agreement); no new schema-snapshot owned.

## Things to flag at Step 2.5
1. **Reader surface — pure core + thin async wrapper?** My default vote: **pure `replayEvents(rows)` + `replayRun(rows, fold, init)` core + a thin `createReplayReader(store)`** (`readByRun`-then-replay). The pure core is the load-bearing rule-#7 unit (lesson 30); the wrapper is caller ergonomics. Mirror the P1.7 resolver shape.
2. **Gap / out-of-order / schema_too_new — throw vs result-object?** My default vote: **throw a typed `ReplayIntegrityError{reason}`** — a corrupted authoritative log is an integrity violation, NOT expected control flow (unlike `AppendError`, which the kernel handles as an expected reject). "Surfaces as an error" (acceptance) reads as throw; replay must never return a silently-wrong projection.
3. **Validate-not-sort vs re-sort the input?** My default vote: **validate, never re-sort** — `readByRun` already orders by `sequence`; if the reader silently re-sorted, it would MASK a corrupted log. The reader asserts the order is gapless/monotonic and throws otherwise. (Test 1 feeds a sequence-correct-but-occurredAt-scrambled set to prove it keys on `sequence`, not that it sorts arbitrary input.)
4. **`canonicalSerialize` — bespoke recursive sorter vs a sorted-replacer `JSON.stringify`?** My default vote: **a recursive key-sort serializer** (sorts object keys, preserves array order, stable primitives) — explicit + testable; avoids `JSON.stringify` replacer edge cases. Pin determinism with the nested test.
5. **Expected starting `sequence` — 0 or 1?** My default vote: **0** (P1.3/lesson 26 allocate `COALESCE(MAX+1, 0)` → first event is `sequence 0`); the reader expects the run's first row at `sequence 0` and contiguous thereafter. Confirm against P1.3 before pinning the gap test.

## Dependencies + sequencing
- **Depends on:** P0.1 (`RunEventEnvelope` + `CURRENT_SCHEMA_VERSION`) ✓ · P1.1 ✓ · P1.3 (event store `append`/`readByRun` + `RunEventRow` + the gapless-sequence guarantee) ✓ · P1.4 (migration chain — for the integration test's real PG) ✓.
- **Blocks:** P6 projection builders (inject real folds into `replayRun`) · PD replay-fallback demo (recorded-event seed-to-summary replay).

## Estimated commit count
**1 — SOLO, never bundled.** Replay-determinism safety slice (rule #7 — replay reconstructs from the persisted log with no provider call; state-equivalence). Per the brief-template pitfall ("Replay-determinism slices are authored standalone, never bundled with feature work") + root `CLAUDE.md`. security-reviewer fires (invariant) — review the import list (no provider seam — lesson 30), the gap/out-of-order/schema integrity gates, and read-only-ness.

## Lessons-logged candidates anticipated
- **Convention candidate** — "the replay reader VALIDATES-not-sorts the stored order (throws `ReplayIntegrityError` on gap/out-of-order/schema_too_new — never silently re-sorts or skips a corrupted authoritative log); state-equivalence is asserted via a stable canonical serialization; rule #7 is structural (no provider seam — extends lesson 30)."
- **Architecture-doc note (§9)** — the `ReplayIntegrityError` taxonomy + validate-not-sort + canonical-serialization state-equivalence mechanism.

## How to invoke
1. **Read this brief end-to-end** — don't skip "Things to flag at Step 2.5"; Q2 (throw on integrity violation) + Q3 (validate-not-sort) + Q5 (sequence starts at 0) are the shapers; confirm Q5 against P1.3.
2. **Run `/tdd replay_reader`** in the (warm) implementer session.
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 1 (Identify files)** — confirm the file list (note the integration test + testcontainers).
5. **Step 2.5 (test-design review)** — send the per-test `Asserts: <invariant> (§anchor)` write-up + the acceptance-bullet coverage map; take defaults or ping back.
6. **Step 9 (summarize)** — surface anything beyond the anticipated lessons-logged candidates.
