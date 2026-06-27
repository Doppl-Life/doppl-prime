# Observability

## Executive summary

This layer is the system's **diagnostic side channel** — the way operators and developers *watch* a run without ever changing what the run is. It is deliberately **non-authoritative**: nothing here is the source of truth, and a total outage of every piece in this layer cannot crash a run or corrupt a result.

It has three small parts. First, a **Langfuse emit boundary** (`packages/observability/src/emit.ts`) that ships a deep per-LLM-call trace to Langfuse Cloud — but only *after* running the same secret-redaction scrub the event store runs before its writes, and only in a way that fails safe (a Langfuse outage becomes a local warning, never a crash). Second, a **structured kernel logger** (`kernel-logger.ts`) that stamps every operator log line with the run/generation/agenome correlation IDs so you can grep a single agent's story. Third, a **worker heartbeat** (`apps/api/src/runtime/heartbeat.ts`) — a periodic "I'm alive" beat so `GET /runs/:id/health` can tell a live worker from a stalled one.

The architecture sentence for this layer is **"three layers, one truth"** (`ARCHITECTURE.md:391`): the **event log** is the live + replay-faithful window into the organism; **kernel logs/health** are the operator's diagnostic backstop; **Langfuse** is the deep per-call latency/cost/token trace. Only the first is authoritative. This layer owns the second and third, and the redaction-before-emit that protects both.

## Responsibilities

- **Emit LLM traces to Langfuse safely.** Scrub every payload for secrets *before* it leaves the process, and fail safe if the export fails (`packages/observability/src/emit.ts:55`).
- **Redact secrets at the Langfuse boundary.** Run the exact same scrub the event-store write boundary runs — the "second persistence boundary" (`packages/observability/src/redaction.ts:108`).
- **Stamp structured kernel logs** with the §4 envelope correlation IDs for operator diagnostics (`packages/observability/src/kernel-logger.ts:88`).
- **Expose worker liveness** as an injected-clock heartbeat + a pure staleness predicate (`apps/api/src/runtime/heartbeat.ts:35`, `:53`).

It is explicitly **NOT**:

- **Not authoritative.** Nothing here is consulted for truth or replay. The event log (`run_events`) is the sole source of truth; this layer is rebuildable/disposable (safety rule #2).
- **Not on the replay path.** A trace ID, a log line, a heartbeat — none are read to reconstruct state. Replay reads only the persisted log (safety rule #7).
- **Not a metrics stack.** Console + an injected sink only for MVP — no Datadog/Prometheus/OpenTelemetry (`ARCHITECTURE.md:389`, structurally pinned by an import-ban test).
- **Not a writer to the event log.** Every module here is structurally incapable of importing the event-store writer (import-ban tests in all three test files).

## Key components

| Component | What it does | Where |
|-----------|--------------|-------|
| `createEmitBoundary` | The before-emit boundary: ceiling-check → scrub → emit; fails safe on a failed/too-big export | `packages/observability/src/emit.ts:49` |
| `scrubObservabilityPayload` | The Langfuse-boundary secret scrub — twin of the event-store scrub (frozen `scrubSecrets` + env-value layer) | `packages/observability/src/redaction.ts:108` |
| `createKernelLogger` | Structured logger; `log()` (local, unscrubbed) vs `emitExternal()` (routes through the scrub boundary) | `packages/observability/src/kernel-logger.ts:88` |
| `createHeartbeat` | Injected-clock throttle — emits at most one beat per `intervalMs` (no real `setInterval`/`Date.now`) | `apps/api/src/runtime/heartbeat.ts:35` |
| `isWorkerAlive` | Pure staleness predicate — `null` (never beat) or stale beat → not alive | `apps/api/src/runtime/heartbeat.ts:53` |
| `scrubEventPayload` (the twin) | The *other* boundary — same scrub run before an event-store append (mirror of `scrubObservabilityPayload`) | `apps/api/src/event-store/redaction.ts:103` |

## Interfaces & contracts

**Public API of `@doppl/observability`** (barrel at `packages/observability/src/index.ts:11`):

- `scrubObservabilityPayload(payload: unknown, secretValues: readonly string[]): unknown` — a structure-preserving deep copy with secrets redacted to `REDACTION_PLACEHOLDER`.
- `createEmitBoundary({ secretValues, emit, warn? }): EmitBoundary` — returns `{ emit(payload): Promise<void> }`.
- `createKernelLogger({ correlationIds, sink?, boundary? }): KernelLogger` — returns `{ log(entry), emitExternal(entry) }`.

**What it imports from `packages/contracts`** (the only inward dependency):

- `scrubSecrets` + `REDACTION_PLACEHOLDER` — the frozen key-format + key-name redaction layers (`packages/contracts/src/security/redaction.ts:121`, `:17`). The observability scrub **composes** these, never reimplements them (lesson §5).
- `enforcePayloadCeiling` — the bounded payload-DoS primitive (depth ≤ 32, size ≤ 1 MiB), called *before* the recursive scrub (`packages/contracts/src/events/payload-map.ts:120`).

**Injected I/O (the boundary is dependency-injected, lesson §24):**

- `ObservabilityEmitter = (payload: unknown) => void | Promise<void>` — the real Langfuse client's export call is passed in at boot (`emit.ts:21`). This layer never imports a Langfuse SDK.
- `secretValues: readonly string[]` — loaded `process.env` secret *values*, injected at boot. The scrub reads no `process.env` itself (it is pure — lesson §4); secret values are match-targets, never threaded into the emitted object (`emit.ts:27`).
- `KernelLogSink` / `LocalWarn` — the local sinks, defaulting to `console` (`kernel-logger.ts:67`, `emit.ts:40`).

**Correlation-ID contract** the logger stamps (mirrors the §4 `RunEventEnvelope` correlation fields):

```ts
interface CorrelationIds { runId: string; generationId?: string; agenomeId?: string; correlationId?: string }
```

`runId` is always required; the rest are optional and omitted from the record when absent (`kernel-logger.ts:72`).

## Data & state

This layer is almost **stateless** — it transforms payloads and forwards them. The only mutable state is one variable:

- **`lastEmitAt`** inside the heartbeat closure (`heartbeat.ts:36`) — the timestamp of the last beat, used to throttle. There is no shared store, no table, no in-memory registry.

The data structures it shapes:

- **`KernelLogRecord`** (`kernel-logger.ts:38`) — `{ level, message, runId, generationId?, agenomeId?, correlationId?, fields? }`. Built by `buildRecord` (`:72`), which omits any absent optional ID.
- **`Heartbeat`** (`heartbeat.ts:16`) — `{ at: number }`, the injected-clock value at the moment of the beat.
- The **scrubbed payload** — a structure-preserving deep copy (never a mutation of the input; pinned non-mutating at `redaction.test.ts:88`).

State that matters but lives elsewhere: the **authoritative event log** (`run_events` in Postgres, owned by [01-persistence-event-store.md](01-persistence-event-store.md)). This layer deliberately holds *none* of the truth.

## Dependencies

- **Depends on `packages/contracts`** ([00-contracts-event-model.md](00-contracts-event-model.md)) — for the frozen `scrubSecrets`, `REDACTION_PLACEHOLDER`, and `enforcePayloadCeiling`. This is the *only* package import; observability re-uses the frozen primitives rather than hosting its own.
- **Depends on nothing else.** No event-store, no DB, no model gateway, no provider SDK — enforced by import-ban tests (`emit.test.ts:47`, `kernel-logger.test.ts:17`, `heartbeat.test.ts:15`). That absence is the structural guarantee it can never touch the authoritative log.

**Used by:**

- **The model gateway / runtime (P2.8, deferred wiring)** is the intended caller that passes the real Langfuse client into `createEmitBoundary` (`emit.ts:16` — "P2.8 passes the real client and MUST import this scrub, never reimplement it"). See **UNVERIFIED** in Gotchas — this wiring is not present on the demo fork.
- **The worker loop (P3, deferred wiring)** is the intended caller of `heartbeat.beat()` each iteration, and `GET /runs/:id/health` is the intended reader of the last beat (`heartbeat.ts:3`). The heartbeat *module* is built ahead of the worker.
- **`scrubEventPayload`** (the twin, `apps/api/src/event-store/redaction.ts:103`) is used by the append-only writer — a sibling boundary, not a caller of this package, but the same scrub discipline ([01-persistence-event-store.md](01-persistence-event-store.md)).

## How it works (flow)

**The Langfuse emit path** — the heart of this layer (`emit.ts:55`):

```
caller payload
   │
   ▼
enforcePayloadCeiling(payload)        emit.ts:60   ── depth ≤32 / size ≤1 MiB (frozen ceiling)
   │  not ok ──► warn() + return       emit.ts:61   ── DROP: never recurse, never emit, no log write
   ▼ ok
scrubObservabilityPayload(payload,…)  emit.ts:70   ── frozen scrub + env-value layer
   │
   ▼
await emit(scrubbed)                  emit.ts:72   ── injected Langfuse client
   │  throws ──► warn() (swallowed)    emit.ts:76   ── FAIL SAFE: local warning, no log entry
   ▼ ok
done
```

Two non-obvious ordering facts, both load-bearing (lesson §52):

1. **Ceiling *before* scrub.** The scrub recurses; a maliciously deep payload would stack-overflow the scrub. The ceiling's depth probe is *iterative* and bounded, so it can safely gate a payload the recursive scrub cannot (`emit.ts:56–60`). The emit test `test_ceiling_exceeded_drops_trace_no_emit` builds a 40-deep object and asserts the emitter is never called (`emit.test.ts:74`).
2. **Scrub *before* emit.** `scrubObservabilityPayload` runs before the injected emitter, so an unscrubbed secret can never reach Langfuse (`emit.ts:68–70`).

**The scrub itself** (`redaction.ts:108`) is two layers:

1. `scrubSecrets(payload)` — the frozen key-format + key-name layers (catches `sk-…`, `Bearer …`, values under sensitive key-names).
2. The boundary-local **env-value layer** (`redaction.ts:68`) — redacts any string, array element, **or object key** containing a loaded secret value. Keys must be scrubbed because `RunEventEnvelope.payload` is an open `z.record(z.string(), z.unknown())`, so producer-controlled strings reach key positions (`redaction.ts:54–59`). With no injected secrets, the result is exactly `scrubSecrets(payload)` (`redaction.ts:114`).

**The kernel logger** has two doors (`kernel-logger.ts:88`):

```
log(entry)          ──► buildRecord ──► local sink (console)         NOT scrubbed (§32 process boundary)
emitExternal(entry) ──► buildRecord ──► boundary.emit (scrub+ceiling) SCRUBBED (rule #4)
```

`emitExternal` with no boundary injected is a no-op — no external sink configured, nothing leaves the process (`kernel-logger.ts:95`).

**The heartbeat** is a throttle, not a timer (`heartbeat.ts:38`): each `beat()` reads the injected `now()`; it emits only if `≥ intervalMs` has elapsed since the last emit. `isWorkerAlive(null, …)` is false (a never-started worker is visible) and a beat older than `staleAfterMs` is false (a stalled worker is detectable) (`heartbeat.ts:53`).

## Design decisions & rationale

- **Non-authoritative by construction.** Langfuse, logs, and heartbeats are derived/disposable signals. The locked decision (`ARCHITECTURE.md:391`, ADR-005): if Langfuse is unavailable, the event log retains enough local trace metadata for demo/debug, and a failed export is *a local-only warning, no event-log entry*. The code realizes this exactly at `emit.ts:76`.
- **One scrub, two boundaries.** Rather than a single shared helper, the env-value layer is re-composed boundary-locally in both `event-store/redaction.ts` and `observability/redaction.ts` — because the frozen `scrubSecrets` is pure (it can't read env) and the env-value layer only applies where env loads (`redaction.ts:16–18`, `ARCHITECTURE.md:411`). The two files are intentional near-duplicates; the doc comment says to extract a shared helper *only when a third boundary appears* (YAGNI, `redaction.ts:17`). Lesson §52 pins that the twin must mirror the first's *full* discipline (ceiling-then-scrub, env-value layer, fail-safe).
- **Inject the I/O, run the real discipline (lesson §24).** The emitter and secret values are injected so tests run the genuine scrub + fail-safe path against a fake sink, never a mocked-out discipline (`emit.ts:14`).
- **Heartbeat is a throttle, not `setInterval` (lesson §60).** An injected clock keeps it deterministic and unit-testable, and lets the future worker loop call `beat()` each iteration without a second scheduler (`heartbeat.ts:5–9`).
- **Console + injected sink only — no metrics stack (MVP).** `ARCHITECTURE.md:389` locks "Console + Postgres only — no external metrics stack for MVP," pinned by the metrics-import-ban test (`kernel-logger.test.ts:18`).
- **Content toggle (Q3, deferred).** `ARCHITECTURE.md:387` specifies an operator switch to disable external content logging to Langfuse when a live-audience prompt is sensitive. See **UNVERIFIED** below — not found in this layer's code.

## Safety & invariants

This layer is where two of the nine load-bearing safety rules are mechanically enforced:

- **Safety rule #4 — secrets never leave the server.** The scrub runs at the persistence boundary *and* the Langfuse boundary. In observability the mechanism is: `createEmitBoundary` calls `scrubObservabilityPayload` *before* the injected emitter (`emit.ts:70`), and that scrub composes the frozen `scrubSecrets` plus an env-value layer that redacts secret values in string values, array elements, and **object keys** with de-collision (`redaction.ts:68–96`). A failed Langfuse export is a **local-only warning** (`emit.ts:76`) — it is never written to the authoritative log, *because Langfuse is non-authoritative* (rule #2 reasoning) and *because the module structurally cannot import the event store* (import-ban test `emit.test.ts:47`). Test `test_scrub_runs_before_emit` plants a secret as value, key, and array element and asserts none reaches the emitter (`emit.test.ts:19`). This boundary **mirrors** the event-store twin at `apps/api/src/event-store/redaction.ts:103` (lesson §52).
- **Safety rule #2 — the event log is append-only and authoritative; everything else is derived.** Mechanism: every module here imports nothing from the event-store writer / `run_events`, pinned by an import-ban regex over the source in all three test files (`emit.test.ts:47`, `kernel-logger.test.ts:76`, `heartbeat.test.ts:48`). A log line, a heartbeat, and a Langfuse trace are *side signals* — the closed `RunEventType` registry has no log/heartbeat member, so they cannot be represented as authoritative events even by accident (`kernel-logger.ts:16`, `heartbeat.ts:11`). Trace IDs are likewise never consulted for replay truth: this layer is on no read/replay path.
- **Safety rule #7 (adjacent) — replay calls no providers.** Observability never participates in replay. The heartbeat uses an injected clock (not `Date.now`), so even *it* is deterministic and timer-free (`heartbeat.ts:7`).
- **Catastrophic-over-redaction guard.** The env-value layer only substring-matches secrets ≥ 8 chars and never a substring of the placeholder (`redaction.ts:36`) — so a blank or 1–2-char env var (`''.includes` matches everywhere) can never blanket-redact a whole payload. Pinned by `test_short_or_blank_secret_no_blanket_redact` (`redaction.test.ts:81`).

## Gotchas & sharp edges

- **The two redaction files are intentional duplicates.** `packages/observability/src/redaction.ts` and `apps/api/src/event-store/redaction.ts` are near-byte-identical by design (two boundaries, one discipline). If you change one, change both — there is no shared helper *yet* (the comment at `redaction.ts:17` says extract one only at a third boundary). Lesson §52 is the warning that a missing ceiling or a values-only scope in either is a real rule-#4 leak.

- **The local log path is deliberately *not* scrubbed.** `kernelLogger.log()` writes to console unscrubbed (`kernel-logger.ts:91`); only `emitExternal()` scrubs. The justification (`kernel-logger.ts:10`) is that console is inside the process trust boundary (lesson §32 precedent — `request.log.error` is also outside the rule-#4 boundary), and secrets never reach the logger's input anyway because credentials load only from env. Test `test_external_emit_routes_through_scrub` proves the asymmetry: the external payload is scrubbed, the local record still contains the secret (`kernel-logger.test.ts:69–71`). **Sharp edge:** if a future caller logs a credential into `fields`, the local console line *will* contain it. The defense is the env-only credential guarantee, not the logger.

- **`emitExternal` with no boundary is a silent no-op.** If you forget to inject a `boundary`, external emits vanish without error (`kernel-logger.ts:95`). That is intentional (no external sink configured = nothing leaves), but it means "I called emitExternal and nothing showed up in Langfuse" can be a wiring omission, not a bug.

- **DRIFT (harmless): "36-member RunEventType."** The source comments in `kernel-logger.ts:17` and `heartbeat.ts:12` say "the closed 36-member RunEventType has no log/heartbeat member." The registry is now **41 members** (`apps/api/CLAUDE.md` cross-doc table; `ARCHITECTURE.md:173` references the closed registry; `CURRENT_SCHEMA_VERSION = 9`). The *claim* (no log/heartbeat member exists) remains true at 41 members — the count is stale, the invariant is intact. `ARCHITECTURE.md:411` likewise says "30/36 non-high-traffic event types"; same stale count, same intact reasoning.

- **UNVERIFIED — the Content toggle (Q3).** `ARCHITECTURE.md:387` specifies an operator switch that disables external content logging to Langfuse for sensitive live-audience prompts. I did not find it implemented in this layer (`emit.ts` has no content-toggle gate; the boundary either emits the scrubbed payload or fails safe). It is plausibly deferred to the P2.8 Langfuse-client wiring. Treat the toggle as **specified but not shipped here**.

- **UNVERIFIED — the real Langfuse wiring (P2.8) is absent on the demo fork.** Every comment naming P2.8 (e.g. `emit.ts:16`) describes the *intended* caller that injects the real Langfuse client. I confirmed the `@doppl/observability` package exports the boundary and scrub, but I did not find a production call site that constructs `createEmitBoundary` with a live Langfuse client. The package is built and unit-tested ahead of its wiring (consistent with the heartbeat/kernel-logger "built ahead of the worker" note at `heartbeat.ts:13`). So this layer is **shipped and correct in isolation, but its external emit path is not yet live**.

- **A dangling operation-start marker is not this layer's concern.** The "what is every agent doing right now" live window is the §4 *event* stream (operation-start markers + completions over SSE), owned by the runtime + projections, *not* by these logs (`ARCHITECTURE.md:175`, `:391`). It is a common confusion: the real-time UI window is events, not logs/Langfuse.

## Connects to

- [00-contracts-event-model.md](00-contracts-event-model.md) — the frozen `scrubSecrets`, `REDACTION_PLACEHOLDER`, and `enforcePayloadCeiling` this layer composes; the `RunEventEnvelope` correlation fields the kernel logger mirrors.
- [01-persistence-event-store.md](01-persistence-event-store.md) — the **twin boundary**: `scrubEventPayload` runs the same scrub before an append. Same discipline, the *other* of the two persistence boundaries (rule #4).
- [02-model-gateway-providers.md](02-model-gateway-providers.md) — the intended P2.8 caller that injects the real Langfuse client into `createEmitBoundary` (LLM-call traces originate here).
- [03-runtime-kernel.md](03-runtime-kernel.md) — owns the worker loop that will call `heartbeat.beat()` each iteration and the §4 operation-start markers that are the *authoritative* live window.
- [07-backend-api-rest-sse.md](07-backend-api-rest-sse.md) — `GET /runs/:id/health` reads the last heartbeat; SSE streams the authoritative event window (the real "what's happening now," distinct from these diagnostics).
- [10-cross-cutting-safety.md](10-cross-cutting-safety.md) — the home of safety rules #4 (redaction) and #2 (append-only authority) this layer enforces by mechanism.
- [OVERVIEW.md](OVERVIEW.md) — the system spine and the "three layers, one truth" model this layer realizes.
