# /tdd brief — replay_summary_projection

## Feature
The **replay-summary projection** + **replay reader** (`apps/api`): a seed-to-summary projection built **purely from the persisted, ordered `run_events`** with **ZERO model / web / embedding calls** (KEY SAFETY RULE #7). The rebuilt projection is **state-equivalent** to the projection captured at run end over the canonical serialization (the replay-determinism contract): RNG-driven outcomes are reconstructed from the **persisted** seed (`run.configured`) + persisted reproduction/cull payloads (never re-sampled); persisted retrieval results + embedding vectors are read back from their originating events (never re-called / re-embedded); an **older-`schemaVersion` fixture** replays successfully (readers accept `schemaVersion ≤ current`). **Safety-invariant (rule #7) → solo commit + Step-8 security-reviewer.** Design-agnostic backend.

## Use case + traceability
- **Task ID:** P6.4 (replay-summary projection — state-equivalence over the persisted log, no model calls)
- **Architecture sections it implements:** `ARCHITECTURE.md §16` (the replay state-equivalence must-pass — event append + replay reconstruction incl. an older-`schemaVersion` fixture, RNG-replay determinism; REQ-T-001/003), `§9` (replay reads the persisted log; embeddings authoritative-once-computed — read back, never recomputed).
- **Related context:** **KEY SAFETY RULE #7** (replay reconstructs from the persisted per-run RNG seed + outcomes and **never calls model/embedding/web providers**) + rule #2 (derived/rebuildable). **Builds on P6.1** (`buildProjection` + the L27 `canonicalize` byte-stable serialization — reused for the state-equivalence comparison) + **P6.2** (`buildCurrentState` — the replayed events fold to the same current-state; replay is the SAME fold over the persisted log, with the explicit no-provider + persisted-value-readback contract). Reads via the event-store `readByRun` (ordered) + the P6.1 schemaVersion-≤-current gate. **This is the replay-determinism slice — authored STANDALONE, never bundled (brief-template pitfall).**

## Acceptance criteria (what "done" means)
- [ ] The replay reader reads the persisted, **ordered** `run_events` (via `readByRun` + the schemaVersion-≤-current gate) and the replay-summary builds **purely from that log** — **no `ModelGateway`/provider/embedding/web import or call** anywhere on the replay path (rule #7; structural no-import test + behavioral)
- [ ] **State-equivalence:** the replayed projection is byte-equal to the projection captured at run end over the **canonical serialization** (`canonicalize(replay) === canonicalize(captured)`) — the replay-determinism contract
- [ ] **RNG outcomes reconstructed, never re-sampled:** reproduction/cull outcomes (`ReproductionEvent.crossoverPoints`/`mutationSummary`, `CullingEvent`) are read from the **persisted payloads**, not regenerated; the run's seed is read from `run.configured`
- [ ] **Embeddings/retrieval read back, never re-called:** persisted `novelty.scored` vectors + persisted retrieval/web results are read from their originating events; replay never re-embeds or re-calls the web
- [ ] **Older-`schemaVersion` fixture replays:** a committed fixture with `schemaVersion < current` replays successfully (the reader accepts `≤ current`) and folds to a valid summary
- [ ] The replay-summary carries the seed-to-outcome digest (seed from `run.configured`, generation count, final selected candidate, fitness-over-time digest) on top of the replayed current-state
- [ ] Unit tests (in-memory + the older-schema fixture) **and** an integration test (testcontainers, real `append`/`readByRun`) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**none — wiring lands in P6.7 + PD.** The replay-summary is served by **`GET /runs/:id/replay`** (P6.7 read endpoint) and is the backbone of the **prepared-replay demo fallback** (Phase D — the dump/seed replay pipeline, §17). Exercised now against fixtures + the real `append`/`readByRun` on testcontainers. So: *first consumer — P6.7 `/replay` endpoint → PD prepared-replay fallback.*

## Files expected to touch
**New:**
- `apps/api/src/projections/replay-reader.ts` — reads the persisted ordered log (`readByRun` + schemaVersion-≤-current gate); the replay-only read surface (no providers)
- `apps/api/src/projections/replay-summary.ts` — `buildReplaySummary(replayedEvents) → ReplaySummary` (the replayed current-state + the seed-to-outcome digest), built via P6.1's fold
- `apps/api/test/unit/projections/replay-summary.test.ts` — state-equivalence + no-provider + RNG/embedding read-back + older-schema unit tests
- `apps/api/test/integration/projections/replay-summary.test.ts` — testcontainers: append a full run → replay → state-equivalent + zero provider calls
- `apps/api/test/fixtures/replay/` — a committed older-`schemaVersion` event fixture (schemaVersion 1)

**Modified:**
- `apps/api/src/projections/index.ts` — barrel export the replay surface

**Do NOT touch:** `packages/contracts/**` (frozen). If `ReplaySummary` warrants a shared contract type, flag at Step 9 (default: an `apps/api`-internal shape — see Step-2.5 Q1).

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

**Unit — `apps/api/test/unit/projections/replay-summary.test.ts`** (`spec(§16)`/`spec(§9)`):
1. **`test_replay_state_equivalent_to_captured`** — `canonicalize(replay) === canonicalize(buildCurrentState over the same log)`. Why: §16 replay determinism. *(Positive guard.)*
2. **`test_replay_reads_persisted_rng_never_resamples`** — `ReproductionEvent.crossoverPoints`/`mutationSummary` + `CullingEvent` come from the persisted payloads verbatim (not regenerated). Why: rule #7 RNG read-back.
3. **`test_replay_reads_persisted_embeddings_never_reembeds`** — `novelty.scored` vectors read back verbatim. Why: rule #7 / §9 authoritative-once-computed.
4. **`test_replay_reads_persisted_retrieval_never_recalls`** — persisted retrieval/web results read from their events (not re-fetched). Why: rule #7.
5. **`test_replay_imports_no_provider`** — structural: the replay modules import no `ModelGateway`/provider/embedding/web symbol. Why: rule #7 (the headline; positive-guarded).
6. **`test_older_schema_version_fixture_replays`** — a `schemaVersion < current` fixture replays successfully + folds to a valid summary. Why: §16 older-schema must-pass.
7. **`test_replay_summary_header`** — the summary carries seed (run.configured), generation count, final selected candidate, fitness digest. Why: seed-to-summary.

**Integration — `apps/api/test/integration/projections/replay-summary.test.ts`** (testcontainers, real PG):
8. **`test_replay_over_real_appended_log`** — append a full run's events via the real writer → replay-reader → replay-summary; assert state-equivalence to `buildCurrentState` + zero provider calls. Why: §16 over the real authoritative log.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none** unless `ReplaySummary` becomes a shared contract (default: `apps/api`-internal — Step-2.5 Q1). Reads frozen models; defines no Appendix-A model by default.
- **§2.5-seam touched?** No (default internal shape). If `ReplaySummary` is promoted to a shared contract (frontend P7 consumes `/replay`), flag at Step 9 — that's a cross-doc add the orchestrator writes.
- **Orchestrator doc rows to write hot (Step 9):** a likely **LESSONS** entry (the replay-determinism reader pattern — persisted-value read-back, no-provider, state-equivalence via L27 canonicalize, older-schema). I author hot.

## Things to flag at Step 2.5
1. **`ReplaySummary` shape + home.** My default vote: an **`apps/api`-internal** shape = the replayed `CurrentState` + a digest header (seed, generations, winner, fitness-over-time) — NOT a new frozen contract yet (the frontend reads `/replay` as a projection; promote to a shared contract only if P7 needs a pinned shape, at P6.7/P7). Flag if you'd rather define a shared `ReplaySummary` contract now.
2. **Replay-reader vs `readByRun`.** My default vote: the replay-reader **wraps `readByRun`** (the ordered read) + the schemaVersion-≤-current gate (reuse P6.1's) — a thin replay-only read surface whose contract is "persisted log only, no providers." Flag if you'd build a distinct reader.
3. **State-equivalence "captured at run end."** My default vote: since the log is the persisted truth, "captured" = `buildCurrentState` over the full log; "replay" = re-fold via the replay-reader; assert `canonicalize`-equal — the test proves the replay path is deterministic + provider-free (the persisted RNG/embedding read-back is what makes re-folding safe). Confirm this is the right equivalence (vs capturing a separate live snapshot).
4. **Older-schema fixture provenance.** My default vote: a small committed `schemaVersion:1` event fixture (hand-authored or dumped) under `test/fixtures/replay/` — enough to prove `≤ current` acceptance + a clean fold. Confirm the fixture scope (one run, a few events, schemaVersion 1).

## Dependencies + sequencing
- **Depends on:** **P6.1** (`buildProjection` + `canonicalize` — `7d2c6ec`), **P6.2** (`buildCurrentState` — `ef43fca`), the event-store `readByRun` (merged). **No live P3/P5 events needed** (fixtures via the real writer). Design-agnostic.
- **Blocks:** P6.7 (`GET /runs/:id/replay`), Phase D (prepared-replay demo fallback / dump-replay pipeline).

## Estimated commit count
**1.** **SAFETY-INVARIANT (KEY SAFETY RULE #7 — replay calls no providers).** **SOLO commit, never bundled** (replay-determinism slice — brief-template pitfall). **`security-reviewer` fan-out at Step 8 REQUIRED** (focus: ZERO provider/embedding/web import or call on the replay path; RNG/embedding/retrieval read from persisted events, never re-sampled/re-embedded/re-called; state-equivalence holds; older-schema accepted).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the replay path is the rule-#7 surface: a replay-reader over the persisted ordered log ONLY (no providers — structural no-import pin) + a summary that reconstructs RNG/embedding/retrieval outcomes from their persisted events (never re-sample/re-embed/re-call); state-equivalence is `canonicalize(replay) === canonicalize(captured)` (L27); an older-`schemaVersion` fixture must replay (≤ current gate)."
- **Architecture-doc note candidate** — possibly a §9/§16 note pinning the replay-reader as the canonical no-provider read surface, if load-bearing for PD.

## How to invoke
> The demo-observability (apps/api) implementer session is oriented — skip `/session-start`; jump to `/tdd`. cwd `apps/api/`.

1. **Read this brief end-to-end** — **safety-invariant (rule #7)**: SOLO commit + **Step-8 security-reviewer**. Standalone replay-determinism slice; integration on the real event store (testcontainers); needs a committed older-schema fixture.
2. **Run `/tdd replay_summary_projection`.**
3. **Step 0 (Restate)** — confirm the restatement matches the Feature line.
4. **Step 2.5** — answer the 4 design questions (esp. Q1 ReplaySummary home + Q3 state-equivalence), send the write-up + per-acceptance-bullet coverage map.
5. **Step 8** — `security-reviewer` on the diff (zero-provider replay path + persisted read-back focus).
6. **Step 9** — surface the LESSONS candidate; flag if `ReplaySummary` should become a shared contract.
