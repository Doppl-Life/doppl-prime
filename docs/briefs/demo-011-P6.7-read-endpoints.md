# /tdd brief — read_endpoints

## Feature
The REST **read surface** (the natural bundle) registered on the P6.6 Fastify server: `GET /runs` (list), `GET /runs/:id` (current-state), `GET /runs/:id/events` (ordered + resume cursor), `GET /runs/:id/lineage` (LineageGraphProjection), `GET /runs/:id/replay` (replay summary), `GET /runs/:id/candidates/:cid` (candidate projection + its evidenceRefs), `GET /model-routes` (configured ModelRoute set). All are **read-only** (never mutate authoritative state), serve a **freshly-rebuilt projection** (the P6.1–P6.4 builders fold over `readByRun`), and return a **clean 404** for an unknown runId/candidateId (never a partial/empty success).

## Use case + traceability
- **Task ID:** P6.7 (read endpoints)
- **Architecture sections it implements:** `ARCHITECTURE.md §11` (the GET read surface + SSE; events resume from a `lastEventId`/`sequence` cursor; polling fallback), `§9` (serve freshly-rebuilt projections; the `(runId,sequence)` watermark/staleness).
- **Related context:** key safety rule **#2** (reads are derived/read-only; never mutate). **Registers on the P6.6 `buildServer` Fastify instance** (`034d587`). Serves the projections: P6.2 current-state, P6.3 LineageGraphProjection, P6.4 replay-summary, all folded over the event-store `readByRun`. Consumes `ModelRoute` (P0.11). **Cross-track deps (flagged):** GET /runs needs a **list-run-ids reader** (the event store is per-run only — see Q1); GET /candidates evidenceRefs **full resolution is P1.7** (kernel, unmerged) — this slice returns the refs **as stored** (see Q4). Integration via testcontainers + Fastify `inject`.

## Acceptance criteria (what "done" means)
- [ ] `GET /runs` lists runs (id + a current-state summary) via a list-run-ids reader; `GET /runs/:id` returns the run's current-state projection
- [ ] `GET /runs/:id/events` returns events **ordered by sequence** and supports **resume from a `?since=<sequence>` cursor** (numeric-guarded; returns events with sequence > since)
- [ ] `GET /runs/:id/lineage` returns the `LineageGraphProjection` (with `sequenceThrough`, P6.3); `GET /runs/:id/replay` returns the replay summary (P6.4)
- [ ] `GET /runs/:id/candidates/:cid` returns the candidate projection including its `evidenceRefs` (resolving **within the Postgres tier**; full dereference is P1.7 — returned as stored if P1.7 is unmerged)
- [ ] `GET /model-routes` returns the configured `ModelRoute` set (roles incl. retrieval/final_judge, capability flags, fallbackRouteIds)
- [ ] All read endpoints are **read-only** (never mutate authoritative state; no event append, no projection write) and serve a **freshly-rebuilt** projection (MVP: rebuild-on-read = always fresh; cache+staleness deferred — see Q2)
- [ ] An unknown runId/candidateId yields a **clean 404 not-found** (not a partial/empty 200)
- [ ] Integration tests (testcontainers + Fastify `inject`) pass; **both counts reported**; `/preflight` clean

## Wiring / entry point (Step 7.5)
**Entry point — the P6.6 Fastify server** (these routes register on `buildServer`). First consumers: the dashboard data-client (P7.1 `runClient` — at integration) + the SSE stream (P6.9 builds on this read surface). So: *registered on the P6.6 server; consumed by the P7 dashboard + P6.9 SSE at integration.*

## Files expected to touch
**New:**
- `apps/api/src/routes/runs-read.ts` — the GET /runs* read routes
- `apps/api/src/routes/model-routes.ts` — GET /model-routes
- a **list-run-ids reader** (Q1 — e.g. extend the event-store read surface or a projections helper: `listRunIds()` = distinct run_id)
- `apps/api/test/integration/routes/runs-read.test.ts` (+ unit where pure)

**Modified:**
- `apps/api/src/server.ts` — register the read routes on `buildServer`

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)
Integration (`apps/api/test/integration/routes/runs-read.test.ts`, testcontainers + Fastify `inject`; `spec(§11)`/`spec(§9)`):
1. **`test_get_runs_lists_runs`** — `GET /runs` lists appended runs (id + summary). *(Positive guard.)* Why: §11.
2. **`test_get_run_by_id_current_state`** — `GET /runs/:id` returns the current-state projection. Why: §11.
3. **`test_get_events_ordered_and_resume_cursor`** — `GET /runs/:id/events` ordered by sequence; `?since=N` returns sequence>N (numeric-guarded). Why: §11 resume.
4. **`test_get_lineage_and_replay`** — `/lineage` returns the LineageGraphProjection (sequenceThrough); `/replay` returns the replay summary. Why: §11/§9.
5. **`test_get_candidate_with_evidence_refs`** — `/candidates/:cid` returns the candidate projection incl. evidenceRefs (within-tier). Why: §11.
6. **`test_get_model_routes`** — `/model-routes` returns the configured ModelRoute set. Why: §11.
7. **`test_unknown_id_clean_404`** — unknown runId / candidateId → 404 (not a partial/empty 200). Why: §11 clean not-found.
8. **`test_reads_never_mutate`** — structural/behavioral: a read appends no event + writes no projection (read-only). Why: rule #2.

## Cross-doc invariant impact
- **Model field changes:** none (serves frozen/projection shapes). **§2.5-seam:** serves `LineageGraphProjection` (P6.3 producer) + `ModelRoute` read-only — no contract change.
- **Orchestrator doc rows (Step 9):** a likely **LESSONS** entry (the read surface — rebuild-on-read, clean-404, the list-run-ids reader, read-only). I author hot. The list-run-ids reader **also unblocks** P6.6's deferred log-wide active-run scan (note the cross-reference).

## Things to flag at Step 2.5
1. **List-run-ids reader (GET /runs).** The event store is per-run (`readByRun`) — no list-all. My default vote: add `listRunIds()` (distinct `run_id` from run_events) on the event-store/projections read surface; serve each run's current-state summary. (Also satisfies P6.6's deferred log-wide active-run scan — cross-reference.) Confirm the reader's home.
2. **Fresh-when-stale → rebuild-on-read (MVP).** My default vote: rebuild the projection from `readByRun` on each request (always fresh; the projections are cheap pure folds) — the dashboard_snapshots cache + the watermark-staleness check are deferred (the P6.1 watermark machinery is there for when caching lands). Confirm rebuild-on-read for MVP.
3. **GET /model-routes source.** My default vote: serve the configured `ModelRoute` set from the boot config (the server's injected config). Confirm the source (boot config vs a dedicated route registry).
4. **Candidate evidenceRefs resolution.** My default vote: return the candidate projection's evidenceRefs **as stored** (within-tier pointers); the full dereference/resolver is **P1.7 (kernel, unmerged)** — flag the integration-reconcile (when P1.7 lands, dereference). Confirm return-as-stored for now.
5. **Events pagination.** My default vote: `?since=<sequence>` cursor only (resume); full pagination (limit/offset) deferred unless trivial. Confirm cursor-only.

## Dependencies + sequencing
- **Depends on:** **P6.6** (`buildServer` Fastify — `034d587`), **P6.2/P6.3/P6.4** (the projections — all merged this round). `ModelRoute` (P0.11). **No live P3/P5 needed** (fixtures via the real writer); evidenceRefs full-resolution = P1.7 (flagged).
- **Blocks:** P6.9 (SSE builds on this read surface), the P7 dashboard (real wiring at integration), PD (replay export).

## Estimated commit count
**1.** The read-endpoint cluster (natural bundle — 7 GET routes serving the projections; same file/area, shared setup). **Not safety-invariant** (read-only; rule-#2 read-only pinned by RED #8). **Step-8 reviewers:** code-quality = phase-boundary; security-reviewer optional (read-only surface — run if you judge the not-found/list-reader warrants it).

## Lessons-logged candidates anticipated
- **Convention candidate** — "the read surface registers on the shared Fastify server; each read REBUILDS its projection from `readByRun` (always fresh — cache+staleness deferred, the watermark machinery awaits it); unknown id → clean 404 (never partial/empty 200); reads are read-only (no append, no projection write — rule #2); a `listRunIds()` reader backs GET /runs (and unblocks the deferred log-wide active-run scan)."

## How to invoke
> obs (apps/api) session oriented — skip `/session-start`; `/tdd`. cwd `apps/api/`. Stage only `apps/api/...`, never `-A`.
1. **Read this brief** — registers on the P6.6 server; integration via testcontainers + Fastify `inject`; note the list-reader (Q1) + the P1.7 evidenceRefs flag (Q4).
2. **Run `/tdd read_endpoints`.**
3. **Step 2.5** — answer the 5 questions (esp. Q1 list-reader + Q2 rebuild-on-read), send the write-up + coverage map.
4. **Step 9** — surface the LESSONS candidate + the list-reader/active-run cross-reference.
