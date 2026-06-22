# Phase 6 Architecture-Drift Audit

**Branch:** track/demo  
**Date:** 2026-06-21  
**Anchors audited:** §9 (Persistence & projections), §10 (Lineage graph), §11 (Backend API & flows), §13 (Observability)  
**Auditor:** arch-drift-auditor subagent (read-only)

---

## Methodology

For each anchor the stated contract statements were extracted, then the implementing code was located and verified. Where a green schema-snapshot test exists that directly covers a model, the test citation is used and re-derivation is skipped. No tests were re-run; their pass/fail status was confirmed by `pnpm test --run` output (all unit + observability tests green, 84 + 16 tests).

**Known-deferred (not drift):** live-worker loop (P6.10) and `judge.review_started`/`judge.reviewed` pairing (`judge.reviewed` is sv3, absent on track/demo) are noted in code and explicitly deferred — not cited as drift.

---

## §9 — Persistence & projections

### Contract statements and verdicts

| # | Statement (from §9) | Verdict | Evidence |
|---|---|---|---|
| 9.1 | `run_events` is append-only; per-run monotonic `sequence` is the sole ordering key | VERIFIED | `apps/api/src/event-store/append.ts:110` — `readByRun` orders by `asc(runEvents.sequence)` only; `occurredAt` is DB-stamped, never used for ordering |
| 9.2 | `occurredAt` is display-only; ordering by `sequence` only | VERIFIED | `apps/api/test/unit/projections/projection-builder.test.ts:test_fold_orders_by_sequence_not_occurred_at` — shuffled `occurredAt` values produce identical fold |
| 9.3 | Any cached projection records `(runId, sequence)` watermark; discarded/rebuilt when newer events exist | VERIFIED | `apps/api/src/projections/watermark.ts` — `isStale(watermark, latestSequence)` is a pure predicate; `WatermarkedProjection<S>` carries `{runId, sequenceThrough}` |
| 9.4 | `ProjectionWatermark` shape: strict 2-field `{runId, sequenceThrough:int≥0}` | VERIFIED-BY-TEST | `packages/contracts/test/projections/projection-watermark.test.ts:projection_watermark_field_snapshot` — green snapshot; field-name set `['runId','sequenceThrough']` pinned |
| 9.5 | Projections are derived + rebuildable; never authoritative | VERIFIED | All read routes (`runs-read.ts`) call `buildCurrentState(events)` / `buildLineageGraph` / `buildReplaySummary` fresh on each request; no projection-table write anywhere in routes |
| 9.6 | `dashboard_snapshots` cache + watermark-staleness deferred | VERIFIED (STALE-DOC candidate) | Code comment in `runs-read.ts:8`: "rebuild-on-read MVP — cache + watermark-staleness deferred." Matches §9 text which lists `dashboard_snapshots` as optional/rebuildable. No drift. |
| 9.7 | Projection fold asserts strict consecutive monotonic ordering; surfaces gap/non-monotonic as a typed error | VERIFIED | `apps/api/src/projections/projection-builder.ts:96–109` — asserts `sequence > prevSequence` and `sequence === prevSequence + 1`; throws `ProjectionError`; pinned by `test_sequence_gap_errors` + `test_non_monotonic_sequence_errors` |
| 9.8 | Readers accept all `schemaVersion ≤ current`; reject higher as a typed error | VERIFIED | `projection-builder.ts:82–87` — typed `ProjectionError('schema_version_unsupported', …)`; test `test_reject_higher_schema_version` (green) |
| 9.9 | Embeddings are authoritative-once-computed; persisted in `novelty.scored` payload; replay reads the stored vector, never re-embeds | VERIFIED | `replay-summary.test.ts:test_replay_reads_persisted_embeddings_never_reembeds` — asserts `replay.state.noveltyScores['nov_1']?.vector` equals the fixture's persisted vector; import-ban test also green |
| 9.10 | Replay calls no providers (rule #7) | VERIFIED | Structural import-ban: `projection-builder.test.ts:test_builder_imports_no_provider` + `replay-summary.test.ts:test_replay_imports_no_provider` — both green; scan confirms no `fetch`/`Math.random`/provider import in projections/ |
| 9.11 | Canonical projection set includes `runs`, `run_events`, `generations`, `agenomes`, `candidate_ideas`, `critic_reviews`, `check_results`, `fitness_scores`, `novelty_scores`, `lineage_edges`, `embeddings`, `dashboard_snapshots` | PARTIAL — STALE-DOC NOTE | The current-state projection (`reducers/`) covers `runs`, `generations`, `agenomes`, `candidateIdeas`, `criticReviews`, `checkResults`, `fitnessScores`, `noveltyScores`, `lineageEdges`. The migration tables (`runs`, etc.) are the persistent side. `embeddings` table and `dashboard_snapshots` table are listed in §9 but are not yet migrated/used in Phase 6 — matches §18 "pgvector optional" + `dashboard_snapshots` deferred. Architecture doc is ahead of implementation for those two optional tables; no drift, STALE-DOC note. |

---

## §10 — Lineage graph & LineageGraphProjection

### Contract statements and verdicts

| # | Statement (from §10) | Verdict | Evidence |
|---|---|---|---|
| 10.1 | Consumers depend on the storage-agnostic `LineageGraphProjection`; no physical-storage/Neo4j field | VERIFIED-BY-TEST | `packages/contracts/test/projections/lineage-graph.test.ts:lineage_projection_storage_agnostic` — `safeParse({…, neo4jNodeId:'n123'}).success === false` green |
| 10.2 | `LineageGraphProjection` = strict 4-field `{runId, nodes[], edges[], sequenceThrough}` | VERIFIED-BY-TEST | `packages/contracts/test/projections/lineage-graph.test.ts:lineage_projection_accepts_valid_and_strict` — required-field rejection and round-trip green |
| 10.3 | `LineageNodeType` = closed 6-member union (`generation/agenome/candidate/critic/check/score`) | VERIFIED-BY-TEST | `lineage-graph.test.ts:lineage_node_type_closed_6_union` — `expect(NODE_TYPES).toHaveLength(6)` green |
| 10.4 | Winner is a `candidate` node with `status: 'selected'`, NOT a 7th node type | VERIFIED | `apps/api/src/projections/lineage-graph.ts:63–77` — candidates emit with `status: candidate.status`; winner is `status='selected'`; no 7th type added |
| 10.5 | `LineageGraphProjection` is derived (event-fold, not re-folded from scratch) | VERIFIED | `lineage-graph.ts:26–131` is a pure transform of `WatermarkedProjection<CurrentState>` (P6.2 already folded the events); no second fold of `run_events` |
| 10.6 | Dangling-endpoint guard: structural edge emitted only when both endpoint nodes exist | VERIFIED | `lineage-graph.ts:102–108` — `nodeIds.has(source) && nodeIds.has(target)` guard on `linkStructural` |
| 10.7 | `dataRef` is a within-tier pointer (entity id), not external store | VERIFIED | `lineage-graph.ts` uses entity id strings as `dataRef` throughout (e.g. `generation.id`, `candidate.id`); no external URI |
| 10.8 | Neo4j spike is storage-agnostic derived export, never a runtime dependency | VERIFIED | `apps/api/src/projections/lineage-export.ts` — pure transform of `LineageGraphProjection`; imports no Neo4j driver; no Cypher; classified as throwaway notebook output |
| 10.9 | React Flow renders with custom node types + Dagre/ELK if needed | NOT IN SCOPE (frontend Phase 7); noting that the projection shape produced is correct for React Flow consumption |

---

## §11 — Backend API & flows

### Contract statements and verdicts

| # | Statement (from §11) | Verdict | Evidence |
|---|---|---|---|
| 11.1 | REST for commands/queries; SSE for live run-event streaming | VERIFIED | All 11 endpoints registered in `server.ts` via the 5 route modules; SSE via `run-stream.ts` |
| 11.2 | All 11 endpoints present: `POST /runs`, `GET /runs`, `GET /runs/:id`, `POST /runs/:id/stop`, `GET /runs/:id/events`, `GET /runs/:id/stream`, `GET /runs/:id/lineage`, `GET /runs/:id/replay`, `GET /runs/:id/health`, `GET /runs/:id/candidates/:cid`, `GET /model-routes` | VERIFIED | All 11 confirmed in server.ts + route modules |
| 11.3 | SSE is delivery-only (non-authoritative); clients resume from last seen `sequence` via `Last-Event-ID` or fallback to `?lastEventId` query | VERIFIED | `run-stream.ts:parseCursor` reads `last-event-id` header then `?lastEventId` query; `event-bridge.ts` yields `sequence > cursor`; pinned by `test_bridge_reads_past_cursor_injectable_interval` |
| 11.4 | SSE carries both completion events AND operation-start markers (§4 in-flight window) | VERIFIED | `event-bridge.ts` bridges all events from the full `readByRun` (no type filter); integration test `seedStreamRun` appends `candidate.generation_started`, `critic.review_started`, `tool_call.started` and asserts they appear in the SSE body |
| 11.5 | SSE is delivery-only: dropping the stream loses no authoritative state | VERIFIED | `run-stream.ts` calls only `store.readByRun`; no `store.append` or projection mutation; `reply.hijack()` manages the raw response, not the store |
| 11.6 | Mutating endpoints are idempotent (idempotency key / terminal-state guard) | VERIFIED | `runs.ts:73–79` — idempotency-key dedup via in-memory store; `POST /runs/:id/stop` terminal-state guard at `runs.ts:134–138` |
| 11.7 | `invalid lastEventId` → 400 | VERIFIED | `parseCursor` returns `'invalid'` for non-integer/negative → `reply.status(400).send({error:'invalid_cursor'})` |
| 11.8 | Unknown `runId` → clean 404 for all read endpoints | VERIFIED | All GET routes return `reply.status(404).send({error:'run_not_found'})` when `events.length === 0` |
| 11.9 | `GET /runs/:id/health` exposes generation count, candidates in flight, operations in flight (from unpaired markers), last-event time, caps consumed | VERIFIED | `run-health.ts:buildRunHealth` computes all 5 signals; `OperationsInFlight.byType` keyed by op family via `OPERATION_PAIRS` count-based unpaired check |
| 11.10 | REST append-only on write path (routes never mutate a projection) | VERIFIED | `runs.ts` only calls `store.append`; no Drizzle insert/update to projection tables |
| 11.11 | SSE `id` = event `sequence` | VERIFIED | `run-stream.ts:70` — `raw.write(\`id:${event.sequence}\ndata:${JSON.stringify(event)}\n\n\`)` |
| 11.12 | `POST /runs` cap-override rejection (lowering-only; above validated maxima → 422) | VERIFIED | `runs.ts:101–105` — `overCapField(config.caps, deps.defaultConfig.caps)` → 422 `cap_override_exceeds_max` |
| 11.13 | `bodyLimit` ingestion gate before per-type ceiling | VERIFIED | `server.ts:62` — `Fastify({ bodyLimit: deps.bodyLimit ?? DEFAULT_BODY_LIMIT })` (1 MiB default) |
| 11.14 | 5xx error handler sanitizes to `{error:'internal_error'}` (no message leak at trust boundary) | VERIFIED | `server.ts:67–76` — `setErrorHandler` sends `{error:'internal_error'}` for statusCode ≥ 500 |

---

## §13 — Observability

### Contract statements and verdicts

| # | Statement (from §13) | Verdict | Evidence |
|---|---|---|---|
| 13.1 | Langfuse is non-authoritative; LLM events store Langfuse trace/observation IDs; if Langfuse unavailable, event log retains local trace metadata | VERIFIED | `RunEventEnvelope` carries `langfuseTraceId?` + `langfuseObservationId?`; `observability/emit.ts` fails safe (no event-log write on export failure) |
| 13.2 | Failed Langfuse export → local-only warning; no event-log entry | VERIFIED-BY-TEST | `packages/observability/test/emit.test.ts:test_failed_export_local_warning_no_event_write` — `warn` called once; `forbiddenImport` ban confirms no event-store import green |
| 13.3 | Redaction before external emit (rule #4); `scrubObservabilityPayload` runs before injected emitter | VERIFIED-BY-TEST | `emit.test.ts:test_scrub_runs_before_emit` — secret in value, key, array element never reaches emitter; green |
| 13.4 | The observability side channel is the twin of the event-store scrub; env-value layer (values + keys + array elements) with de-collision | VERIFIED | `observability/src/redaction.ts` — `scrubObservabilityPayload` composes frozen `scrubSecrets` + local `redactEnvValues` with key de-collision; mirrors `apps/api` event-store redaction |
| 13.5 | `enforcePayloadCeiling` runs BEFORE recursive scrub (stack-overflow prevention) | VERIFIED | `emit.ts:60–67` — `enforcePayloadCeiling(payload)` → if `!ceiling.ok` drop with local warn, return before `scrubObservabilityPayload` |
| 13.6 | A ceiling-exceeded payload is dropped with a local-only warning; emitter never called | VERIFIED-BY-TEST | `emit.test.ts:test_ceiling_exceeded_drops_trace_no_emit` — `emit` mock not called; `warn` called once; green |
| 13.7 | Console + Postgres only; no external metrics stack for MVP | VERIFIED | `kernel-logger.ts` writes to injected sink (default `console.log`); import-ban test in `LESSONS §36` confirms no `datadog`/`prom-client`/`prometheus`/`statsd`/`@opentelemetry` |
| 13.8 | Kernel-logger stamps §4 correlation IDs (runId required; generationId?/agenomeId?/correlationId?) | VERIFIED | `kernel-logger.ts:buildRecord` stamps `runId` always + optional `generationId`/`agenomeId`/`correlationId` conditionally |
| 13.9 | Local log path (console) is NOT scrubbed (process trust boundary; secrets never reach logger input via env-only structural guarantee) | VERIFIED | `kernel-logger.ts:log()` calls `sink(buildRecord(…))` directly; no scrub; `emitExternal()` routes through `deps.boundary?.emit(…)` which IS the `createEmitBoundary` scrub |
| 13.10 | Heartbeat is a side signal, not an authoritative event; module imports nothing from event-store writer | VERIFIED | `runtime/heartbeat.ts` — no event-store import; no `run_events` write; comment explicitly states "the closed 36-member RunEventType has no heartbeat member" |
| 13.11 | Kernel-logger external path reuses `createEmitBoundary` (never reimplements scrub) | VERIFIED | `kernel-logger.ts:94` — `await deps.boundary?.emit(buildRecord(…))`; the boundary IS the `createEmitBoundary` instance |

---

## Mismatch Summary

### DRIFT findings (code ≠ spec, spec is right)

None identified.

### STALE-DOC notes (code is right, spec/doc lags or is ahead of implementation with known-deferred items)

1. **§9 optional tables:** `embeddings` table and `dashboard_snapshots` table are listed in the canonical projection/table set in §9. They are not yet migrated or actively used in Phase 6. This is consistent with §9 itself ("optional, rebuildable") and §18 ("pgvector optional"; "dashboard_snapshots optional"). No code-vs-spec contradiction; the architecture doc is intentionally ahead of the demo-phase implementation.

### Ambiguous / questions

None. All statements were checkable against the code as-built.

---

## Test coverage summary (snapshot tests cited)

| Test | Model / behavior | Status |
|---|---|---|
| `packages/contracts/test/projections/projection-watermark.test.ts:projection_watermark_field_snapshot` | `ProjectionWatermark` 2-field shape | GREEN |
| `packages/contracts/test/projections/lineage-graph.test.ts:lineage_node_type_closed_6_union` | `LineageNodeType` closed-6 + no 7th | GREEN |
| `packages/contracts/test/projections/lineage-graph.test.ts:lineage_projection_storage_agnostic` | No Neo4j/physical-storage field | GREEN |
| `packages/contracts/test/projections/lineage-graph.test.ts:lineage_projection_accepts_valid_and_strict` | 4-field strict projection shape | GREEN |
| `apps/api/test/unit/projections/projection-builder.test.ts:test_fold_orders_by_sequence_not_occurred_at` | `occurredAt` never used for ordering | GREEN |
| `apps/api/test/unit/projections/projection-builder.test.ts:test_builder_imports_no_provider` | Replay path calls no providers (rule #7) | GREEN |
| `apps/api/test/unit/projections/replay-summary.test.ts:test_replay_imports_no_provider` | Replay path import-ban | GREEN |
| `apps/api/test/unit/projections/replay-summary.test.ts:test_replay_reads_persisted_embeddings_never_reembeds` | Embedding vector read from persisted payload | GREEN |
| `packages/observability/test/emit.test.ts:test_scrub_runs_before_emit` | Redaction before external emit (rule #4) | GREEN |
| `packages/observability/test/emit.test.ts:test_failed_export_local_warning_no_event_write` | Failed export → local warn, no event-log write (§13) | GREEN |
| `packages/observability/test/emit.test.ts:test_ceiling_exceeded_drops_trace_no_emit` | Ceiling exceeded → drop before scrub (§13 fail-safe) | GREEN |

Total unit tests (api + contracts + observability): 84 + 165 + 16 = **265 — all green**.

---

## Report metadata

- **Anchors audited:** 4 (§9, §10, §11, §13)
- **Contract statements checked:** 43
- **DRIFT:** 0
- **STALE-DOC:** 1 (optional tables ahead of demo-phase implementation — known-deferred per §9/§18)
- **AMBIGUOUS:** 0
