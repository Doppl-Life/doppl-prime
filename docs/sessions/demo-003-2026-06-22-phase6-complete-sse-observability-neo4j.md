# Session demo-003 — Phase 6 complete: SSE · self-observability · Neo4j export spike · gate-fixes

**Date:** 2026-06-22
**Track:** demo · **Area:** backend (`apps/api`) + `packages/observability` · **Phase:** 6 (projections, API & observability)
**Role:** implementer (demo-observability-implementer)
**Predecessor:** [demo-002](demo-002-2026-06-21-run-health-endpoint.md) (round-2 — P6.8 run-health)
**Successor:** [demo-004](demo-004-2026-06-22-sv5-projection-reconcile.md) (round-4 — sv5 projection reconcile)
**Round:** 3 (continuous-roll; sealed at this `/session-end` + the orchestrator's `/orchestrate-end`)

## Why this session existed
Round-3 backend/obs scope: finish Phase 6 (the read/serve/observe surface over the authoritative event log). Round 1 landed P6.1–P6.7 (projection builders + observability redaction + REST write/read); round 2 landed P6.8 (run-health). Round 3 closes the remaining obs slices — **P6.9 (SSE)**, **P6.10 (runtime self-observability)**, **P6.11 (Neo4j spike, closes Phase 6)** — then the **`/phase-exit P6` gate-fix bundle** to take the gate fully CLEAR.

## What was built

### Files created
- `apps/api/src/sse/event-bridge.ts` — **P6.9** demo-owned SSE event-bridge: an async-generator that polls `readByRun` past a cursor and yields events with `sequence > cursor` in order; injectable `sleep`/`maxIdlePolls`/`signal` (no real timers); delivery-only (read-imports the event store, no kernel edit).
- `apps/api/src/routes/run-stream.ts` — **P6.9** `GET /runs/:id/stream`: SSE framing (`id`=sequence), `Last-Event-ID` (+`?lastEventId`) resume, `reply.hijack()`+raw `text/event-stream`, client-disconnect → `AbortController`.
- `packages/observability/src/kernel-logger.ts` — **P6.10** structured kernel-logger: stamps §4 correlation IDs onto records → injected sink (default console, unscrubbed §32); `emitExternal` reuses `createEmitBoundary` (rule #4).
- `apps/api/src/runtime/heartbeat.ts` — **P6.10** worker-alive heartbeat: injected-clock throttle (≤1 beat/intervalMs, no real timer) + pure `isWorkerAlive` staleness predicate. (NEW `runtime/` dir; merges cleanly with kernel-P3.)
- `apps/api/src/projections/lineage-export.ts` — **P6.11** pure `lineageToExport(projection)`: derived, read-only, storage-agnostic transform of the P6.3 `LineageGraphProjection` → Neo4j-importable shape (carries watermark + runId).
- `spikes/neo4j/lineage-queries.ipynb` — **P6.11** throwaway notebook documenting the 4 Cypher query shapes (ancestors-of-winner, parent-contribution, critic-kill, lineage distance/diversity); doc-only, never a runtime dep.
- Test files: `test/integration/routes/run-stream.test.ts`, `test/unit/sse/event-bridge.test.ts`, `packages/observability/test/kernel-logger.test.ts`, `test/unit/runtime/heartbeat.test.ts`, `test/unit/projections/lineage-export.test.ts`.

### Files modified
- `apps/api/src/server.ts` — **P6.9** registers the stream route; `buildServer` gains `sse?: EventBridgeOptions` (prod default real sleep/maxIdlePolls=∞).
- `packages/observability/src/index.ts` — **P6.10** exports the kernel-logger.
- **Gate-fixes (`0aa031e`):** `run-stream.ts` (empty `Last-Event-ID` → from-start; keep-alive `TODO(hosted)`), `lineage-graph.ts` (kind-prefixed `struct:`/`repro:` edge ids), `lineage-export.ts` (carries `runId`), `run-health.ts` (CapsConsumed omission comment), `runs.ts` (`cancelled` forward-compat comment), `packages/observability/test/emit.test.ts` (§13/§14 detectable spec-tags).
- Prettier-normalize (`ec99178`): P6.9/P6.10 test files (format-only — see Decisions).

### Commits this session
- `3270745` feat(api): SSE run-event stream (P6.9)
- `9fb79b4` feat(api): runtime self-observability — kernel-logger + heartbeat (P6.10)
- `ec99178` style: prettier-normalize P6.9/P6.10 obs test files
- `2416292` feat(api): Neo4j lineage-export spike (P6.11 — **closes Phase 6**)
- `0aa031e` fix(api): P6 gate-fixes — SSE empty-cursor, unique edge-ids, §13 tag, +2 low
- `c6eaa90` style(api): wrap lineage-graph repro-edge line (format:check follow-up — see Open follow-ups)

## Decisions made
- **SSE bridge = poll `readByRun` past the cursor** (read-imported, no kernel append-hook edit — track-isolated like P6.7 `listRunIds`); an append→notify bus is a deferred hosted/P3 optimization. Injectable `sleep`/`maxIdlePolls` keeps tests timer-free.
- **SSE `id` = event `sequence`** so `Last-Event-ID` resume is gap/dup-free (sequence sole ordering). Rule-#2 delivery-only pinned two ways (count-unchanged + re-stream byte-identical).
- **kernel-logger trust split** — local `log()`/console NOT scrubbed (§32 process trust boundary); only `emitExternal` routes through the reused §28 `createEmitBoundary` (rule #4, never reimplemented).
- **heartbeat = injected-clock throttle** (not a real `setInterval`) — deterministic + lets the P3 worker loop call `beat()` each iteration without a second scheduler.
- **lineage-export = §30 secondary-projection** — pure read-only transform (carry the watermark, never re-fold), storage-agnostic (no Neo4j driver in apps/api), structural no-append-import.
- **Neo4j notebook = doc-only throwaway** — no live Neo4j in the build env; the spike must never block the demo.
- **Gate-fix edge-ids = kind-prefixed** (`struct:`/`repro:`) — decouples the two edge kinds so they can never collide on id (React Flow dup-edge break); the producer complement to P7.7's dangling-edge drop.
- **Empty `Last-Event-ID` = no cursor (from-start)** — `Number('')===0` was silently skipping seq 0; trim → -1, distinct from a real `0`.
- **Two-commit close for P6.11** (style-then-feat) — kept the formatting fix of prior test files out of the feat commit.

## Decisions explicitly NOT made (deferred)
- **Live-worker wiring (P3/integration):** the worker loop that calls `logger.log`/`emitExternal` + `heartbeat.beat`, and the P6.8 `/health` surfacing of last-heartbeat (via `isWorkerAlive`) — built ahead, exercised vs injected deps; wires when the P3 kernel/worker lands.
- **SSE append→notify bus** — kept the poll for MVP; in-process notify is a hosted/P3 optimization.
- **Live Neo4j execution + a dashboard "export lineage" action** — `lineageToExport` is ready; wiring deferred (hosted/post-demo).
- **A Postgres logs table** for the kernel-logger sink — console + injected sink for MVP; table is hosted hardening.
- **HTTP/2 keep-alive header drop** + **`run.cancelled` event** — in-code `TODO(hosted)`/`forward-compat` notes; carry-forward.

## TDD compliance
**Clean — no violations.** Every slice was test-first: RED confirmed for the right reason before GREEN (P6.9 unit+integration; P6.10 kernel-logger+heartbeat; P6.11 lineage-export; gate-fixes empty-cursor/edge-ids/runId). The §13 spec-tag retag, the 2 `[low]` doc comments, and the 2 defer-notes were doc/tag-only (no behavior change — exempt). `ec99178` was format-only.

## Cross-doc invariant audit (multi-track → memory check)
**No Appendix-A model field changed this session.** `LineageExport` gained `runId`, but it is an `apps/api`-internal spike shape (not an Appendix-A contract) — flagged at Step 9 as "not a cross-doc invariant." P6.9/P6.10/P6.11 all consume frozen contracts read-only (RunEventEnvelope, LineageGraphProjection, the §28 boundary). No drift.

## Reachability
- **P6.9 SSE** — reachable from `buildServer` (prod Fastify entry) → `GET /runs/:id/stream` → `streamRunEvents` → `readByRun`; proven by the integration test against the real server. Downstream client (P7.1 sseStream + P7.2 store) wired at integration.
- **P6.10 kernel-logger + heartbeat** — build-ahead: exercised vs injected deps; the live worker-loop + `/health` last-heartbeat read are a named P3/integration deferral (not a silent gap). `createKernelLogger` is a package export; `createHeartbeat`/`isWorkerAlive` exported for the P3 consumer.
- **P6.11 lineage-export** — throwaway spike, no production entry by design (exercised by its unit test + the notebook; runtime works with the notebook absent).
- **Gate-fixes** — fixes to already-wired P6 surfaces (run-stream, lineage-graph→/lineage+P7.7, lineage-export, run-health).

## Open follow-ups
- **P3/integration wiring (Future TODO — belongs to a phase):** worker loop → `logger.log`/`emitExternal` (`await` it — security `[low]`) + `heartbeat.beat`; `/health` ← `isWorkerAlive(last-heartbeat)`; SSE consumption by P7.1/P7.2; live Neo4j + dashboard export action; optional Postgres logs table.
- **In-code defer-notes (hosted/P3):** drop `connection: keep-alive` under HTTP/2; add a `run.cancelled` event when the kernel emits cancellation.
- **sv3/P0.16 reconcile** — STAYS the demo→cody-merge item (not a track/demo slice): `judge.reviewed` reducer (P6.2), judge in lineage (P6.3), judge-in-flight pairing (P6.8). Needs the sv3 contracts + live P4/P5 judge events.
- **Process (adopted):** `pnpm format:check` is now in the per-slice gate (orchestrator banked LESSONS §37) — `/tdd` Step 8 alone didn't run it, so P6.9/P6.10 test files landed format-dirty and were normalized in `ec99178`.

## Preflight status
- **My code area is CLEAN** — `apps/api`: lint ✓ / format ✓ / typecheck ✓ / 86 unit; `packages/observability`: lint ✓ / format ✓ / 16. (apps/api integration 56/56 separately.)
- **`/session-end` self-catch:** the gate-fix `repro:`-prefix edit pushed a lineage-graph line to 102 cols; my Step-8 format:check had run from the wrong cwd (scoped away from apps/api) and missed it — fixed in `c6eaa90`. Reinforces §37 (run format:check at area scope in the per-slice gate).
- **FINDING (workspace-wide preflight blocker, NOT my territory):** `pnpm -r lint` fails with 357 no-undef errors across 4 files in the **vendored design-system prototype** `docs/doppl-design-system/templates/doppl-observatory/` (incl. `ds-base.js`). eslint isn't ignoring the vendored prototype — same class as the 2026-06-21 `scaffold/` eslint-ignore hotfix. Root-config territory (eslint.config.mjs); predates this slice. Recommend the orchestrator/lead add `docs/doppl-design-system/**` to the eslint ignores before the round push. Also: `.prettierignore` carries an uncommitted web-impl edit (Playwright artifacts) riding the round.

## Phase 6 status
**COMPLETE.** All P6 tasks landed (P6.1–P6.11). `/phase-exit P6` ran — 4 auditors CLEAR; the gate-fix bundle (`0aa031e`) closed the surfaced findings; `spec-lint tests 6` PASS all 4 anchors (§9/§10/§11/§13) → **gate fully CLEAR**.

## Suite deltas (this session)
- apps/api unit: **76 → 86** (+10: 1 bridge, 3 heartbeat, 4 lineage-export, 2 gate-fix unit).
- apps/api integration: **49 → 56** (+7: 6 SSE route, 1 empty-cursor).
- `packages/observability`: **12 → 16** (+4 kernel-logger).
