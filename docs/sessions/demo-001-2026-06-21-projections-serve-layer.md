# Session demo-001 — Demo-track backend: projection builders + REST serve layer (P6.1–P6.7)

- **Date:** 2026-06-21
- **Phase:** Phase 6 (Projections, API & observability) — demo track, `apps/api`
- **Role:** demo-observability-implementer (backend / `apps/api`)
- **Branch:** `track/demo` (shared worktree with demo-web-implementer)
- **Predecessor:** `kernel-001-2026-06-21-freeze-bundle.md` (the kernel freeze bundle this track forked from)
- **Successor session:** `demo-002-2026-06-21-run-health-endpoint.md`

## Why this session existed

Phase 0 (contracts) + the kernel freeze bundle (P1+P2 subset) merged to integration, unblocking the
demo track. This session built the **read/serve/observe surface** over the authoritative event log: the
four projection builders (P6.1–P6.4), the observability redaction boundary (P6.5), and the REST
write+read API (P6.6/P6.7) — so the demo can be driven and watched. Kernel execution of a configured
run (P3) is unmerged; every slice was built + tested against the real event store (testcontainers) with
the run's execution deferred to P3 integration.

## What was built

Seven `/tdd` slices, each its own commit (test-first, RED→GREEN→commit):

| Slice | Commit | Summary |
|---|---|---|
| P6.1 projection-builder core | `7d2c6ec` | generic ordered fold + watermark/staleness + `ProjectionWatermark` contract |
| P6.5 observability redaction (safety-invariant) | `0e2f793` | Langfuse-emit-boundary scrub + payload ceiling; new `@doppl/observability` pkg |
| P6.2 current-state projection | `ef43fca` | 9-entity reducer injected into the P6.1 fold |
| P6.3 lineage-graph projection | `f6b324b` | pure transform → frozen `LineageGraphProjection` (producer) |
| P6.4 replay-summary (safety-invariant) | `548f25e` | rule-#7 replay reader + summary + older-schema fixture |
| P6.6 REST write path + Fastify | `034d587` | `buildServer` + POST /runs + /stop + bodyLimit |
| P6.7 REST read surface | `5b9590b` | 7 GET routes + `listRunIds` reader |

### Files created
- `packages/contracts/src/projections/projection-watermark.ts` — `ProjectionWatermark` `(runId, sequenceThrough)` contract (+ index re-export); spec(§9) field-name snapshot.
- `apps/api/src/projections/projection-builder.ts` — `buildProjection` (ordered fold, schemaVersion gate, gap/non-monotonic typed errors, watermark) + `canonicalize` + `ProjectionError`.
- `apps/api/src/projections/watermark.ts` — `isStale` (pure predicate) + `latestSequence` (parameterized boundary helper).
- `apps/api/src/projections/current-state.ts` + `reducers/{state,lifecycle,entities,lineage}.ts` — the 9-entity current-state reducer composed over the P6.1 fold.
- `apps/api/src/projections/lineage-graph.ts` — `buildLineageGraph` (current-state → frozen `LineageGraphProjection`).
- `apps/api/src/projections/replay-reader.ts` + `replay-summary.ts` — rule-#7 replay surface (`createReplayReader`, `buildReplaySummary` + `ReplayDigest`).
- `apps/api/src/projections/run-list.ts` — `listRunIds` (demo-owned distinct-run_id reader; read-imports the kernel schema, zero kernel-file edits).
- `apps/api/src/server.ts` — Fastify `buildServer` (bodyLimit, 5xx-sanitizing `setErrorHandler`, `DEFAULT_RUN_CONFIG`, route registration).
- `apps/api/src/routes/runs.ts` — POST /runs + POST /runs/:id/stop (`overCapField`).
- `apps/api/src/middleware/idempotency.ts` — in-memory idempotency-key store.
- `apps/api/src/routes/runs-read.ts` + `routes/model-routes.ts` — the 7 GET read routes.
- `packages/observability/**` — new `@doppl/observability` package: `scrubObservabilityPayload` + `createEmitBoundary`.
- Tests: `apps/api/test/{unit,integration}/projections/*` , `test/{unit,integration}/routes/*` , `test/fixtures/replay/older-schema-run.ts`, `packages/observability/test/*`, `packages/contracts/test/projections/projection-watermark.test.ts`.

### Files modified
- `apps/api/src/projections/index.ts` — barrel (builder, watermark, current-state, lineage, replay, run-list).
- `apps/api/src/index.ts` — export the Fastify server entry.
- `apps/api/package.json` + `pnpm-lock.yaml` — added `fastify ^5.8.5` (fastify-tree-only lockfile delta).
- `packages/contracts/src/index.ts` — re-export `projection-watermark`.

## Decisions made
- **Projections are reducers injected into the P6.1 fold** (never hand-rolled): current-state, lineage, replay all reuse `buildProjection` + `canonicalize`; keyed-by-id idempotent set.
- **Spec-grounded transition map (P6.2):** terminal/failure → frozen-enum status; `energy_exhausted` is mid-flight (per §5 the following `run.completed/failed` sets the terminal); generation phase-markers (verifying/scoring/reproducing) → `GenerationStatus` (orchestrator TWEAK); the 8 operation markers → no-op; cull → status, reproduction → edges.
- **Lineage edges = reproduction genealogy + guarded structural connectivity** (drop edges to absent nodes — React-Flow-safe); winner = candidate node with status `selected` (no 7th type).
- **Rule-#7 replay surface (P6.4):** `createReplayReader` exposes `Pick<EventStore,'readByRun'>` (append unreachable); no provider/`Math.random(`/`fetch(` (structural + behavioral pins); state-equivalence via `canonicalize`.
- **REST write path (P6.6):** validateRunConfig fail-fast; cap-override rejection (lowering-only, API defense layer); in-memory idempotency + one-active-run guard re-validated against the log; `setErrorHandler` sanitizes 5xx (no message leak); bodyLimit ingestion gate.
- **Read surface (P6.7):** rebuild-on-read (cache deferred); clean 404; `listRunIds` demo-owned (no kernel edit) + unblocks the active-run scan.

## Decisions explicitly NOT made (deferred)
- **`ReplaySummary` / current-state shapes kept apps/api-internal** — promote to shared contracts only when P7 needs a pinned `/replay` shape.
- **dashboard_snapshots cache + watermark-staleness check deferred** — rebuild-on-read MVP; the P6.1 watermark machinery awaits it.
- **Persisted/event-keyed idempotency + log-wide active-run scan** — in-memory MVP (single-process §5); hardening for hosted/multi-process (the `listRunIds` reader is the building block).
- **evidenceRefs full dereference = P1.7** (unmerged) — returned as-stored.
- **Fine-grained candidate/agenome status advancement** (under_review/checked/scored; active/spent/eligible_parent) — un-evented pending P3/P4/P5 emission.

## TDD compliance
**Clean — no violations.** Every slice was test-first: RED confirmed (failing on the missing symbol/route) before GREEN at each `/tdd` Step 2.5. Safety-invariant slices (P6.5, P6.4) ran the required security-reviewer (both CLEAR); P6.6 ran the recommended security-reviewer (2 [medium] fixed in-slice + re-verified CLEAR). Integration slices ran against real Postgres (testcontainers) + Fastify `inject` — no mocks on the truth-log path.

## Cross-doc invariant audit
**Clean.** No frozen Appendix-A model fields were added/removed/renamed this session — frozen models were consumed read-only. One NEW demo-track-local contract type (`ProjectionWatermark`, P6.1) was added + Step-9 flagged; the orchestrator's hot edits (apps/api/CLAUDE.md +9, LESSONS.md +98 — §27–§33) are present in the shared working tree. `LineageGraphProjection` (P6.3) + `ModelRoute` (P6.7) are served as a PRODUCER/read-only — no contract change (producer-conformance pinned via `safeParse`).

## Reachability
- **P6.1 buildProjection/canonicalize/watermark** → consumed by P6.2/6.3/6.4 + P6.7 read endpoints — WIRED.
- **P6.2 buildCurrentState** → GET /runs* (P6.7) + P6.6 active-run check — WIRED.
- **P6.3 buildLineageGraph** → GET /runs/:id/lineage (P6.7) — WIRED.
- **P6.4 buildReplaySummary/createReplayReader** → GET /runs/:id/replay (P6.7) — WIRED.
- **P6.6 routes + P6.7 read routes** → registered on `buildServer`, exercised via Fastify `inject` — WIRED (HTTP).
- **GAP (tested-but-unwired, named/deferred): P6.5 `createEmitBoundary`** → first production consumer is **P2.8** (kernel Langfuse adapter, unmerged) — Future TODO, P2.8 injects the real client.
- **GAP (deferred): production `buildServer().listen()` boot** (real config load + kernel execution pickup) → **P3/PD** integration. The server is inject-tested; no production `main()` calls `listen()` yet.

## Open follow-ups
**Step-9 items (routed hot; orchestrator verifies at /orchestrate-end):**
- LESSONS §27–§33 + apps/api/CLAUDE.md `ProjectionWatermark` cross-doc row (orchestrator hot edits — present in tree).
- **§2.5-seam Finding → lead:** P2.8 (kernel Langfuse adapter) MUST import the P6.5 `scrubObservabilityPayload` + before-emit boundary, never reimplement (drift = the L21 key-leak class).

**Carry-forward consumed this round (orchestrator triages at /orchestrate-end):**
- §14 redaction (P6.5 observability twin) + bodyLimit (P6.6) + IDs-opaque (P6.1–P6.7 parameterized) — DELETE candidates.

**Integration-reconcile flags (P3/P4/P5/hosted — orchestrator recording):**
- `energy_exhausted` terminal emission; generation phase + terminal emission; candidate fine-grained status advancement (P3/P4/P5).
- node-id cross-type uniqueness (namespace if the kernel allows collisions); evidenceRefs full-resolve (P1.7).
- persisted/event-keyed idempotency dedup; log-wide active-run scan (use `listRunIds`); idempotency-key length cap ([nit]).

## How to use what was built
- Build the server: `buildServer({ store, db, defaultConfig?, newId, bodyLimit?, modelRoutes? })` → Fastify instance (inject-testable; `listen()` boot is P3/PD).
- Projections: `buildCurrentState(events)` / `buildLineageGraph(currentState)` / `buildReplaySummary(events)` — all fold over `store.readByRun(runId)`; `canonicalize` for state-equivalence.
- Observability: `createEmitBoundary({ secretValues, emit, warn? })` — P2.8 injects the real Langfuse client.
