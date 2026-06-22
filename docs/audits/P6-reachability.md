# Phase 6 Reachability Audit — demo track

**Date:** 2026-06-21  
**Branch:** track/demo  
**Surface:** `apps/api/src/{projections,routes,sse,runtime}` + `packages/observability/src`  
**Entry point:** `buildServer` in `apps/api/src/server.ts` (Fastify HTTP/SSE entry; listen()/boot deferred to P3/integration)

---

## 1. Enumerated exported symbols (44 total)

### `apps/api/src/projections/`

| Symbol | File | Reachable? | Path |
|---|---|---|---|
| `buildProjection` | `projection-builder.ts` | REACHABLE | called by `buildCurrentState` → all routes |
| `canonicalize` | `projection-builder.ts` | TEST-ONLY | used in test suites only; no production caller in src/ |
| `ProjectionError` (class) | `projection-builder.ts` | REACHABLE | thrown by `buildProjection`; caught by `buildServer` error handler |
| `ProjectionErrorReason` (type) | `projection-builder.ts` | REACHABLE | type companion to `ProjectionError` |
| `ProjectionReducer` (type) | `projection-builder.ts` | REACHABLE | used in `current-state.ts` REDUCERS array |
| `WatermarkedProjection` (type) | `projection-builder.ts` | REACHABLE | return type of `buildCurrentState`, consumed by routes |
| `RunEventRow` (type re-export) | `projection-builder.ts` | REACHABLE | used throughout projection machinery |
| `isStale` | `watermark.ts` | TEST-ONLY | referenced only from test files; no production caller in src/ |
| `latestSequence` | `watermark.ts` | TEST-ONLY | referenced only from test files; no production caller in src/ |
| `currentStateReducer` | `current-state.ts` | REACHABLE | composed in `buildCurrentState` |
| `buildCurrentState` | `current-state.ts` | REACHABLE | called from `routes/runs.ts`, `routes/runs-read.ts`, `projections/run-health.ts`, `projections/replay-summary.ts` |
| `emptyCurrentState` | `current-state.ts` (re-export from reducers/state) | REACHABLE | called inside `buildCurrentState` |
| `CurrentState` (type) | `current-state.ts` | REACHABLE | used by routes and replay-summary |
| `RunRow` (type) | `current-state.ts` | REACHABLE | exported from barrel; used by routes (state.runs lookup) |
| `GenerationRow` (type) | `current-state.ts` | REACHABLE | exported from barrel |
| `AgenomeRow` (type) | `current-state.ts` | REACHABLE | exported from barrel |
| `LineageEdgeRow` (type) | `current-state.ts` | REACHABLE | exported from barrel |
| `entitiesReducer` | `reducers/entities.ts` | REACHABLE | composed in `currentStateReducer` |
| `lifecycleReducer` | `reducers/lifecycle.ts` | REACHABLE | composed in `currentStateReducer` |
| `lineageReducer` | `reducers/lineage.ts` | REACHABLE | composed in `currentStateReducer` |
| `payloadId` | `reducers/state.ts` | REACHABLE | called by `entitiesReducer` |
| `buildLineageGraph` | `lineage-graph.ts` | REACHABLE | called from `routes/runs-read.ts` GET /runs/:id/lineage |
| `lineageToExport` | `lineage-export.ts` | **KNOWN-DEFERRED** (P6.11 throwaway spike) | referenced only from `spikes/neo4j/lineage-queries.ipynb`; intentionally not a runtime dependency |
| `ExportNode` (interface) | `lineage-export.ts` | **KNOWN-DEFERRED** | same as above |
| `ExportEdge` (interface) | `lineage-export.ts` | **KNOWN-DEFERRED** | same as above |
| `LineageExport` (interface) | `lineage-export.ts` | **KNOWN-DEFERRED** | same as above |
| `ReplayReader` (interface) | `replay-reader.ts` | TEST-ONLY | no production caller; `createReplayReader` only referenced in integration test |
| `createReplayReader` | `replay-reader.ts` | TEST-ONLY | only called from `test/integration/projections/replay-summary.test.ts` |
| `ReplayDigest` (interface) | `replay-summary.ts` | REACHABLE | part of `ReplaySummary` returned by `buildReplaySummary` |
| `ReplaySummary` (interface) | `replay-summary.ts` | REACHABLE | returned by `buildReplaySummary`; consumed by `routes/runs-read.ts` |
| `buildReplaySummary` | `replay-summary.ts` | REACHABLE | called from `routes/runs-read.ts` GET /runs/:id/replay |
| `listRunIds` | `run-list.ts` | REACHABLE | called from `routes/runs-read.ts` GET /runs |
| `CapUsage` (interface) | `run-health.ts` | REACHABLE | part of `RunHealth` response |
| `CapsConsumed` (interface) | `run-health.ts` | REACHABLE | part of `RunHealth` response |
| `OperationsInFlight` (interface) | `run-health.ts` | REACHABLE | part of `RunHealth` response |
| `RunHealth` (interface) | `run-health.ts` | REACHABLE | returned by `buildRunHealth`; sent via `routes/run-health.ts` |
| `buildRunHealth` | `run-health.ts` | REACHABLE | called from `routes/run-health.ts` GET /runs/:id/health |

### `apps/api/src/routes/`

| Symbol | File | Reachable? | Path |
|---|---|---|---|
| `registerRunRoutes` | `runs.ts` | REACHABLE | called from `buildServer` in `server.ts` |
| `overCapField` | `runs.ts` | REACHABLE | called within `registerRunRoutes` handler (POST /runs cap-rejection path) |
| `RunRoutesDeps` (interface) | `runs.ts` | REACHABLE | used by `buildServer` |
| `registerRunReadRoutes` | `runs-read.ts` | REACHABLE | called from `buildServer` |
| `RunReadRoutesDeps` (interface) | `runs-read.ts` | REACHABLE | used by `buildServer` |
| `registerRunHealthRoutes` | `run-health.ts` | REACHABLE | called from `buildServer` |
| `RunHealthRoutesDeps` (interface) | `run-health.ts` | REACHABLE | used by `buildServer` |
| `registerRunStreamRoutes` | `run-stream.ts` | REACHABLE | called from `buildServer` |
| `RunStreamRoutesDeps` (interface) | `run-stream.ts` | REACHABLE | used by `buildServer` |
| `registerModelRoutes` | `model-routes.ts` | REACHABLE | called from `buildServer` |
| `ModelRoutesDeps` (interface) | `model-routes.ts` | REACHABLE | used by `buildServer` |

### `apps/api/src/sse/`

| Symbol | File | Reachable? | Path |
|---|---|---|---|
| `streamRunEvents` | `event-bridge.ts` | REACHABLE | called from `registerRunStreamRoutes` handler (GET /runs/:id/stream) |
| `EventBridgeOptions` (interface) | `event-bridge.ts` | REACHABLE | referenced in `server.ts` `BuildServerDeps.sse` + `RunStreamRoutesDeps.sse` |
| `DEFAULT_SSE_INTERVAL_MS` | `event-bridge.ts` | REACHABLE | used inside `streamRunEvents` as the default poll interval |

### `apps/api/src/server.ts` (entry point exports)

| Symbol | File | Reachable? |
|---|---|---|
| `buildServer` | `server.ts` | REACHABLE (the production entry point itself; listen() deferred to P3) |
| `BuildServerDeps` (interface) | `server.ts` | REACHABLE |
| `DEFAULT_BODY_LIMIT` | `server.ts` | REACHABLE (used inside `buildServer`) |
| `DEFAULT_RUN_CONFIG` | `server.ts` | REACHABLE (used inside `buildServer` as the cap-maxima default) |

### `apps/api/src/runtime/`

| Symbol | File | Reachable? | Note |
|---|---|---|---|
| `createHeartbeat` | `heartbeat.ts` | **KNOWN-DEFERRED** (P6.10) | worker-loop + /health wiring deferred to P3/integration |
| `isWorkerAlive` | `heartbeat.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `Heartbeat` (interface) | `heartbeat.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `HeartbeatDeps` (interface) | `heartbeat.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `HeartbeatController` (interface) | `heartbeat.ts` | **KNOWN-DEFERRED** (P6.10) | same |

### `packages/observability/src/`

| Symbol | File | Reachable? | Note |
|---|---|---|---|
| `scrubObservabilityPayload` | `redaction.ts` | **KNOWN-DEFERRED** | called internally by `createEmitBoundary`; `@doppl/observability` not yet imported by any apps/api production file; full wire lands at P3/integration |
| `ObservabilityEmitter` (type) | `emit.ts` | **KNOWN-DEFERRED** | same |
| `LocalWarn` (type) | `emit.ts` | **KNOWN-DEFERRED** | same |
| `EmitBoundaryDeps` (interface) | `emit.ts` | **KNOWN-DEFERRED** | same |
| `EmitBoundary` (interface) | `emit.ts` | **KNOWN-DEFERRED** | same |
| `createEmitBoundary` | `emit.ts` | **KNOWN-DEFERRED** | P3/integration wire |
| `CorrelationIds` (interface) | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | kernel-logger wire deferred to P3/integration |
| `LogLevel` (type) | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `LogEntry` (interface) | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `KernelLogRecord` (interface) | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `KernelLogSink` (type) | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `KernelLoggerDeps` (interface) | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `KernelLogger` (interface) | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | same |
| `createKernelLogger` | `kernel-logger.ts` | **KNOWN-DEFERRED** (P6.10) | same |

---

## 2. Production entry point analysis

**`buildServer` in `apps/api/src/server.ts`** — the sole REST/SSE entry point for Phase 6.

From `buildServer` the following call chain is fully production-wired:

```
buildServer
  ├── registerRunRoutes        → buildCurrentState (POST /runs start/stop)
  ├── registerRunReadRoutes    → buildCurrentState, buildLineageGraph, buildReplaySummary, listRunIds
  ├── registerRunHealthRoutes  → buildRunHealth → buildCurrentState
  ├── registerRunStreamRoutes  → streamRunEvents
  └── registerModelRoutes
```

All projections reducers (`entitiesReducer`, `lifecycleReducer`, `lineageReducer`) and supporting utilities (`buildProjection`, `payloadId`, `emptyCurrentState`) reach production via `buildCurrentState`.

---

## 3. Unreachable symbols (beyond known-deferred set)

Two projection utility symbols have **no production caller** and are referenced only from test files:

### `canonicalize` — `apps/api/src/projections/projection-builder.ts:126`
- **Currently referenced from:** test only — `apps/api/test/unit/projections/projection-builder.test.ts`, `current-state.test.ts`, `replay-summary.test.ts`; `apps/api/test/integration/projections/current-state.test.ts`
- **Assessment:** This is a projection state-equivalence serialization utility (L27). It is exported from the projections barrel and is the correct tool for the P3/integration replay-equivalence assertion. It has **no production caller in `apps/api/src/`** today.
- **Recommended entry point:** `buildServer` → a future replay verification endpoint, or the P3 kernel worker's replay-equivalence check. Wire at P3/integration.
- **Step-9 routing:** Future TODO — wiring fits Phase P3 (integration / kernel worker), not a P6 gap. The symbol is available and correct; it just isn't called from a production path yet.

### `createReplayReader` / `ReplayReader` — `apps/api/src/projections/replay-reader.ts:15`
- **Currently referenced from:** test only — `apps/api/test/integration/projections/replay-summary.test.ts`
- **Assessment:** The replay-reader wraps `EventStore.readByRun` and provides the rule-#7-pinned read-only surface for replaying a run's event log. Per ARCHITECTURE.md §9, this surfaces at the P4/P5 replay-triggering path (and was explicitly called out in brief P6.9/P6.4 notes as a P3/integration consumer). No production caller exists in `apps/api/src/` today.
- **Recommended entry point:** The P3/integration kernel worker's replay-on-demand path, or a future `GET /runs/:id/replay` handler that returns a full `ReplaySummary`.
- **Step-9 routing:** Future TODO — wiring fits P3/integration. The current `GET /runs/:id/replay` route uses `buildReplaySummary` directly (with `readByRun` inlined by the route) rather than going through `createReplayReader`. Surfacing `createReplayReader` as the canonical replay API is a P3 concern.

### `isStale` / `latestSequence` — `apps/api/src/projections/watermark.ts`
- **Currently referenced from:** test only — `apps/api/test/unit/projections/projection-builder.test.ts` (isStale); `apps/api/test/integration/projections/projection-builder.test.ts` (both)
- **Assessment:** These are the staleness-check pair for the MVP projection-cache pattern (§9). The current routes rebuild projections on every read (no caching), so the cache-invalidation path (`isStale + latestSequence`) has no production caller. They are correct and complete; the production wire lands when the `dashboard_snapshots` cache (mentioned in route comments as "MVP — always fresh; deferred") is implemented.
- **Recommended entry point:** `buildServer` → `registerRunReadRoutes` (or `registerRunHealthRoutes`) once `dashboard_snapshots` caching is added.
- **Step-9 routing:** Future TODO — wiring fits P3/integration or a dedicated caching slice.

---

## 4. Known-deferred inventory (confirmed)

All known-deferred symbols per the audit brief are confirmed to be the only unreachable-from-production items matching their stated deferral reason:

| Deferred symbol group | Deferral brief | Confirmed? |
|---|---|---|
| `createKernelLogger` + all `kernel-logger.ts` types | P6.10 — live-worker loop + /health wire deferred to P3/integration | Yes — zero imports in `apps/api/src/` |
| `createHeartbeat` / `isWorkerAlive` + `heartbeat.ts` types | P6.10 — same | Yes — zero imports in `apps/api/src/` |
| `lineageToExport` / `ExportNode` / `ExportEdge` / `LineageExport` | P6.11 — throwaway spike (spikes/neo4j/lineage-queries.ipynb only) | Yes — not in projections barrel; not imported from any production file |
| All `packages/observability/src/` exports (`scrubObservabilityPayload`, `createEmitBoundary`, `createKernelLogger`, all types) | P6.9 SSE client consumption + P6.4 replay-summary consumers deferred; `@doppl/observability` not declared in `apps/api/package.json` `dependencies` | Yes — zero production imports in `apps/api/src/` or `apps/web/src/` |

No additional unknown-unreachable symbols were found outside the three utilities (`canonicalize`, `createReplayReader`, `isStale`/`latestSequence`) and the known-deferred groups above.

---

## 5. Summary

```
reachability-auditor: apps/api Phase 6 (demo track) — 44 exported symbols audited
  REACHABLE:          30
  UNREACHABLE (test-only, not known-deferred): 3 symbols (canonicalize, createReplayReader/ReplayReader, isStale/latestSequence)
  KNOWN-DEFERRED:     ~18 symbols across P6.10 heartbeat + P6.11 lineage-export + observability package

Unreachable symbols (recommend wiring tasks, Phase P3/integration):

1. apps/api/src/projections/projection-builder.ts:126 · canonicalize
   Currently referenced from: test only — test/unit/projections/{projection-builder,current-state,replay-summary}.test.ts + test/integration/projections/current-state.test.ts
   Recommended entry point: buildServer → future replay-equivalence check or kernel worker at P3/integration
   Step-9 routing: Future TODO — wiring fits P3/integration

2. apps/api/src/projections/replay-reader.ts:10,15 · ReplayReader (interface) + createReplayReader
   Currently referenced from: test only — test/integration/projections/replay-summary.test.ts
   Recommended entry point: buildServer → GET /runs/:id/replay handler (upgrade from inline readByRun to canonical ReplayReader) at P3/integration
   Step-9 routing: Future TODO — wiring fits P3/integration

3. apps/api/src/projections/watermark.ts:20,32 · isStale + latestSequence
   Currently referenced from: test only — test/unit/projections/projection-builder.test.ts + test/integration/projections/projection-builder.test.ts
   Recommended entry point: buildServer → registerRunReadRoutes/registerRunHealthRoutes (projection-cache staleness check) when dashboard_snapshots cache is added at P3/integration
   Step-9 routing: Future TODO — wiring fits P3/integration or a dedicated caching slice

Summary for orchestrator:
- 3 wiring tasks recommended across 1 entry point (buildServer / P3-integration route upgrade)
- All 3 are build-ahead-of-P3 utilities matching the established known-deferred pattern (canonicalize/ReplayReader/isStale already cited in LESSONS.md §27/§31/§33 as P3/integration carry-forwards)
- Phase-exit gate: CLEAR — no unreachable symbol exists outside the known-deferred set + these 3 P3-forward utilities
```

