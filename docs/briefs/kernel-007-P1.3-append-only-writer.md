# /tdd brief — append_only_event_writer

## Feature
The single authoritative append path for `run_events` (key safety rule #2): one transactional `append(envelope)` that, inside ONE transaction, validates the envelope against the frozen `RunEventEnvelope` schema + the per-type payload narrowing/ceiling, runs the P1.2 secret-redaction scrub, allocates a per-run monotonic gapless `sequence` (serialized so concurrent same-run appends can't collide while cross-run appends don't contend), and inserts — relying on the P1.4 append-only trigger + `unique(run_id, sequence)`. The writer exposes only append + a read-ordered-by-`(run_id, sequence)`; it never updates or deletes. This completes the event-store chain (and the freeze bundle).

## Use case + traceability
- **Task ID:** P1.3 (append-only event writer — per-run monotonic sequence + schema-validated, redaction-scrubbed transactional append)
- **Architecture sections it implements:** `ARCHITECTURE.md §4` (per-run `sequence` is the sole ordering key — monotonic and gapless; `occurredAt` DB-stamped UTC, never ordering; schema-validated append), `ARCHITECTURE.md §14` (the secret-redaction scrub runs on the real before-append path; the write is the sole authoritative path — rule #2/#4)
- **Related context:** consumes the frozen `RunEventEnvelope` (P0.1) + `validateEventPayload`/`enforcePayloadCeiling` (P0.10) + the P1.2 `scrubEventPayload` (`ec3a549` event-store/redaction.ts) + the P1.4 `run_events` schema/trigger/unique-constraint (`ec3a549`). The landed `run_events` columns: `id, run_id, generation_id?, agenome_id?, candidate_id?, type, sequence, occurred_at (timestamptz defaultNow), …, payload (jsonb), schema_version` (mirrors the 14-field envelope); `uniqueIndex(run_id, sequence)` + `index(run_id)`. **Integration slice** on the testcontainers harness (P1.4). **Safety-invariant (rule #2/#4)** → solo commit + security-reviewer fan-out at Step 8. **Four carry-forwards converge here** (see Acceptance).

## Acceptance criteria (what "done" means)
- [ ] `append(envelope)` validates the envelope against the frozen `RunEventEnvelope` schema INSIDE the same transaction as the insert; a schema-invalid envelope is rejected and **nothing is written**
- [ ] `sequence` is **per-run monotonic + gapless**, assigned/enforced server-side; a write that reuses or skips a run's sequence is rejected (the `unique(run_id, sequence)` constraint + the allocator) — `sequence` is the sole ordering key
- [ ] **Concurrent same-run appends serialize** (no two events get the same sequence, no gap) while **cross-run appends do not contend** (independent sequences) — see Step-2.5 Q1 (advisory-lock mechanism)
- [ ] **§14 scrub-before-insert (carry-forward reachability pin):** every payload passes through the P1.2 `scrubEventPayload` BEFORE the insert on the REAL append path — an unscrubbed payload (incl. an over-persisted raw output / an opaque gateway passthrough `output?`/`schema?`) cannot reach the table
- [ ] **Payload-ceiling (carry-forward):** the append path calls `validateEventPayload` (per-type narrow + size/depth ceiling) before insert; on `{ok:false}` the oversized/ill-shaped payload is NOT silently appended (see Step-2.5 Q3 for who emits the violation event)
- [ ] **IDs-opaque (carry-forward):** `run_id` (and all id fields) are treated as untrusted bytes — parameterized in every query, never concatenated into SQL (Drizzle parameterizes; confirm no raw-string interpolation of an id)
- [ ] `occurred_at` is the Postgres append-stamped UTC value (DB default), NOT caller-supplied, and is never used for ordering
- [ ] The writer exposes ONLY append + read-ordered-by-`(run_id, sequence)`; it never updates or deletes an existing row (the write is the sole authoritative path)
- [ ] Integration tests (testcontainers, real PG) pass; both counts reported (unit + integration); `/preflight` clean

## Wiring / entry point (Step 7.5)
`append()` (exported from `apps/api/src/event-store/index.ts`) is the sole authoritative write path — its first consumer is the **P3 runtime kernel** (every lifecycle event is appended through it). The read-ordered-by-sequence is consumed by **P1.8 (replay reader)** + projections (P6). So: `first consumer — P3 runtime (appends every event); the ordered reader feeds P1.8 replay + P6 projections`. Exercised now against the testcontainers PG. (Note: the full app-boot wiring — the kernel calling `append` on the live loop — lands in P3; the upstream Fastify `bodyLimit` byte-gate that should precede the ceiling check is a **P6 route-layer** requirement, named here, not built in this slice.)

## Files expected to touch
**New:**
- `apps/api/src/event-store/append.ts` — the transactional `append(envelope)` (validate + ceiling + scrub + sequence + insert, one txn)
- `apps/api/src/event-store/sequence.ts` — per-run sequence allocation + same-run serialization (Q1)
- `apps/api/src/event-store/index.ts` — event-store barrel: `append` + the ordered reader (+ re-export schema/migrate as the area surface grows)
- `apps/api/test/integration/event-store/append.test.ts` — testcontainers (real PG)

**Modified:** none expected (consumes the landed redaction.ts/schema.ts; if `append` needs a helper from them, import — don't duplicate)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Integration tests in `apps/api/test/integration/event-store/append.test.ts` (testcontainers; `spec(§4)`/`spec(§14)`):

1. **`test_schema_invalid_envelope_rejected_nothing_written`** — an envelope failing `RunEventEnvelope` is rejected; the row count is unchanged (validation in the same txn). Why: §4 schema-validated append.
2. **`test_sequence_monotonic_gapless_per_run`** — sequential appends for a run get `0,1,2,…` gapless. Why: §4 sole ordering key.
3. **`test_duplicate_or_skipped_sequence_rejected`** — a forced duplicate `(run_id, sequence)` is rejected (constraint). Why: §4 monotonic uniqueness.
4. **`test_concurrent_same_run_appends_serialize`** — N concurrent appends for one run yield N distinct consecutive sequences (no dup, no gap). Why: §4 same-run serialize (Q1).
5. **`test_cross_run_appends_independent`** — concurrent appends for different runs each get their own `0,1,…` and don't block each other. Why: §4 cross-run no contention.
6. **`test_scrub_runs_before_insert`** — an envelope payload containing a loaded secret value (incl. nested / as a key) is persisted scrubbed (the secret is absent from the stored row). Why: §14/rule #4 scrub-before-append reachability pin.
7. **`test_occurred_at_db_stamped_not_caller`** — a caller-supplied `occurredAt` does not override the DB-stamped value; ordering ignores it. Why: §4 occurredAt DB-stamped.
8. **`test_payload_ceiling_rejected_before_append`** — an over-size/over-depth payload (`validateEventPayload {ok:false}`) is not silently appended (handled per Q3). Why: payload-ceiling carry-forward.
9. **`test_run_id_is_parameterized`** — a `run_id` containing SQL metacharacters is stored literally with no injection effect. Why: IDs-opaque carry-forward.
10. **`test_writer_has_no_update_or_delete`** — the writer's surface offers only append + ordered read (no mutate path). Why: §4/rule #2 sole authoritative append.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none (consumes frozen `RunEventEnvelope` + the landed schema; mirrors, redefines nothing).
- **Orchestrator doc rows to write hot (Step 9):** a likely **LESSONS** entry (the transactional validate→ceiling→scrub→allocate→insert order + the advisory-lock sequence allocator). The carry-forward items consumed here (IDs-opaque, payload-ceiling-P1, §14-redaction, gateway-passthrough-scrub) become **DELETE candidates** at `/orchestrate-end` once P1.3 lands — I'll triage them.
- **Shared-contract seam model touched?** No.

## Things to flag at Step 2.5
1. **Sequence allocation + same-run serialization.** My default vote: **`pg_advisory_xact_lock(hashtext(run_id))`** at the start of the append txn → `SELECT max(sequence)+1` → insert; the lock serializes same-run appends and releases at txn end, and different `run_id`s hash to different locks so cross-run appends don't contend. Alternatives: insert-with-`unique`-conflict + retry loop (livelock-prone under contention) or `SERIALIZABLE` isolation (broader contention). Vote: **advisory xact lock**.
2. **Validate / ceiling / scrub order in the txn.** My default vote: validate envelope (P1.1) → `validateEventPayload` (narrow + ceiling) → `scrubEventPayload` (P1.2) → allocate sequence → insert — all in one txn. The scrub is structure-preserving (LESSONS 3) so no re-validate after it. Flag if you'd run the ceiling on the post-scrub payload (scrub can only shrink/equal size, so pre-scrub ceiling is a safe upper bound + rejects oversized before the scrub does work).
3. **Payload-ceiling `{ok:false}` handling — who emits the violation event.** The carry-forward says "emit a violation event on `{ok:false}`." My default vote: the **writer REJECTS** the oversized/ill-shaped append (returns a typed `{ok:false, reason}` / throws a typed error) and the **caller (P3 kernel) emits** the appropriate failure event — the writer stays a pure mechanism (append/read) and doesn't invent event semantics (consistent with "the kernel is the sole authoritative emitter", §3/§5). Confirm: writer-rejects-caller-emits vs writer-appends-a-violation-marker.
4. **Scope of the read in this slice.** My default vote: P1.3 exposes a **basic read-ordered-by-`(run_id, sequence)`** (an async iterator/array); the full **replay reader** (state-equivalence, schemaVersion≤current, no-provider-calls) is **P1.8** — don't pull replay semantics forward. Flag the boundary.

## Dependencies + sequencing
- **Depends on:** P0.1 (`RunEventEnvelope`), P0.10 (`validateEventPayload`), P1.2 (`scrubEventPayload`, `ec3a549`), P1.4 (`run_events` schema/trigger/unique + testcontainers harness, `ec3a549`).
- **Blocks:** P1.7 (evidence resolver reads persisted rows), P1.8 (replay reader builds on the ordered read), P3 (the kernel appends every event through this). **Completes the event-store chain → with the gateway chain already green, the freeze bundle is ready.**

## Estimated commit count
**1.** Safety-invariant slice (rule #2 append-only authoritative write + rule #4 scrub-before-append). OWN commit, never bundled; **security-reviewer fan-out at Step 8** (focus: the scrub actually runs before every insert; sequence can't collide under concurrency; the writer has no mutate path; ids parameterized).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the authoritative append path is one transaction: validate (schema + per-type narrow + ceiling) → scrub → advisory-lock-serialized sequence allocation → insert; same-run serialization via `pg_advisory_xact_lock(hashtext(run_id))` (cross-run independent); the writer exposes only append + ordered-read, never a mutate path."
- **Architecture-doc note candidate** — possibly a §4 note pinning the advisory-lock allocation mechanism, if the implementer judges it load-bearing for replay determinism.

## How to invoke
1. **Read this brief end-to-end** — safety-invariant (rule #2/#4): own commit + Step-8 security-reviewer; integration slice (testcontainers, harness from P1.4).
2. **Run `/tdd append_only_event_writer`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 4 design questions (esp. Q1 allocation + Q3 ceiling-violation), send the Step-2.5 write-up.
5. **Step 8** — `security-reviewer` on the slice diff (scrub-before-insert + concurrency + no-mutate-path focus).
6. **Step 9** — surface the lesson candidate; **note this completes the event-store chain → freeze bundle ready** (I flag the lead).
