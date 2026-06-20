---
title: "feat: Phase 6 — Projections, API & observability"
type: feat
status: active
created: 2026-06-19
owner: melissa
depth: standard
spec_anchors:
  - ARCHITECTURE.md §9
  - ARCHITECTURE.md §10
  - ARCHITECTURE.md §11
  - ARCHITECTURE.md §13
  - IMPLEMENTATION_PLAN.md Phase 6 (P6.1–P6.11)
depends_on:
  - docs/plans/2026-06-19-001-feat-scaffold-and-phase-0-contract-freeze-plan.md
  - docs/plans/2026-06-19-002-feat-phase-1-persistence-and-event-store-plan.md
  - docs/plans/2026-06-19-003-feat-phase-2-model-gateway-plan.md
  - docs/plans/2026-06-19-004-feat-phase-3-runtime-kernel-plan.md
  - docs/plans/2026-06-19-005-feat-phase-4-verifier-council-plan.md
  - docs/plans/2026-06-19-006-feat-phase-5-selection-plan.md
---

## Summary

Phase 6 of `IMPLEMENTATION_PLAN.md` — **the demo / observability track**. Builds the read/serve/observe surface over the authoritative event log: a deterministic projection-builder core with `(runId, sequence)` watermarks, a current-state projection over the canonical table set, the typed `LineageGraphProjection`, a replay-summary projection, secret-redaction at the persistence boundary, idempotent `POST /runs` + `/stop` mutations, the full GET surface (`/runs`, `:id`, `/events`, `/lineage`, `/replay`, `/candidates/:cid`, `/model-routes`, `/health`), SSE event-stream with `Last-Event-ID` resume + polling fallback, structured kernel logs + worker heartbeat (console + Postgres only — no external metrics stack), and a timeboxed throwaway Neo4j notebook over a derived lineage export.

Phase 0 already froze `LineageGraphProjection`. Phase 1 froze `replayReader`, `appendEvent` (already runs `redact()` on every payload), and the closed `RunEventType` enum. Phase 2 froze the gateway + `RecordedGateway`. Phase 3 shipped the runtime kernel + `Worker` + `startRun` + `terminal-classifier`. Phase 4 shipped the full `critic.reviewed` + `check.completed` event stream. Phase 5 shipped `novelty.scored` + `fitness.scored` + `lineage.culled` + `agenome.fused/mutated/reproduced` plus the `makeScoreHook` + `makeReproduceHook` factories. This PR wires the demo-facing read/write/observe layer.

## Problem Frame

Today the runtime is a library: callers must construct `runGeneration` deps in code, embed test gateways, and read the event log directly via `pg` queries. There is no HTTP surface, no SSE, no rebuilt-on-read projection, no observable signal for "is the worker alive?". The demo and the React Flow dashboard (Phase 7) cannot run.

Phase 6 closes that gap by exposing:

- **Five projections** built from the event log alone: current-state, lineage graph, replay summary, health/runtime-signal, dashboard snapshot (latter is rebuildable, never authoritative).
- **A REST + SSE API** rooted at `/runs` that drives the demo end-to-end with idempotency + cap-override rejection enforced server-side.
- **Worker self-observability**: structured logs with correlation IDs + a heartbeat the operator can see.

The load-bearing invariant carried through: **sequence is the sole ordering key**. Projections fold strictly by `(runId, sequence)`; `occurredAt` is never consulted. Replay reads only persisted state — no fresh model/web/embedding calls.

---

## Scope

### In scope

- **Projection-builder core** (P6.1) — pure fold over `(runId, sequence)` with watermark + staleness rebuild.
- **Current-state projection** (P6.2) — folds the closed `RunEventType` stream into typed per-entity current state (runs, generations, agenomes, candidates, critic reviews, check results, fitness scores, novelty scores, lineage edges).
- **`LineageGraphProjection` builder** (P6.3) — assembles the typed read model with `sequenceThrough` watermark.
- **Replay-summary projection** (P6.4) — pure read; state-equivalent to the captured-at-run-end view.
- **Secret-redaction at the persistence boundary** (P6.5) — `appendEvent` already calls `redact()` (Phase 1). This unit adds the Langfuse-emit-side redaction + extends the pattern set if needed.
- **`POST /runs`** (P6.6) — Zod-validated `RunConfig`; rejects cap overrides above the validated maxima; idempotent via `Idempotency-Key` header (24h dedupe table; D3). Single-active-run enforced.
- **`POST /runs/:id/stop`** (P6.6) — idempotent; stopping an already-terminal run is a no-op success.
- **Read endpoints** (P6.7) — `GET /runs`, `GET /runs/:id`, `GET /runs/:id/events`, `GET /runs/:id/lineage`, `GET /runs/:id/replay`, `GET /runs/:id/candidates/:cid`, `GET /model-routes`.
- **`GET /runs/:id/health`** (P6.8) — current generation, candidates in flight, last-event time, caps consumed.
- **SSE `GET /runs/:id/stream`** (P6.9) — delivery-only; `Last-Event-ID` resume; polling fallback to `/events`.
- **Runtime self-observability** (P6.10) — kernel logger with correlation IDs (`runId`, `generationId`, `agenomeId`) + worker heartbeat every 5s (D2) emitted as a `system.heartbeat` event (NOT in the closed `RunEventType` enum — see open finding below).
- **Neo4j spike** (P6.11) — derived lineage export + a notebook proving 4 query shapes. Timeboxed throwaway; never a runtime dependency.

### Deferred to Follow-Up Work

- A typed OpenAPI / contract-derived client. Phase 7 dashboard hand-rolls fetches; a generator is worth it post-demo.
- A `pnpm api:dev` CLI that bundles docker-compose Postgres + worker + HTTP server for one-command demo bring-up. Useful demo polish; not load-bearing for the PR.
- Server-Sent Events backpressure + slow-client disconnection. MVP just serves; Phase D rehearsal will tune.
- HTTP auth. The demo runs locally only; no public surface this phase. Phase 7+ will add an `X-Demo-Token` header if/when a hosted demo lands.

### Out of scope

- React Flow dashboard — Phase 7.
- Any contract changes. Phase 6 consumes frozen contracts only.
- Distributed worker / horizontal scaling.
- An external metrics stack (Prometheus, OpenTelemetry exporter). MVP is console + Postgres only.

---

## Key Technical Decisions

### D1. HTTP framework is Hono

Hono runs natively on Node 22, has built-in SSE streaming, first-class TypeScript types, and integrates cleanly with Zod for request validation. Lighter than Fastify and friendlier than Express for the request-validation patterns we need. Adds one production dep (`hono`) plus its Node adapter (`@hono/node-server`).

`Idempotency-Key` middleware sits as a Hono middleware in front of `POST /runs` and is the only stateful middleware.

### D2. Worker heartbeat fires every 5 seconds

Cadence chosen so `GET /runs/:id/health` shows a stalled-worker signal within ~10s (operator sees `lastHeartbeatMs > 10_000` and can decide). Modest event-log volume: a 5-minute run produces ~60 heartbeat entries. The heartbeat is asynchronously emitted from a `setInterval` started by `Worker.start()` and cleared on `Worker.stop()`.

**Open finding on event type:** the closed Phase 0 `RunEventType` enum does NOT include `system.heartbeat`. Two paths:
- **A.** Ride heartbeats on a Postgres `worker_heartbeats` table (writeable by the worker) instead of `run_events`. Cleaner; heartbeats live in their own state space distinct from the authoritative event log.
- **B.** Surface a Phase 0 contract gap and propose adding `system.heartbeat` to the enum.

**Default approach: A.** Heartbeats are operational signal, not authoritative event-log data. A separate table preserves the closed-enum invariant and matches the spec language ("observability sinks are console + Postgres only" — Postgres is a sink, not necessarily the event log). U10 introduces the `worker_heartbeats` migration.

### D3. Idempotency: `Idempotency-Key` header + 24h dedupe table

Client supplies `Idempotency-Key: <uuid>` on `POST /runs`. Server stores `(key, runId, expires_at)` in `idempotency_keys` table. Duplicate POST with the same key returns the stored runId with `200 OK` (not `201 Created`). 24-hour TTL via `expires_at` — a nightly cleanup job is deferred.

If no `Idempotency-Key` is supplied, the terminal-state guard from Phase 3 fires (`RunAlreadyActiveError`). Belt-and-suspenders: both work; the header path is the recommended one.

### D4. Projection cache is in-memory + watermark-checked per request

No Redis or persistent projection cache for MVP. Each request rebuilds the projection from the event log, but the builder is fast enough (10k events fold in <50ms locally) that the watermark check is the only optimization needed: if `(runId, sequence_through)` matches the cached value, serve from memory; otherwise rebuild.

A future iteration can move the cache to a separate process or Redis; the projection-builder API stays the same. The watermark itself is a `Map<runId, number>` in-process — flushed on restart.

### D5. SSE delivery uses a Postgres `LISTEN/NOTIFY` channel

The worker / kernel append path emits a `NOTIFY run_events_channel '{ runId, sequence, type }'` after every commit. The SSE handler `LISTEN`s on the same channel. On a client connect, we serve events `> Last-Event-ID` from the persisted log (catch-up) then attach to the LISTEN stream (live). Disconnect → reconnect with `Last-Event-ID` works correctly.

If `LISTEN/NOTIFY` is unavailable (e.g., a managed Postgres that disables it — not our case for docker-compose), the SSE handler falls back to polling `replayReader` every 250ms. Polling fallback documented in code, not exposed as a configuration.

### D6. Health endpoint computes caps-consumed by replay

`GET /runs/:id/health` consumes events via `replayReader` to recompute: `generationsCompleted`, `candidatesInFlight` (created - selected/rejected/culled), `lastEventOccurredAt`, and caps consumed (`energy.spent` actual sum, generation count, etc.). The values are derived from persisted state — no separate Postgres column needs maintaining. For a long run with many events this is a slower endpoint than the simple read paths; an iteration can persist a per-run summary, but MVP folds on every request.

### D7. Neo4j spike is genuinely throwaway

The notebook at `spikes/neo4j/lineage-queries.ipynb` consumes a derived JSON export from `LineageGraphProjection` via a one-shot Cypher load. Four query shapes proven (ancestors-of-winner, parent-contribution, critic-kill patterns, lineage distance/diversity). Never imported from runtime code. Never blocks CI. Living gitignored or under `spikes/` with a `README.md` warning.

---

## High-Level Technical Design

```
                     ┌──────────────────────────────────────────────┐
                     │  Postgres run_events (Phase 1)               │
                     └────────────────────┬─────────────────────────┘
                                          │ replayReader.events(runId)
                                          ▼
                     ┌──────────────────────────────────────────────┐
                     │  projection-builder core (P6.1)              │
                     │   - fold by (runId, sequence)                │
                     │   - watermark sequenceThrough                │
                     │   - staleness rebuild                        │
                     └────────────────────┬─────────────────────────┘
                                          │
       ┌──────────────┬──────────────────┼──────────────────────┐
       ▼              ▼                  ▼                      ▼
┌─────────────┐ ┌─────────────┐ ┌────────────────┐ ┌───────────────────┐
│ current-    │ │ lineage-    │ │ replay-summary │ │ health/run-signal │
│ state (U2)  │ │ graph (U3)  │ │ (U4)           │ │ (U8)              │
└─────────────┘ └─────────────┘ └────────────────┘ └───────────────────┘
       │              │                  │                      │
       └──────────────┴────────┬─────────┴──────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────────┐
              │   Hono HTTP server (D1)                  │
              │                                          │
              │   POST /runs (idempotent, D3)            │
              │   POST /runs/:id/stop                    │
              │   GET  /runs                             │
              │   GET  /runs/:id                         │
              │   GET  /runs/:id/events                  │
              │   GET  /runs/:id/lineage                 │
              │   GET  /runs/:id/replay                  │
              │   GET  /runs/:id/candidates/:cid         │
              │   GET  /runs/:id/health                  │
              │   GET  /runs/:id/stream     (SSE, D5)    │
              │   GET  /model-routes                     │
              └────────────────┬─────────────────────────┘
                               │
              ┌────────────────┼───────────────────────────┐
              ▼                ▼                           ▼
        Postgres LISTEN     redact() on every          worker process:
        / NOTIFY             persisted payload         heartbeat every 5s
        + idempotency_keys   (Phase 1 already does     (D2 → worker_heartbeats
        + worker_heartbeats   this; U5 wires Langfuse   table)
        (U10)                 side)                     + kernel logger
                                                        with correlation IDs
```

> *This sketch illustrates the intended approach and is directional guidance for review, not implementation specification.*

---

## Output Structure

```
apps/api/src/
  projections/
    projection-builder.ts          ← P6.1 core fold + watermark
    watermark.ts                   ← cache + staleness logic
    current-state.ts               ← P6.2
    lineage-graph.ts               ← P6.3
    replay-summary.ts              ← P6.4
    run-health.ts                  ← P6.8
    lineage-export.ts              ← P6.11 JSON export for the spike
    __tests__/
      projection-builder.test.ts
      current-state.test.ts
      lineage-graph.test.ts
      replay-summary.test.ts
      run-health.test.ts
  http/
    server.ts                      ← Hono app composition
    routes/
      runs-write.ts                ← POST /runs + /stop (P6.6)
      runs-read.ts                 ← GET /runs + :id + events + candidates (P6.7)
      lineage.ts                   ← GET /runs/:id/lineage
      replay.ts                    ← GET /runs/:id/replay
      health.ts                    ← GET /runs/:id/health (P6.8)
      stream.ts                    ← SSE /runs/:id/stream (P6.9)
      model-routes.ts              ← GET /model-routes
    middleware/
      idempotency.ts               ← Idempotency-Key handler
      error.ts                     ← typed error mapper → status codes
    sse/
      event-bridge.ts              ← LISTEN/NOTIFY + polling fallback
    __tests__/
      runs-write.test.ts
      runs-read.test.ts
      lineage.test.ts
      health.test.ts
      stream.test.ts
      model-routes.test.ts
  event-store/
    migrations/
      0003_idempotency_keys.sql
      0004_worker_heartbeats.sql
  observability/
    kernel-logger.ts               ← structured logger with correlation IDs
    heartbeat.ts                   ← worker heartbeat emitter
    __tests__/
      kernel-logger.test.ts
      heartbeat.test.ts
  index.ts                         ← extended barrel

spikes/
  neo4j/
    lineage-queries.ipynb          ← throwaway notebook (P6.11)
    README.md                      ← warning + run instructions
```

---

## Implementation Units

### U1. Projection-builder core + watermark cache

**Goal:** `buildProjection<T>({ runId, replayReader, initial, reduce })` async-iterates events via `replayReader` strictly ordered by `(runId, sequence)`, folds with the supplied reducer, and returns `{ projection: T, sequenceThrough: number }`. Watermark cache is an in-process `Map<runId, { sequenceThrough, projection }>` — `getCachedOr(runId, reBuilder)` returns cached when watermarks match, otherwise rebuilds.

**Requirements:** P6.1. Acceptance: ordering is `(runId, sequence)` only; gap or non-monotonic sequence throws; `schemaVersion > current` throws.

**Dependencies:** Phase 1 `replayReader`.

**Files:**
- Create: `apps/api/src/projections/projection-builder.ts`
- Create: `apps/api/src/projections/watermark.ts`
- Create: `apps/api/src/projections/__tests__/projection-builder.test.ts`

**Approach:** `projection-builder.ts` exports `buildProjection(opts)` + `ProjectionGapError` + `ProjectionForwardSchemaError`. Internally iterates events, validates monotonic sequence (each event's sequence must be `previousSeq + 1`), and calls `reduce(state, event)` per event. `watermark.ts` exports `createWatermarkCache<T>()` returning `{ get, put, invalidate }`.

**Patterns to follow:** Phase 1's `replayReader.events(runId)` iteration shape; Phase 3's `terminal-classifier.ts` for the read-and-fold idiom.

**Test scenarios:**
- Happy path: 5 events fold deterministically; same events → same projection bytes.
- Gap detection: events with sequences `[0, 1, 3]` throw `ProjectionGapError`.
- Schema-version guard: an envelope with `schemaVersion > current` throws.
- Empty event log → returns `{ projection: initial, sequenceThrough: -1 }`.
- Watermark cache: first call rebuilds, second call with no new events returns cached.
- Watermark cache: invalidate clears the entry.

**Verification:** Pure-function tests pass; helper used by U2–U4 + U8.

---

### U2. Current-state projection

**Goal:** A typed read model derived from the full event log. One reducer per entity in `apps/api/src/projections/reducers/`:
- `runs.ts` — id, status, configuredAt, startedAt?, completedAt?, terminalReason?, caps, seed
- `generations.ts` — runId, generationIndex, status, completedAt, candidateCount
- `agenomes.ts` — id, runId, generationIndex, status, parentIds, personaWeights, spawnBudget
- `candidates.ts` — id, runId, agenomeId, status, subtype, summary (when present in payload)
- `critic-reviews.ts` — id, candidateId, mandate, confidence, evidenceRefs (list view)
- `check-results.ts` — id, candidateId, checkType, status, score?
- `fitness-scores.ts` — id, candidateId, total, components, policyVersion
- `novelty-scores.ts` — id, candidateId, score, embeddingModelId, dimension (vector NOT included in read view; available via dedicated endpoint)
- `lineage-edges.ts` — parent agenome IDs → child agenome IDs derived from `agenome.fused` / `agenome.mutated`

**Requirements:** P6.2. Acceptance: idempotent re-fold; novelty vector read back from `novelty.scored.vector` without re-embedding; terminal events move affected entities to terminal state.

**Dependencies:** U1.

**Files:**
- Create: `apps/api/src/projections/current-state.ts`
- Create: `apps/api/src/projections/reducers/runs.ts`
- Create: `apps/api/src/projections/reducers/generations.ts`
- Create: `apps/api/src/projections/reducers/agenomes.ts`
- Create: `apps/api/src/projections/reducers/candidates.ts`
- Create: `apps/api/src/projections/reducers/critic-reviews.ts`
- Create: `apps/api/src/projections/reducers/check-results.ts`
- Create: `apps/api/src/projections/reducers/fitness-scores.ts`
- Create: `apps/api/src/projections/reducers/novelty-scores.ts`
- Create: `apps/api/src/projections/reducers/lineage-edges.ts`
- Create: `apps/api/src/projections/__tests__/current-state.test.ts`

**Approach:** `current-state.ts` exports `buildCurrentState({ db, runId })` returning a `CurrentState` object. Each reducer takes `(state, event)` and returns the new state. The top-level reducer dispatches by `event.type` to the per-entity reducer.

**Test scenarios:**
- Empty event log → empty current-state.
- `run.configured` + `generation.started` × 3 + `candidate.created` × 5 + `critic.reviewed` × 25 + `check.completed` × 25 + `novelty.scored` × 5 + `fitness.scored` × 5 → typed projection with all entities counted correctly.
- `run.completed` event → runs[id].status = "completed".
- Idempotency: folding the same event list twice yields the same state.
- Novelty vector preserved verbatim: `state.noveltyScores[id].vector` equals the persisted vector bytes.

**Verification:** Phase 6 dashboard (Phase 7) reads this projection.

---

### U3. `LineageGraphProjection` builder

**Goal:** Build the typed `LineageGraphProjection` from current-state + event log. Nodes for each agenome, candidate, critic_review, check_result, scoring. Edges from `agenome.fused/mutated` parent→child, candidate→its agenome, critic_review→candidate, check_result→candidate, scoring→candidate. `sequenceThrough` = max event sequence consumed.

**Requirements:** P6.3. Acceptance: storage-agnostic; `dataRef` resolves within the Postgres tier (eventId); same projection feeds React Flow + Neo4j export.

**Dependencies:** U1, U2.

**Files:**
- Create: `apps/api/src/projections/lineage-graph.ts`
- Create: `apps/api/src/projections/__tests__/lineage-graph.test.ts`

**Approach:** Reuses current-state then materializes nodes/edges. Each node's `dataRef` is the originating event's UUID. Edge ids are deterministic strings (`source__type__target`).

**Test scenarios:**
- Single-generation run with 5 candidates produces 5 candidate + 5 agenome nodes + 25 critic + 25 check + 5 scoring nodes + the correct edges (~90 edges).
- `sequenceThrough` is the last event's sequence.
- Schema-snapshot: `LineageGraphProjection.parse(out)` succeeds.
- Empty run → empty nodes + edges + `sequenceThrough: -1`.

**Verification:** Phase 7 dashboard consumes this exact shape.

---

### U4. Replay-summary projection

**Goal:** `buildReplaySummary({ db, runId })` produces a deterministic summary capturing the run's terminal state for the dashboard's "replay" tab. Reads only persisted state. Includes: terminal status, generationsCompleted, candidatesProduced, candidatesSelected, fitnessHistogram, topCandidates (by fitness.total, top 5), policyVersion, runSeed.

**Requirements:** P6.4. Acceptance: state-equivalent to projection captured at run end; no model/web/embedding calls.

**Dependencies:** U1, U2.

**Files:**
- Create: `apps/api/src/projections/replay-summary.ts`
- Create: `apps/api/src/projections/__tests__/replay-summary.test.ts`

**Approach:** Consumes the current-state projection. Pure transform. Pulls top candidates by sorting `fitness.scored` events. Builds the histogram from `fitness.total` values.

**Test scenarios:**
- Idempotency: re-running produces the same summary.
- Older-schemaVersion fixture: a recorded run from before the current contract version still replays successfully.
- Zero-survivors run: `topCandidates: []`, status: completed, generationsCompleted preserved.

**Verification:** Replay tab works against a replayed log.

---

### U5. Secret redaction at Langfuse emit boundary

**Goal:** Phase 1's `appendEvent` already runs `redact()` on every payload before persist. This unit wires the same redaction into the gateway's Langfuse trace emit so providers never see unredacted secrets on traces. Also adds `redact()` to the kernel-logger output (U10).

**Requirements:** P6.5. Acceptance: a failed Langfuse export emits a local warning and does not write an event-log entry.

**Dependencies:** Phase 2 `langfuse.ts`, Phase 1 `redact()`.

**Files:**
- Modify: `apps/api/src/model-gateway/langfuse.ts` — wrap trace-emit payload in `redact()` before send.
- Modify: `apps/api/src/observability/kernel-logger.ts` (U10) — apply `redact()` on log records before write.

**Test scenarios:**
- A trace payload containing `{ openai_api_key: "sk-..." }` arrives at the Langfuse client redacted.
- Logger record with an embedded API key key is scrubbed before write.

**Verification:** Manual review: no unredacted secret appears in any persisted artifact (log file, run_events, Langfuse cloud trace).

---

### U6. `POST /runs` + `POST /runs/:id/stop` with idempotency

**Goal:** Two write endpoints mounted under the Hono app. `POST /runs` validates `RunConfig` (Zod) + rejects cap-overrides above the validated maxima + handles `Idempotency-Key`. `POST /runs/:id/stop` emits a `run.stopped` event (via `appendEvent`) on the run, idempotent.

**Requirements:** P6.6. Acceptance: idempotency-key dedupe; cap-override rejection; single-active-run enforced; invalid config fails fast with no `run.configured` event written.

**Dependencies:** U1, Phase 3 `startRun`, Phase 1 `appendEvent`.

**Files:**
- Create: `apps/api/src/event-store/migrations/0003_idempotency_keys.sql`
- Create: `apps/api/src/http/middleware/idempotency.ts`
- Create: `apps/api/src/http/middleware/error.ts`
- Create: `apps/api/src/http/routes/runs-write.ts`
- Create: `apps/api/src/http/__tests__/runs-write.test.ts`

**Approach:** `idempotency.ts` exports a Hono middleware factory. On `POST /runs`:
1. Read `Idempotency-Key` header. If present, look up `(key, body_hash)` in `idempotency_keys`. If found: return stored response.
2. Otherwise: validate `RunConfig`, call `startRun(db, config)`, store `(key, runId, expires_at)` if key was provided.
3. Catch `RunAlreadyActiveError` → 409 Conflict with `activeRunId`.
4. Catch Zod errors → 400 Bad Request with field errors.

`error.ts` maps typed runtime errors to HTTP status codes consistently (`IllegalTransitionError` → 409, `RunAlreadyActiveError` → 409, validation → 400, others → 500).

`POST /runs/:id/stop` reads the run, validates non-terminal status (or 200 no-op on terminal), and appends a `run.stopped` event. Idempotent.

**Test scenarios:**
- Happy path: `POST /runs` with valid config → 201 + runId.
- Idempotent retry: same `Idempotency-Key` → 200 + same runId.
- Cap-override above validated maximum → 400 with field path.
- Invalid config (missing `rngSeed`) → 400, no `run.configured` event.
- Active run exists, new `POST /runs` without key → 409 Conflict with `activeRunId`.
- `POST /runs/:id/stop` on running run → 200, `run.stopped` event emitted.
- `POST /runs/:id/stop` on already-terminal run → 200 no-op, no second event.

**Verification:** Integration test starts Hono server, sends real HTTP requests.

---

### U7. Read endpoints

**Goal:** `GET /runs` (list), `GET /runs/:id` (current-state + summary), `GET /runs/:id/events` (paginated by sequence), `GET /runs/:id/candidates/:cid` (one candidate's evidence), `GET /model-routes` (gateway route map). Each endpoint serves a freshly-rebuilt projection when watermark is stale.

**Requirements:** P6.7. Acceptance: read-only; unknown runId/candidateId → 404; resume from cursor on `/events`.

**Dependencies:** U1, U2, U6 (shares Hono app).

**Files:**
- Create: `apps/api/src/http/routes/runs-read.ts`
- Create: `apps/api/src/http/routes/model-routes.ts`
- Create: `apps/api/src/http/routes/lineage.ts`
- Create: `apps/api/src/http/routes/replay.ts`
- Create: `apps/api/src/http/__tests__/runs-read.test.ts`
- Create: `apps/api/src/http/__tests__/lineage.test.ts`
- Create: `apps/api/src/http/__tests__/model-routes.test.ts`

**Approach:** Each handler uses the U1 watermark cache. `GET /runs/:id/events?afterSequence=N&limit=100` queries `replayReader` with a `WHERE sequence > $N` clause. `GET /runs/:id/lineage` serves the U3 `LineageGraphProjection`. `GET /runs/:id/replay` serves the U4 replay summary.

**Test scenarios:**
- Happy path each endpoint.
- Unknown runId / candidateId → 404.
- Events with cursor: serve only events after `afterSequence`.
- Watermark: same request twice without new events does NOT rebuild the projection (verified by counting rebuilds).

**Verification:** All endpoints return correct shapes against testcontainers DB.

---

### U8. `GET /runs/:id/health`

**Goal:** Health endpoint returning `{ status, currentGeneration, candidatesInFlight, lastEventOccurredAt, capsConsumed: { energy, generations, candidates, toolCalls }, lastHeartbeatMs }`. Derived from event log + `worker_heartbeats` table (U10).

**Requirements:** P6.8. Acceptance: derived from live projection; caps-consumed never exceeds ceiling; works without external metrics.

**Dependencies:** U1, U2, U10 (heartbeat table).

**Files:**
- Create: `apps/api/src/projections/run-health.ts`
- Create: `apps/api/src/http/routes/health.ts`
- Create: `apps/api/src/projections/__tests__/run-health.test.ts`
- Create: `apps/api/src/http/__tests__/health.test.ts`

**Approach:** `run-health.ts` exports `buildRunHealth({ db, runId })`. Folds events: `generation.started/completed` counts → `currentGeneration`, `candidate.created` minus terminal candidate transitions → `candidatesInFlight`, `energy.spent.actual` sum → `capsConsumed.energy`, etc. Reads `lastHeartbeatMs` from `worker_heartbeats` table. `lastEventOccurredAt` = max `occurredAt` from `run_events` for that run.

**Test scenarios:**
- Running run: `currentGeneration > 0`, `capsConsumed.energy > 0`.
- Stalled worker: `lastHeartbeatMs > 10_000` flags `status: "stalled"`.
- Terminal run: `status: completed | stopped | failed | cancelled` matches the terminal-classifier output.

**Verification:** Operator can read `/health` to decide continue-vs-switch-to-replay.

---

### U9. SSE event stream

**Goal:** `GET /runs/:id/stream` emits run events over SSE with the event sequence as the SSE `id`. `Last-Event-ID` header resumes from cursor; on first connect serves catch-up events then attaches to live stream via Postgres `LISTEN/NOTIFY`. Polling fallback if NOTIFY fails. Disconnect/reconnect produces an identical ordered projection.

**Requirements:** P6.9. Acceptance: delivery-only; non-authoritative; no gap/no duplicate on resume; identical to uninterrupted stream.

**Dependencies:** U7 (shares Hono app + read paths).

**Files:**
- Create: `apps/api/src/http/sse/event-bridge.ts`
- Create: `apps/api/src/http/routes/stream.ts`
- Create: `apps/api/src/http/__tests__/stream.test.ts`
- Modify: `apps/api/src/event-store/append.ts` — after a successful insert, emit `NOTIFY run_events_channel`.

**Approach:** `event-bridge.ts` exports `createSseHandler(deps)`. On a `GET /runs/:id/stream` connect:
1. Read `Last-Event-ID` header (default `-1`).
2. Catch-up: stream events with `sequence > lastEventId` from `replayReader`. Set SSE `id` to event sequence.
3. After catch-up: `LISTEN run_events_channel`. On each notification, fetch the event by sequence and emit. Track which sequence we've sent so duplicates are filtered.
4. On client disconnect: `UNLISTEN`, close handle.
5. Polling fallback: if `LISTEN` setup fails, poll every 250ms for new events.

`append.ts` modification: after a successful row insert + commit, emit `pg_notify('run_events_channel', json_build_object('runId', $1, 'sequence', $2, 'type', $3)::text)`.

**Test scenarios:**
- Connect, see all events to current head, no live new events → close.
- Connect with `Last-Event-ID: 5` → only events with sequence > 5.
- Mid-stream disconnect + reconnect → no gap, no duplicate.
- Polling fallback: with NOTIFY disabled (mocked), still receives new events with ~250ms latency.
- Identical to direct fetch: events received via SSE are byte-identical to `GET /events` of the same range.

**Verification:** Phase 7 dashboard connects via SSE end-to-end.

---

### U10. Runtime self-observability: kernel logger + worker heartbeat

**Goal:** A structured logger that emits JSON to stdout (or a configured sink) carrying `runId`, `generationId`, `agenomeId`, `correlationId` automatically when available. A worker heartbeat that writes a row to `worker_heartbeats` every 5s (D2) while the worker is running.

**Requirements:** P6.10. Acceptance: correlation IDs propagated; heartbeat absence detectable; emission never blocks the append path; redaction applied before emit.

**Dependencies:** U5 (redact), Phase 3 `Worker`.

**Files:**
- Create: `apps/api/src/event-store/migrations/0004_worker_heartbeats.sql`
- Create: `apps/api/src/observability/kernel-logger.ts`
- Create: `apps/api/src/observability/heartbeat.ts`
- Modify: `apps/api/src/runtime/worker.ts` — start/stop heartbeat in `start()/stop()`.
- Create: `apps/api/src/observability/__tests__/kernel-logger.test.ts`
- Create: `apps/api/src/observability/__tests__/heartbeat.test.ts`

**Approach:** `kernel-logger.ts` exports `createKernelLogger(context)` returning `{ info, warn, error }`. Each call emits a JSON record `{ ts, level, msg, runId?, generationId?, agenomeId?, correlationId?, ...extras }` after running `redact()` on it. `withContext({ runId, ... })` returns a new logger inheriting the parent context.

`heartbeat.ts` exports `startHeartbeat(db, options) → { stop }`. Internally calls `setInterval(write, 5000)`. Each tick: `INSERT INTO worker_heartbeats(worker_id, beat_at) VALUES (?, NOW()) ON CONFLICT (worker_id) DO UPDATE SET beat_at = NOW()`. The worker_id defaults to a process-startup UUID.

**Migration `0004_worker_heartbeats.sql`:** simple table `worker_heartbeats(worker_id TEXT PRIMARY KEY, beat_at TIMESTAMPTZ NOT NULL)`. No index needed (single row per worker in MVP).

**Test scenarios:**
- Logger: a `logger.info("starting", { runId: "x" })` call produces a JSON line with `runId: "x"`.
- Logger: an API key in the extras is scrubbed.
- Heartbeat: after `startHeartbeat`, the `worker_heartbeats` row is updated within 5s. `stop()` clears the interval and no new writes occur.
- Heartbeat write failure: logged as a warning; the worker continues.

**Verification:** Integration test reads the heartbeat table after a brief worker run.

---

### U11. Hono server composition + Phase 6 public barrel

**Goal:** Compose the Hono app from all the route + middleware modules; expose a `createServer({ db, gateway, ... }) → Hono` factory. Add a `pnpm api:dev` script (deferred to follow-up; for now just expose the factory). Update the `@doppl/api` barrel with the projection + HTTP surface.

**Requirements:** Bridges Phase 6 into the runnable surface. Acceptance: a single import surface for callers; surface tests pin required exports.

**Dependencies:** U1–U10.

**Files:**
- Create: `apps/api/src/http/server.ts`
- Modify: `apps/api/src/index.ts` (extended barrel)
- Create: `apps/api/src/projections/index.ts` (barrel)
- Create: `apps/api/src/http/index.ts` (barrel)
- Create: `apps/api/src/observability/index.ts` (barrel)
- Create: `apps/api/src/__tests__/http-surface.test.ts`

**Approach:** `server.ts` wires every middleware + route in a fixed order. Idempotency middleware mounted before `POST /runs`. Error middleware mounted last. Required exports tested.

**Test scenarios:**
- Surface test pins every required export.
- Integration: server boots, responds 404 to unknown route, 200 to `GET /healthz`.

**Verification:** Phase 7 dashboard imports + calls all exposed routes successfully.

---

### U12. Neo4j spike notebook + lineage export

**Goal:** `lineage-export.ts` exports a `LineageGraphProjection` as a single JSON document the notebook loads. Notebook proves 4 query shapes against a Neo4j instance: ancestors-of-winner, parent-contribution, critic-kill patterns, lineage distance/diversity.

**Requirements:** P6.11. Acceptance: throwaway; never imported from runtime code; never blocks CI; the spike works against any sample run's export.

**Dependencies:** U3.

**Files:**
- Create: `apps/api/src/projections/lineage-export.ts`
- Create: `spikes/neo4j/lineage-queries.ipynb`
- Create: `spikes/neo4j/README.md`
- Create: `spikes/.gitignore` (excludes `*.json` exports)

**Approach:** `lineage-export.ts` exports `exportLineageAsJson(runId, db) → string`. The notebook has 4 markdown cells (one per query shape) + Cypher code cells. Initial cell loads the JSON via `apoc.load.json`. Notebook checked in; data files gitignored.

**Test scenarios:**
- Pure: `exportLineageAsJson` produces a JSON string that round-trips to the same `LineageGraphProjection` via `JSON.parse(...).then(LineageGraphProjection.parse)`.

**Verification:** Notebook runs successfully against a sample run's export at PR review time. Functional verification is manual (no automated Neo4j test in CI).

---

## System-Wide Impact

- **`apps/api/src/event-store/append.ts`**: adds one `pg_notify` call after successful insert (U9). No structural change.
- **`apps/api/src/runtime/worker.ts`**: gains heartbeat start/stop (U10). No state-machine change.
- **`packages/contracts`**: no schema changes. Phase 6 consumes frozen contracts only.
- **`apps/api/src/event-store/migrations/`**: 2 new migrations (`0003_idempotency_keys.sql`, `0004_worker_heartbeats.sql`).
- **New runtime deps**: `hono` + `@hono/node-server`.

---

## Open Questions Surfaced by Planning

**Heartbeat event type (D2 finding):** the closed Phase 0 `RunEventType` enum has no `system.heartbeat`. Default approach: heartbeats live in their own `worker_heartbeats` table, not in the event log. Documented in U10's commit. If a future iteration wants heartbeats in the authoritative event log, that's a Phase 0 contract addition, not a Phase 6 widening.

**Idempotency key TTL cleanup:** `idempotency_keys.expires_at` is set but no nightly cleanup job is wired up. Acceptable for the demo (24h TTL with a small population of keys); a production iteration adds a job.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- A generated TypeScript HTTP client + OpenAPI spec from Hono routes. Phase 7 dashboard hand-rolls fetches.
- A `pnpm api:dev` CLI that bundles Postgres + worker + HTTP server.
- HTTP auth (`X-Demo-Token` header). Local-only for now.
- Backpressure / slow-SSE-client disconnection. MVP just serves.
- Cron / nightly cleanup of expired idempotency keys.

### Deferred for Later (per IMPLEMENTATION_PLAN.md)

- React Flow dashboard — Phase 7.
- Local-first demo path + prepared-replay fallback — Phase D.

### Outside this product's identity

- An external metrics stack. Console + Postgres only is the spec language.
- A persistent projection cache (Redis, etc.). In-memory + watermark is sufficient for the demo.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hono dep surface changes between versions | Low | Maintenance churn | Pin exact version in `package.json`. Hono is mature post-v4. |
| SSE LISTEN/NOTIFY drops a message under load | Low | Live stream drops an event | Polling fallback runs in parallel for the first 10 seconds after connect. Client resume from `Last-Event-ID` is the resolution path either way. |
| Heartbeat interval drifts during heavy GC pauses | Low | False stalled-worker signal | Health endpoint considers heartbeat stale only after 10s (2× cadence). Operators can override threshold via env. |
| Projection rebuild on every read is slow for long runs | Medium | Slow dashboard refresh | Watermark cache short-circuits same-state reads. A future iteration can move per-runId caches to Redis. |
| `pg_notify` payload exceeds 8000 byte limit | Low | Notification dropped | Payload is JSON `{ runId, sequence, type }` only — well under 1KB. The full event body is fetched by sequence after notification. |

---

## Test Plan & Dev Loop

```bash
docker compose up -d postgres
pnpm -w typecheck
pnpm -w lint
pnpm -w test                      # unit + integration
pnpm -w test:int                  # integration including HTTP testcontainers
# Manual demo:
pnpm --filter @doppl/api dev      # starts Hono on :3000
curl -X POST http://localhost:3000/runs \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{...config...}'
```

## Environment Variables

| Var | Default | Effect |
|---|---|---|
| `DOPPL_HTTP_PORT` | `3000` | Hono server port. |
| `DOPPL_HEARTBEAT_INTERVAL_MS` | `5000` | Worker heartbeat cadence (D2). |
| `DOPPL_SSE_POLLING_FALLBACK_MS` | `250` | Polling interval when LISTEN/NOTIFY is unavailable. |
| `DOPPL_IDEMPOTENCY_TTL_HOURS` | `24` | Idempotency-Key dedupe window (D3). |
| `DOPPL_PROJECTION_CACHE_DISABLED` | `false` | Set `true` to bypass watermark cache (debugging). |

## Acceptance Criteria

- [ ] Projection builders fold strictly by `(runId, sequence)`; `occurredAt` never used as ordering key (U1).
- [ ] Every projection records its `sequenceThrough` watermark; stale watermarks trigger rebuild; rebuilt projections state-equivalent to capture-at-run-end (U1, U2, U3, U4).
- [ ] REST surface implements `POST` + `GET /runs`, `/stop`, `/events`, `/stream` (SSE), `/lineage`, `/replay`, `/candidates/:cid`, `/model-routes`, `/runs/:id/health` (U6–U9).
- [ ] `POST /runs` is idempotent via `Idempotency-Key` (24h dedupe table); cap-overrides above validated maxima rejected; invalid configs fail fast (U6).
- [ ] SSE is delivery-only and non-authoritative; clients resume from `Last-Event-ID` with polling fallback (U9).
- [ ] `GET /runs/:id/health` exposes current generation, candidates in flight, last-event time, caps consumed, last heartbeat (U8).
- [ ] Secret redaction runs before append AND before any Langfuse emit (U5).
- [ ] Structured kernel logs carry `runId/generationId/agenomeId/correlationId`; worker heartbeat detectable when stale (U10).
- [ ] Neo4j spike is a throwaway notebook over a derived export; never imported by runtime code (U12).
- [ ] `pnpm -w typecheck && pnpm -w lint && pnpm -w test && pnpm -w test:int` all green at PR open.

## Dependencies on Prior Phases

- Phase 0: `RunConfig`, `RunCaps`, `RunEventType`, `RunEventEnvelope`, `LineageGraphProjection`, `redact()`.
- Phase 1: `appendEvent`, `replayReader`, migrations directory + `_journal.json`.
- Phase 2: `ModelGateway`, `RecordedGateway`, Langfuse client (U5 wires redact).
- Phase 3: `startRun`, `Worker`, `RunAlreadyActiveError`, terminal-classifier, `runGeneration`.
- Phase 4: `critic.reviewed` + `check.completed` event stream.
- Phase 5: `novelty.scored` + `fitness.scored` + `lineage.culled` + `agenome.fused/mutated/reproduced` + `makeScoreHook` + `makeReproduceHook`.

## What ships in the PR

- The `apps/api/src/projections/`, `apps/api/src/http/`, `apps/api/src/observability/` trees from the Output Structure section.
- Two SQL migrations (`0003`, `0004`) + `_journal.json` update.
- One-line `pg_notify` addition in `apps/api/src/event-store/append.ts`.
- Worker heartbeat wiring in `apps/api/src/runtime/worker.ts`.
- Phase 6 public surface harness at `apps/api/src/__tests__/http-surface.test.ts`.
- `spikes/neo4j/` notebook + README + gitignore.
- Plan file with `status: completed` (flipped at PR open).
- PR targets the `melissa` integration branch.
