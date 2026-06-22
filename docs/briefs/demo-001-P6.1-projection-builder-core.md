# /tdd brief — projection_builder_core

## Feature
The demo track's projection foundation: a **generic, reducer-injected ordered-fold framework** that folds a run's `run_events` strictly by `(runId, sequence)` into a watermark-tagged projection, plus the **watermark / staleness** primitive every cached projection rebuilds against. The fold is a pure function of the persisted log (same events → byte-stable result; no model/web/embedding calls), accepts any envelope whose `schemaVersion ≤ CURRENT_SCHEMA_VERSION` and **rejects** a higher one, and surfaces a sequence **gap / non-monotonicity** as a typed error rather than a silent partial projection. This is the reusable core P6.2 (current-state), P6.3 (lineage), P6.4 (replay-summary), and the P6.7/P6.8 read endpoints build on — it ships no concrete projection itself.

## Use case + traceability
- **Task ID:** P6.1 (projection-builder core — ordered fold + (runId, sequence) watermark + staleness rebuild)
- **Architecture sections it implements:** `ARCHITECTURE.md §9` (Postgres authoritative; `run_events` append-only with per-run `sequence`; **any cached projection records the `(runId, sequence)` watermark it was built through and is discarded/rebuilt when newer events exist**; projections are derived/rebuildable, never authoritative). Grounded also in `§4` (per-run `sequence` is the **sole ordering key** — monotonic + gapless; `occurredAt` is DB-stamped display-only, never ordering; readers accept all `schemaVersion ≤ current`).
- **Related context:** key safety rules **#2** (event log append-only + authoritative; every projection derived + rebuildable, never authoritative) and **#7** (replay/projection rebuild calls NO model/embedding/web providers — reconstruct from the persisted log). Consumes the merged kernel event store: `createEventStore({db,secretValues})` → `append` + **`readByRun(runId): RunEventRow[]` ordered `asc(sequence)`** (`apps/api/src/event-store/append.ts`, the fold's read foundation) + the P1.4 testcontainers harness (`globalSetup`, real PG, unit/integration vitest split). **Integration slices run against the REAL append/readByRun (no mocks on the truth-log path).** Foundation slice — **does NOT need live P3/P5 events**; fixtures are hand-built valid envelopes appended through the real writer (or in-memory `RunEventRow[]` for the pure-fold unit tests).

## Acceptance criteria (what "done" means)
- [ ] `buildProjection` folds a run's events **strictly ordered by `(runId, sequence)`**; `occurredAt` is never consulted for ordering (shuffling `occurredAt` does not change the result)
- [ ] The fold result carries the **`(runId, sequence)` watermark** it was built through (`sequenceThrough` = the highest `sequence` folded); any cached/materialized projection record persists this watermark
- [ ] **Staleness/rebuild:** given a cached projection's watermark + the run's current max `sequence`, the projection is treated as **stale and discarded/rebuilt whenever newer events exist** (`sequence` greater than the watermark), and the served result reflects the rebuild
- [ ] **Pure + byte-stable:** folding is a pure function of the persisted log — replaying the same events yields a **byte-identical** projection over a canonical serialization (state-equivalence); the builder imports no `ModelGateway`/provider/embedding (rule #7 — no model/web/embedding calls on the rebuild path), pinned by a no-provider-import structural test
- [ ] **schemaVersion gate:** readers accept every envelope whose `schemaVersion ≤ CURRENT_SCHEMA_VERSION` and **reject (typed error, do not silently fold)** any envelope with a higher `schemaVersion` (§4)
- [ ] **Gap / non-monotonic surfaced:** a gap or non-monotonic `sequence` within a run is surfaced as a **typed error**, never a partial projection produced silently
- [ ] **IDs-opaque (carry-forward):** `runId` is treated as untrusted opaque bytes — the staleness DB helper **parameterizes** `runId` (Drizzle `eq`), never concatenates it into SQL (confirm no raw-string interpolation of an id)
- [ ] **Contract type:** the `(runId, sequence)` watermark / watermark-tagged projection-record type is added to `packages/contracts` (new file under `src/projections/`), with a **field-name schema-snapshot** test tagged `spec(§9)` (package convention, lesson §1)
- [ ] Unit tests (in-memory fixtures) **and** integration tests (testcontainers, real PG via `append`/`readByRun`) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**none — wiring lands in P6.2 + P6.7.** `buildProjection` + the watermark/staleness primitive are the framework; the **first production consumer is P6.2** (the concrete current-state projection injects its reducer), and **HTTP serving (serve-fresh-when-stale) lands in P6.7** read endpoints. So: *first consumer — P6.2 current-state reducer; the staleness rebuild is wired into the P6.7 read path.* Exercised now against the testcontainers PG via the real `append`/`readByRun` — not only from in-memory unit fixtures. (Note: the upstream Fastify `bodyLimit` request-byte gate is a **P6.6/P6.7 route-layer** requirement — named here, not built in this slice; the per-type payload-DoS ceiling already runs on the append path, P1.3.)

## Files expected to touch
**New:**
- `apps/api/src/projections/projection-builder.ts` — the generic ordered fold: `buildProjection(events, reducer, initialState)` with strict `(runId, sequence)` ordering assertion, schemaVersion gate, gap/non-monotonic detection, and the watermark-tagged result
- `apps/api/src/projections/watermark.ts` — the staleness primitive: a **pure** `isStale(watermark, latestSequence)` predicate + a thin parameterized boundary helper `latestSequence(db, runId)`
- `apps/api/src/projections/index.ts` — projections barrel (export the builder + watermark surface)
- `packages/contracts/src/projections/<watermark-or-projection-record>.ts` — the `(runId, sequence)` watermark / watermark-tagged projection-record contract type (+ re-export from `packages/contracts/src/index.ts`)
- `apps/api/test/unit/projections/projection-builder.test.ts` — pure-fold + watermark + schemaVersion + gap unit tests
- `apps/api/test/integration/projections/projection-builder.test.ts` — testcontainers (real PG) fold-over-`readByRun` + staleness rebuild
- `packages/contracts/test/__schema-snapshots__/...` (or the package's snapshot location) — field-name snapshot for the new contract type, tagged `spec(§9)`

**Modified:** none expected (consumes the merged event store + frozen contracts; **import, never redefine** — `CURRENT_SCHEMA_VERSION`, `RunEventEnvelope`, `RunEventRow`, `readByRun` all already exported).

> **Drift correction (orchestrator pre-orient):** the tracker's P6.1 file line says `packages/contracts/src/projections.ts (extended)`, but the actual layout is a **directory** `packages/contracts/src/projections/` (holding `lineage-graph.ts` from P0.13) — so the new type lands as a **new file** there, re-exported from the index. And the tracker omits `src/` in `apps/api/projections/…`; the real path is `apps/api/src/projections/…`.

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**Unit — `apps/api/test/unit/projections/projection-builder.test.ts`** (in-memory `RunEventRow[]` fixtures; `spec(§9)`/`spec(§4)`):
1. **`test_fold_orders_by_sequence_not_occurred_at`** — events presented with `occurredAt` shuffled but valid `sequence` fold to a sequence-ordered result; shuffling `occurredAt` does not change the projection. Why: §9/§4 `sequence` is the sole ordering key.
2. **`test_fold_is_pure_byte_stable`** — folding the same events twice yields a **byte-identical** canonical serialization (state-equivalence). Why: §9 derived + replayable.
3. **`test_watermark_equals_highest_sequence`** — `result.sequenceThrough` == the max `sequence` folded. Why: §9 watermark.
4. **`test_reject_higher_schema_version`** — an envelope with `schemaVersion > CURRENT_SCHEMA_VERSION` is **rejected (typed error)**, nothing silently folded; `== current` and `< current` are accepted. Why: §4 readers accept `≤ current`.
5. **`test_sequence_gap_errors`** — a gap (`0,1,3`) raises a typed error, **no partial projection**. Why: §9 gap surfaced not silent.
6. **`test_non_monotonic_sequence_errors`** — a backwards/duplicate `sequence` (`0,2,1` / `0,1,1`) raises a typed error. Why: §9 non-monotonic surfaced.
7. **`test_is_stale_true_when_newer_events`** — `isStale(watermark@5, latest=7)` is true; `latest==5` is false. Why: §9 discard/rebuild when newer events exist.
8. **`test_builder_imports_no_provider`** — structural: the projection module imports no `ModelGateway`/provider/embedding symbol (rebuild calls nothing). Why: rule #7 (no model/web/embedding on the rebuild path).

**Integration — `apps/api/test/integration/projections/projection-builder.test.ts`** (testcontainers, real PG):
9. **`test_fold_over_real_read_by_run`** — append N valid envelopes via the **real** writer, `readByRun`, fold → `sequenceThrough == N-1`, ordering correct. Why: §9 fold over the real authoritative log (no mock on the truth path).
10. **`test_stale_then_rebuild_reflects_new_events`** — fold at watermark k; append more events; `isStale` true; rebuild → the served result reflects the new events. Why: §9 stale-discard-rebuild.
11. **`test_run_id_parameterized_opaque`** — a `runId` containing SQL metacharacters flows through `latestSequence(db, runId)` literally with no injection effect. Why: IDs-opaque carry-forward.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none to a frozen Appendix-A model.** This slice ADDS a new `packages/contracts` type (the watermark / watermark-tagged projection-record). It does not touch `RunEventEnvelope`/`LineageGraphProjection`/any frozen model.
- **§2.5-seam (shared-contract) model touched?** **No.** The watermark type is demo-track-local (no other track produces/consumes it) — so it carries a **convention** field-name snapshot (lesson §1, every contract type has one), **not** the mandatory §2.5-seam snapshot. (The actual seam model `LineageGraphProjection` is P6.3.)
- **Orchestrator doc rows to write hot (Step 9):** likely a new **`apps/api/CLAUDE.md` cross-doc row** for the new projection-watermark contract type once consumed, and possibly an **`ARCHITECTURE.md` Appendix A** row if we treat the watermark/projection-record as a first-class projection contract — I'll author hot. A likely **LESSONS** entry (the generic ordered-fold + watermark/staleness pattern). I'll triage.

## Things to flag at Step 2.5
1. **Generic framework vs concrete projection.** My default vote: **generic, reducer-injected fold framework** (`buildProjection(events, reducer, init)`) + the watermark/staleness primitive — the reusable core P6.2/6.3/6.4 build on; the **concrete current-state projection over the 9 tables is P6.2**, not this slice. Mirrors the P1.3 "pure mechanism, no invented semantics" posture. Flag if you'd rather P6.1 ship a first concrete projection.
2. **Staleness fetch — builder-queries vs injected.** My default vote: a **pure `isStale(watermark, latestSequence)` predicate** + a thin parameterized boundary helper `latestSequence(db, runId)` (`SELECT max(sequence) WHERE run_id = $1`). The decision stays pure/unit-testable; the one-line DB fetch is integration-tested. Flag if you'd fold the fetch into the builder.
3. **Canonical serialization for byte-stable equivalence.** My default vote: **deterministic JSON with recursively sorted object keys** as the canonical form for the state-equivalence comparison (and the fold produces deterministic structures). Flag if you'd prefer a content hash or a different canonical form.
4. **Ordering posture — assert vs silently re-sort.** My default vote: the builder is **defensive but does NOT silently re-sort** — `readByRun` already returns `asc(sequence)`, so the builder asserts strict consecutive monotonic ordering (`seq_n == seq_{n-1}+1`) and **errors** on a violation (acceptance: gap/non-monotonic surfaced). Silently re-sorting would mask a producer/reader bug (lesson §6 spirit — surface it). Confirm **assert-not-resort**.
5. **Gap-detection baseline.** My default vote: baseline = the run's **first observed `sequence`** (a full-run fold naturally starts at 0), then require strict `+1` consecutive — so a future **windowed/resume** fold (a cursor start for P6.7 events / P6.9 SSE resume) is supportable without forcing a 0 start now. Flag the windowed-resume boundary as a P6.7/P6.9 concern (named, deferred).
6. **Where the watermark contract type lives.** My default vote: **`packages/contracts/src/projections/`** — `sequenceThrough` already lives there (in `lineage-graph.ts`), and the watermark is a shared read-shape the frontend sees via the API. Convention field-name snapshot `spec(§9)`. Flag if you'd keep it `apps/api`-local instead.

## Dependencies + sequencing
- **Depends on:** P1.3 (`readByRun` ordered read — merged), P1.4 (testcontainers harness — merged), P0.1 (`RunEventEnvelope` + `CURRENT_SCHEMA_VERSION` — frozen). **No live P3/P5 events needed** (fixtures built through the real writer).
- **Blocks:** P6.2 (current-state — injects its reducer into this framework), P6.3 (lineage — same), P6.4 (replay-summary — same), P6.7/P6.8 (read endpoints — serve fresh-when-stale via the watermark). This is the demo-track read-side foundation.

## Estimated commit count
**1.** Feature foundation (the generic fold framework + its contract type) — one logical unit, one commit. **Not a safety-invariant slice** (read-side derived projection; the rule-#7-adjacent "no provider calls" property is structural, pinned by the no-import test in RED #8). **Step-8 reviewers:** security-reviewer policy = `invariant` → not mandatory here (no rule #1–#9 is newly *implemented* in this slice); run it only if you judge the no-provider/append-only-read posture invariant-touching. code-quality-reviewer = `phase-boundary` → not per-slice.

## Lessons-logged candidates anticipated
- **Convention candidate** — "a projection is a **pure ordered fold over `(runId, sequence)`** producing a watermark-tagged, **byte-stable** result; the builder **asserts strict consecutive monotonic ordering** + **rejects `schemaVersion > current`** (never silently folds or re-sorts); **staleness = a pure predicate** over `(watermark, latestSequence)`, the DB max-sequence fetch a thin parameterized boundary helper; the rebuild path imports no provider (rule #7)."
- **Architecture-doc note candidate** — a §9 note pinning the **canonical-serialization form** used for state-equivalence, if the implementer judges it load-bearing for replay byte-stability (P6.4 will reuse it).
- **Future TODO — operational** — windowed/resume fold from a baseline `sequence` (for the P6.7 events cursor + P6.9 SSE resume) — named, deferred to those slices.

## How to invoke
> Implementer session is being stood up for the demo track — this is its **first** slice, so `/session-start` is appropriate before `/tdd`. Subsequent slices in the round skip straight to `/tdd`.

1. **Read this brief end-to-end** — don't skip "Things to flag at Step 2.5" (6 design questions; defaults pre-voted). Foundation slice; integration tests run against the **real** event store on testcontainers (no mocks on the truth-log path).
2. **Run `/tdd projection_builder_core`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 1 (Identify files)** — note the two drift corrections (real `src/projections/` path; contract type is a new file under `src/projections/`, not `projections.ts`).
5. **Step 2.5** — answer the 6 design questions (esp. Q1 framework-vs-concrete + Q4 assert-not-resort), send the Step-2.5 write-up with the per-acceptance-bullet coverage map.
6. **Step 9** — surface the LESSONS candidate + any cross-doc row for the new contract type.
