# Backend API (REST + SSE)

## Executive summary

This layer is the **edge of the backend** — the only door the outside world (the React dashboard, an operator's `curl`, a demo) uses to talk to Doppl. It is built on **Fastify**, a Node HTTP framework, and it does two jobs. First, it handles **REST** requests: `POST` commands that *start* and *stop* a run, and `GET` queries that *read* the current state, lineage, replay summary, health, and shared-knowledge graph of a run. Second, it streams **SSE** (Server-Sent Events) — a long-lived HTTP connection that pushes each run event to the browser the moment it lands, so the dashboard shows agents working *live* rather than polling.

The golden rule here is a one-way street: **writing goes through REST and only ever appends events to the log; reading and streaming never change anything.** When you `POST /runs`, the route appends a single `run.configured` event and the kernel takes over. When you `POST /runs/:id/stop`, the route does *not* write a stop event — it just *signals* the running worker, which drains its work and writes the terminal event itself. Everything you read (state, lineage, health) is rebuilt fresh from the event log on every request. This layer also owns the **boot sequence** (`bootApp`) — the single place the server reads the environment, runs DB migrations, optionally seeds a demo fixture, repairs any crash-orphaned runs, and only *then* starts listening for HTTP requests.

## Responsibilities

- **Accountable for:**
  - The HTTP/REST command surface: `POST /runs` (configure + start), `POST /runs/:id/stop` (signal a stop). `apps/api/src/routes/runs.ts:97`, `:196`.
  - The HTTP/REST read surface: `GET /runs`, `GET /runs/:id`, `GET /runs/:id/events`, `/lineage`, `/knowledge`, `/replay`, `/candidates/:cid`. `apps/api/src/routes/runs-read.ts:25`.
  - The SSE live stream `GET /runs/:id/stream` and its resume-by-sequence semantics. `apps/api/src/routes/run-stream.ts:39`.
  - The operator-diagnostic endpoint `GET /runs/:id/health` (the "continue vs. switch to replay" signal). `apps/api/src/routes/run-health.ts:16`.
  - The demo/config read endpoints: `GET /model-routes`, `GET /problem-sets`, `GET /demo/fallback-ladder`, `GET /config/caps`.
  - **Idempotency** of mutating requests (an `Idempotency-Key` dedup) and **terminal-state guarding** of stop. `apps/api/src/middleware/idempotency.ts`, `runs.ts:204`.
  - The **omit-null wire serializer** that drops `null`/`undefined` optionals so the frozen `RunEventEnvelope` re-parses on the browser. `apps/api/src/routes/_support/serializeEnvelope.ts`.
  - The **boot composition** (`bootApp`): the single process-IO + dependency-injection site. `apps/api/src/main.ts:196`.
  - **Boundary error hygiene** — sanitizing 5xx errors to `{error:'internal_error'}` so no internal message leaks at the trust boundary. `apps/api/src/server.ts:90`.

- **Explicitly NOT responsible for:**
  - **Authoritative state.** It owns no state; it folds the log on read and appends on write. The kernel and event store own truth.
  - **Cap / energy / kill-switch enforcement.** The route's cap-override check is a *defense layer* (rejects above-maxima); the **kernel** is the authoritative enforcer (safety rule #1). `runs.ts:152`.
  - **Terminalizing a run.** Stop *signals*; the worker writes `run.stopped`. `runs.ts:213`.
  - **Generation, scoring, judging.** Those live in the runtime kernel / verifier / selection layers; the route fires a fire-and-forget trigger and returns 201.
  - **Direct DB writes from a handler.** No route imports drizzle or calls `.insert/.update/.delete`; pinned by a source-scan test (`runs.test.ts:267`).

## Key components

| Component | What it does | Where |
|-----------|--------------|-------|
| `buildServer(deps)` | Composes the Fastify instance: error handler + every route registration | `apps/api/src/server.ts:84` |
| `DEFAULT_RUN_CONFIG` | The standalone/test default config; its `caps` are the POST-overridable maxima — `maxToolCalls`/`wallClockTimeoutMs` single-sourced from `DEFAULT_CAPS` | `apps/api/src/server.ts:37` |
| `bootApp(overrides?)` | The boot spine: loadConfig → migrate → seed → crash-forward → buildServer → listen | `apps/api/src/main.ts:196` |
| `registerRunRoutes` | The write path: `POST /runs` + `POST /runs/:id/stop` | `apps/api/src/routes/runs.ts:85` |
| `registerRunReadRoutes` | The 7 read GETs (list, state, events, lineage, **knowledge**, replay, candidate) | `apps/api/src/routes/runs-read.ts:25` |
| `GET /runs/:id/knowledge` | Folds `buildResearchNotes` → the `ResearchKnowledgeGraph` (the stigmergy KB substrate); rebuild-on-read; 404 on empty/unknown run | `apps/api/src/routes/runs-read.ts:80` |
| `registerRunStreamRoutes` | `GET /runs/:id/stream` — SSE, resume by `Last-Event-ID` | `apps/api/src/routes/run-stream.ts:39` |
| `streamRunEvents` | The SSE event-bridge: polls `readByRun` past a cursor, yields `sequence > cursor` | `apps/api/src/sse/event-bridge.ts:54` |
| `serializeEnvelope` | The omit-null (deep, Date-guarded) wire serializer | `apps/api/src/routes/_support/serializeEnvelope.ts:43` |
| `createIdempotencyStore` | First-writer-stable in-memory `Idempotency-Key → runId` map | `apps/api/src/middleware/idempotency.ts:14` |
| `overCapField` | Pure "which cap exceeds its maximum?" check (lowering-only gate) | `apps/api/src/routes/runs.ts:63` |

## Interfaces & contracts

**HTTP surface** (the full endpoint set, ARCHITECTURE.md §11):

```text
POST /runs                      GET /runs            GET /runs/:id
POST /runs/:id/stop             GET /runs/:id/events GET /runs/:id/stream   (SSE)
GET  /runs/:id/lineage          GET /runs/:id/replay GET /runs/:id/health
GET  /runs/:id/knowledge        GET /runs/:id/candidates/:cid
GET  /model-routes              GET /problem-sets
GET  /demo/fallback-ladder      GET /config/caps
```

`GET /runs/:id/knowledge` is a NEW endpoint (the Shared Knowledge Space / stigmergy KB feature, [11-shared-knowledge-space.md](11-shared-knowledge-space.md)); like `/config/caps` it postdates the §11 enumeration — see the drift note below.

**Command request/response shapes** (web consumes these actual shapes, PD.15/16):

- `POST /runs` body = a partial `RunConfig` (deep-merged over defaults) + an optional route-only `demoOverride` cap-lowering field. Responses: `201 {runId}` on create; `200 {runId, idempotent:true}` on a repeated `Idempotency-Key`; `400 {error:'invalid_config'}`; `422 {error:'cap_override_exceeds_max', field}`; `422 {error:'model_route_override_not_permitted', ...}`; `409 {error:'run_already_active', activeRunId}`. `runs.ts:97-194`.
- `POST /runs/:id/stop` → `202 {runId, stopRequested:true}` (non-terminal, signal sent); `200 {runId, status, stopped:false}` (already terminal, no-op); `404 {error:'run_not_found'}`. `runs.ts:196-215`.

**Query response shapes:**

- `GET /runs` → `{runs:[{runId, status, sequenceThrough}]}` (`runs-read.ts:27`).
- `GET /runs/:id` → `{runId, sequenceThrough, state}` (the current-state projection) (`runs-read.ts:40`).
- `GET /runs/:id/events?since=N` → `{runId, events}` filtered to `sequence > N` (`runs-read.ts:49`).
- `GET /runs/:id/lineage` → `LineageGraphProjection` (`runs-read.ts:71`); `GET /runs/:id/replay` → the replay summary (`runs-read.ts:88`); `GET /runs/:id/candidates/:cid` → a `CandidateIdea` projection (`runs-read.ts:97`).
- `GET /runs/:id/knowledge` → `WatermarkedProjection<ResearchKnowledgeGraph>` `{runId, sequenceThrough, state}` — the stigmergy KB graph (`{notes, edges, agenomes}`) folded from the agents' `tool_call.finished` research + the `retrieved`/`cited`/`culled` edges; `404 {error:'run_not_found', runId}` on an unknown/empty run (mirrors the other read endpoints). `buildResearchNotes(events)` (`runs-read.ts:80`, builder `research-notes.ts:242`).
- `GET /runs/:id/health` → the run-health projection (generation, candidates-in-flight, operations-in-flight, caps consumed, last-event time) (`run-health.ts:16`).

**Contract types it leans on** (from `packages/contracts`, imported never redefined):
- `RunConfig` / `RunCaps` — the validated config body and the cap ceilings. `runs.ts:5`.
- `RunEventEnvelope` — the frozen 14-field event shape the SSE/events serializer must re-parse on the consumer (`.optional()`, *not* `.nullable()` — the whole reason `serializeEnvelope` exists). `serializeEnvelope.ts:3`.
- `ModelRoute`, `ModelRouteOverride` — served by `GET /model-routes`, clamped on `POST /runs`.
- `LineageGraphProjection`, `JudgeResult`, `CandidateIdea` — surfaced read-only via projections.
- `WatermarkedProjection<S>` `{runId, sequenceThrough, state}` — the frozen watermark envelope every rebuilt projection (current-state, knowledge) returns; `ResearchKnowledgeGraph` (the `state` for `/knowledge`) is an `apps/api` projection type (`research-notes.ts`), **not** a frozen contract.

**What it expects from inward layers** (injected via `BuildServerDeps`, `server.ts:47`): an `EventStore` (`{append, readByRun}` — the *only* surface it touches), a drizzle `db` handle (for the `listRunIds` reader), the projection builders, a `newId()`, the validated `defaultConfig`, a `requestStop()` signal, and an optional `onRunConfigured()` execution trigger.

## Data & state

This layer is **almost stateless** — its data lives elsewhere:

- **The event log (Postgres `run_events`)** is the source of truth. Every read endpoint folds it via a projection builder; the write path appends to it via `store.append`. The route never holds run state.
- **`RunEventRow`** (`apps/api/src/event-store/append.ts:47`, `= typeof runEvents.$inferSelect`) is the raw drizzle row the events/SSE endpoints emit (through `serializeEnvelope`). drizzle returns DB-`null` for absent optionals; the serializer strips those nulls.
- **Two small in-memory caches, per server instance** (acknowledged MVP, single-process — ARCHITECTURE.md §5):
  1. `activeRunId: string | null` — a *hint* that one run is active, **always re-validated against the log** via `isActive()` before acting. `runs.ts:88`, `:90`.
  2. The idempotency `Map<key, runId>` — first-writer-stable. `idempotency.ts:15`.
  Both are explicitly flagged: a persisted/event-keyed dedup + log-wide scan is a hosted-deployment carry-forward (LESSON §56).
- **Boot config** (`AppConfig`, deep-frozen) lives in the closure of `bootApp`, injected into routes as read-only deps (`defaultConfig`, `modelRoutes`, `problemSets`, `modelRouteOverrideAllowlist`).
- **The cap maxima a `POST /runs` body may lower-but-not-exceed** are `defaultConfig.caps`. In production `main.ts` injects the live boot caps; the standalone/test fallback is `DEFAULT_RUN_CONFIG.caps` (`server.ts:37`). Its two **research-bounded** fields — `maxToolCalls` + `wallClockTimeoutMs` — are now **single-sourced from `DEFAULT_CAPS`** (`server.ts:45-46`, imported from `runtime/config/configSchema.ts:39`) so this standalone ceiling can never drift *below* the boot caps a recorded `run.configured` carries. The other four caps stay deliberately generous (≥ the boot defaults). This is the `overCapField` 422 gate's maxima source (`runs.ts:152`).

The terminal-status set the route guards against is a literal in-route set: `{completed, stopped, failed, cancelled}` (`runs.ts:26`); `cancelled` is forward-compat (no `run.cancelled` event reaches this set yet).

## Dependencies

- **Depends on (inward):**
  - **[01-persistence-event-store.md](01-persistence-event-store.md)** — the `EventStore` `{append, readByRun}` surface is the *only* write/read primitive; the writer owns the per-run `sequence`, the redaction scrub, and append-only enforcement.
  - **[06-projections-read-models.md](06-projections-read-models.md)** — `buildCurrentState`, `buildLineageGraph`, `buildReplaySummary`, `buildRunHealth`, `buildResearchNotes`, `listRunIds` fold the log into the read shapes every GET returns.
  - **[11-shared-knowledge-space.md](11-shared-knowledge-space.md)** — `GET /runs/:id/knowledge` is the read door onto the stigmergy KB: `buildResearchNotes` folds `tool_call.finished` research into a derived `ResearchKnowledgeGraph` (notes + researched/cited/retrieved edges + graveyard). Read-only; authors nothing (rule #2).
  - **[00-contracts-event-model.md](00-contracts-event-model.md)** — `RunConfig`/`RunCaps`/`RunEventEnvelope`/`ModelRoute` are the validated boundary types.
  - **[03-runtime-kernel.md](03-runtime-kernel.md)** — boot wires `createStartRun` (the `onRunConfigured` worker trigger) and the operator-stop registry; the kernel, not the route, owns lifecycle/caps/terminals.
  - **[02-model-gateway-providers.md](02-model-gateway-providers.md)** — boot resolves the gateway (recorded vs. live), the override allowlist, and the per-run override factory.
- **Used by (outward / who calls in):**
  - **[08-frontend-dashboard.md](08-frontend-dashboard.md)** — the React dashboard reaches this API through a Vite dev proxy `/api`→`http://localhost:3000`; it folds REST projections + the SSE stream into the live observatory. It **never** mutates authoritative state (consumes shapes only).
  - Operators / demo scripts (`curl`, the e2e smokes) hit the same endpoints.

## How it works (flow)

**Boot — `bootApp`** (`main.ts:196`), the fixed sequence (LESSON §84/§88):

```text
loadConfig (fail-fast env: OPENROUTER/OPENAI/DATABASE_URL — names the var, never echoes a value)
  → parsePort (fail-fast on a bad PORT, BEFORE any IO)              main.ts:205
  → runMigrations (idempotent)                                     main.ts:208
  → open ONE pg pool → drizzle db → createEventStore               main.ts:214-217
  → [optional] seedDemo (env-gated DOPPL_SEED_FIXTURE; restores a committed fixture)   main.ts:227-231
  → AWAIT crashForward (orphaned non-terminal runs → §3 terminal, BEFORE listen)        main.ts:235
  → buildServer({ onRunConfigured: createStartRun(infra), requestStop: operatorStop.request, ... })  main.ts:265
  → app.listen                                                     main.ts:278
  → console.log "Doppl API listening on …"                         main.ts:287
```

Everything after the pool is wrapped in `try/catch`; any boot abort calls `pool.end()` then rethrows, so a half-initialized boot never serves and no connection leaks (`main.ts:294`, LESSON §88).

**Write path — `POST /runs`** (`runs.ts:97`):
1. Idempotency check first: a known key returns the existing run, `200` (`runs.ts:99`).
2. Reject a non-object body fail-fast `400` (`runs.ts:109`).
3. Split the route-only `demoOverride` off the strict `RunConfig` body (`runs.ts:118`).
4. `validateRunConfig` (defaults < file < env) — invalid → `400`, no append (`runs.ts:123`).
5. Apply the demo cap-override if present (only-lowers within maxima; throws → `422`) (`runs.ts:138`).
6. `overCapField` — any cap above the validated maxima → `422` (the authoritative API defense, never clamped up) (`runs.ts:152`).
7. `modelRouteOverrideViolation` — an override outside the frozen per-role allowlist (or targeting `final_judge`) → `422` (`runs.ts:161`).
8. Concurrency: if `activeRunId` is non-terminal (re-checked against the log) → `409` (`runs.ts:174`).
9. **The sole write**: append one `run.configured` event, actor `operator` (`runs.ts:180`).
10. Set the hint + idempotency binding, fire `onRunConfigured(runId)` (fire-and-forget — the `201` does *not* block on the run) (`runs.ts:188-193`).

**Stop path — `POST /runs/:id/stop`** (`runs.ts:196`): read the log → unknown → `404`; already-terminal → `200 stopped:false` (no signal, no second append); non-terminal → `deps.requestStop(runId)` (latch the in-memory signal) → `202 stopRequested:true`. The route **appends nothing** — the worker polls the latch, drains its generation, and terminalizes `run.stopped` (`running→stopping`, actor `runtime`).

**Read path** (e.g. `GET /runs/:id`, `runs-read.ts:40`): read the log → empty → clean `404` → `buildCurrentState(events)` → `200 {runId, sequenceThrough, state}`. Each read rebuilds a fresh projection (rebuild-on-read MVP; a cache + watermark-staleness is deferred, LESSON §57). `GET /runs/:id/knowledge` (`runs-read.ts:80`) is the same shape with a different fold — `buildResearchNotes(events)` returns the watermark-tagged `ResearchKnowledgeGraph` (the stigmergy KB: research notes + researched/cited/retrieved edges + the graveyard of culled lineages). Identical rebuild-on-read + `404`-on-empty contract; no `dashboard_snapshots` cache. The `retrieved` edges replay-reconstruct from the persisted `candidate.generation_started.retrievedNoteIds` with no provider call (rule #7) — see [11-shared-knowledge-space.md](11-shared-knowledge-space.md).

**SSE stream** (`run-stream.ts:39` + `event-bridge.ts:54`):

```text
GET /runs/:id/stream  ──► parseCursor (Last-Event-ID header | ?lastEventId | -1=from 0)
   │                         present-but-non-integer → 400
   ├─ readByRun(runId) empty → 404 (BEFORE hijack)
   ├─ reply.hijack() ; raw.writeHead(200, text/event-stream)
   ├─ AbortController on request 'close'  ──► aborts the poll loop
   └─ for await (event of streamRunEvents(store, runId, fromSequence, {sleep,maxIdlePolls,signal})):
          raw.write(`id:${event.sequence}\ndata:${JSON.stringify(serializeEnvelope(event))}\n\n`)
```

`streamRunEvents` polls `readByRun`, yields only `sequence > cursor` (preserving order), advances the cursor, and ends on `maxIdlePolls` empty polls or abort (`event-bridge.ts:68-87`). Because the SSE `id` *is* the event `sequence`, a dropped client reconnects with `Last-Event-ID` and resumes gap/dup-free — proven by the resync-equivalence test (a prefix + a resume-from-cursor equals the uninterrupted stream, `run-stream.test.ts:253`).

## Design decisions & rationale

- **REST writes, SSE reads (ADR-010, §11).** Commands and queries over REST; live updates over SSE rather than WebSockets — SSE is one-directional, HTTP-native, and auto-reconnects with `Last-Event-ID`, which maps exactly onto the per-run `sequence` cursor. WebSocket-first control is explicitly deferred (§18).
- **Resume by sequence, not by timestamp.** `sequence` is the sole ordering key, so resume is exact; `occurredAt` is display-only and never used to order. This is why an empty `Last-Event-ID` must mean "from 0" and not `Number('') === 0` resuming after seq 0 — a subtle gate-fix pinned by `test_empty_last_event_id_delivers_from_start` (`run-stream.test.ts:192`).
- **Rebuild-on-read over caching (MVP, §9/LESSON §57).** Always-fresh projections, no staleness bugs, at the cost of re-folding per request. A `dashboard_snapshots` cache + watermark is a deferred hosting hardening.
- **In-memory idempotency + active-run hint (§5/§15).** Acceptable because the MVP is a single in-process worker; the log is the re-validation backstop (`isActive`). Persisted dedup is a hosted carry-forward.
- **`bodyLimit` ingestion gate + sanitizing error handler (§14, LESSON §56).** A 1 MiB `bodyLimit` rejects oversize bodies at `413` *before* the payload-DoS ceiling; the `setErrorHandler` collapses any 5xx to `{error:'internal_error'}` so internal messages (e.g. a `ProjectionError`) never leak at the trust boundary (`server.ts:90`). 4xx pass through their codes.
- **`bootApp` as the single IO + composition site (LESSON §84).** Every kernel seam stays pure and injected; the one place env/db/listen happens is `main.ts`. Tests boot it with injected env/gateway/port and no process side effect (the `isProcessEntry` guard, `main.ts:303`).
- **Omit-null wire serializer instead of loosening the contract (PD.15, §11).** The frozen `RunEventEnvelope` uses `.optional()` not `.nullable()`. Rather than weaken the contract, the read/SSE path strips nulls so the wire form re-parses — fixing the drift at its source (`serializeEnvelope.ts`).

## Safety & invariants

This layer enforces the safety rules **structurally**, by which file does what:

- **Safety rule #2 — the event log is append-only and authoritative; projections are derived.**
  - **REST is the sole write path, SSE is delivery-only.** `POST /runs` appends exactly one `run.configured` via `store.append` and nothing else (`runs.ts:180`); a source-scan test asserts no route calls `.insert/.update/.delete` or imports a DB driver (`runs.test.ts:267`).
  - **The stop route SIGNALS, appends nothing.** `POST /runs/:id/stop` calls `deps.requestStop(runId)` (an in-memory latch) and returns `202` — the worker writes the terminal `run.stopped`. A direct in-route terminal would be buggy against a live worker (the loop polls the signal, not the log) (`runs.ts:209-213`); the test asserts zero `run.stopped` appended by the route (`runs.test.ts:176`).
  - **Mutating endpoints are idempotent + terminal-state-guarded.** A repeated `Idempotency-Key` returns the same run with no second `run.configured` (`runs.ts:101`); stopping an already-terminal run is a `200` no-op with no second terminal (`runs.ts:204`).
  - **SSE is non-authoritative** — `streamRunEvents` reads only (`Pick<EventStore,'readByRun'>`, `event-bridge.ts:55`); re-streaming is byte-identical and appends nothing (`run-stream.test.ts:234`).
- **Safety rule #4 — secrets never leave the server.**
  - The **omit-null serializer runs downstream of the redaction scrub** and is read-path only: it operates on rows *already scrubbed at append*, and it only *drops* keys — it never adds or reveals a value, so it cannot re-expose a secret (`serializeEnvelope.ts:9-13`). The log itself is untouched.
  - The error handler never echoes internal messages on 5xx (`server.ts:94`); boot collects secret values for the scrub but `loadConfig`/boot errors name the env var, never its value (`main.ts:177`, §14).
- **Safety rule #1 — caps are kernel-enforced, never prompt-enforced.** The route's `overCapField` 422 (`runs.ts:152`) and `applyDemoCapOverride` (`runs.ts:138`) are a **defense layer** that rejects an above-maxima override; they explicitly **defer to the kernel as the sole authority** (LESSON §89). The demo cap-override only *lowers* within validated maxima.
- **Safety rule #6 — the held-out judge is immutable to agents.** The model-route-override allowlist covers generation roles only and **excludes `final_judge`** — a per-run override naming the judge model is rejected `422` before the append (`runs.ts:157-170`, LESSON §102).
- **Safety rule #7 — replay calls no providers.** The recorded/replay boot path builds *no* provider client (`resolveGateway`, `main.ts:154`); seeded fixtures restore a terminal run that `crashForward` leaves untouched.

## Gotchas & sharp edges

- **`activeRunId` is a hint, not truth.** It is never the decision-maker — `isActive()` re-folds the log every time (`runs.ts:90`). The hint is *not* cleared on stop, deliberately: the run is still draining/non-terminal until the worker terminalizes, so a concurrent `POST /runs` correctly still gets `409` (`runs.ts:211`).
- **`Number('') === 0` trap (fixed).** An empty/whitespace `Last-Event-ID` means "no cursor → from 0", not "resume after 0". Both the SSE cursor (`run-stream.ts:33`) and the events `?since` parser guard this; without the guard seq-0 (`run.configured`) silently vanishes.
- **A `Date` collapses to `{}` under a naive object walk (LESSON §31).** `serializeEnvelope` special-cases `Date` so `occurredAt` serializes to its ISO string, not `{}` from `Object.entries(date)` (`serializeEnvelope.ts:24`). The serializer is also *deep* (every object depth) so nested per-type payload fields re-parse too.
- **A duplicated `Idempotency-Key` header arrives as `string[]`** — coalesced to the first element rather than silently dropped (which would bypass dedup) (`runs.ts:80`).
- **The `cancelled` terminal status is currently unreachable in-route.** It is in the guard set for forward-compat, but no `run.cancelled` event yet flows to it (`runs.ts:30`). Harmless — a status that never occurs never matches.
- **HTTP/2 `connection` header TODO.** The SSE route writes `connection: keep-alive`, a forbidden connection-specific header under h2 — harmless on the local h1 demo server, flagged for a hosted h2 proxy (`run-stream.ts:62`).
- **DRIFT (none material).** ARCHITECTURE.md §11 lists `POST /runs/:id/stop`→`{runId,status,stopped}`|`{runId,stopRequested}`. The code's terminal-noop branch returns `{runId, status, stopped:false}` (`runs.ts:205`) and the signal branch returns `{runId, stopRequested:true}` (`runs.ts:214`) — both match. The arch endpoint table (§11 line 344) does not list `GET /config/caps`, but §11 line 353 (PD.18) and the code both add it (`cap-maxima.ts:16`, registered `server.ts:122`) — the table is the stale-but-harmless artifact; the prose is current.
- **`GET /runs/:id/knowledge` postdates the §11 enumeration.** It is the NEW read door for the Shared Knowledge Space feature (`runs-read.ts:80`); like `/config/caps`, it is served by the code but **(UNVERIFIED — not re-checked against ARCHITECTURE.md §11 in this pass)** likely not enumerated in the §11 table. The code is current; the §11 table is the lagging artifact. See [11-shared-knowledge-space.md](11-shared-knowledge-space.md).
- **The cap self-422 trap (fixed).** B1 raised `DEFAULT_CAPS` (tool-calls 64→600, wall-clock 10→20 min) but left the standalone `DEFAULT_RUN_CONFIG.caps` copy stale at 200 tool-calls / 10-min wall-clock, so a boot-derived/standalone `POST /runs` body carrying the boot ceiling 422'd *itself* against the lower standalone maxima (`overCapField`, `runs.ts:152`). Fixed by single-sourcing those two fields from `DEFAULT_CAPS` (`server.ts:30-36` comment, `:45-46`); the other four caps stay generous, all ≥ the boot defaults.
- **UNVERIFIED:** The arch §11 health-projection field "operations in flight (from unpaired operation-start markers … judge deliberating)" — the route returns `buildRunHealth(events)` verbatim (`run-health.ts:22`); the exact field computation lives in the projections layer ([06-projections-read-models.md](06-projections-read-models.md)), not asserted here (LESSON §58 documents the judge-pairing await on sv3 `judge.reviewed`).

## Connects to

- **[01-persistence-event-store.md](01-persistence-event-store.md)** — handoff: every read calls `store.readByRun`; the only write calls `store.append` (the `{append, readByRun}` surface). The writer owns `sequence`, the redaction scrub, and append-only triggers.
- **[06-projections-read-models.md](06-projections-read-models.md)** — handoff: `buildCurrentState` / `buildLineageGraph` / `buildReplaySummary` / `buildRunHealth` / `buildResearchNotes` / `listRunIds` produce every GET body.
- **[11-shared-knowledge-space.md](11-shared-knowledge-space.md)** — handoff: `GET /runs/:id/knowledge` rebuilds + returns the stigmergy KB (`buildResearchNotes`); the in-run retriever, the `candidate.generation_started` replay carrier, and the graveyard live there. This layer only exposes the read door.
- **[00-contracts-event-model.md](00-contracts-event-model.md)** — handoff: `validateRunConfig`, `RunCaps`/`RunConfig`, `RunEventEnvelope` (the shape `serializeEnvelope` must re-parse), `ModelRoute(Override)`.
- **[03-runtime-kernel.md](03-runtime-kernel.md)** — handoff: boot wires `onRunConfigured = createStartRun(infra)` (the fire-and-forget worker trigger) and `requestStop = operatorStop.request` (the stop latch the worker polls); `crashForward` runs before listen.
- **[02-model-gateway-providers.md](02-model-gateway-providers.md)** — handoff: `resolveGateway` (recorded vs. live), `MODEL_ROUTE_OVERRIDE_ALLOWLIST`, the per-run override factory.
- **[08-frontend-dashboard.md](08-frontend-dashboard.md)** — handoff: the dashboard consumes these REST shapes + the SSE stream (Vite proxy `/api`→:3000) and resyncs from `lastEventId`; read-only, never mutates authoritative state.
- **[10-cross-cutting-safety.md](10-cross-cutting-safety.md)** — the nine safety rules this layer enforces by mechanism (#1, #2, #4, #6, #7).
- **[OVERVIEW.md](OVERVIEW.md)** — the system spine.
