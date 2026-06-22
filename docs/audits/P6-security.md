# P6 — Whole-System Security Review (phase-boundary)

- **Track:** `demo` · **Branch:** `track/demo` · **Date:** 2026-06-21
- **Dispatch policy:** `phase-boundary` (security row, from `/phase-exit`) — this IS the Phase-6 whole-system security pass.
- **Review surface (over-approximated to the accumulated `apps/api` Phase-6 branch diff, P6.1–P6.11):**
  `apps/api/src/{projections,routes,sse,runtime,event-store}` + `packages/observability/src` + their tests.
  Per the phase-boundary convention, later-phase surface over-approximates to the accumulated track diff (acceptable; noted).
- **Verdict: CLEAR.** 0 critical / 0 high / 0 med / 0 low new findings. The two new trust boundaries this phase
  introduces (the observability before-emit boundary + the kernel-logger external path) and the SSE/REST delivery
  surfaces hold the Key safety rules. No new bypass surface, no unvalidated input path, no secret-leak path.

---

## Key-safety-rule invariant pass

| # | Rule | Verdict | Evidence |
|--:|---|---|---|
| 1 | Caps kernel-enforced, never prompt-enforced | **PASS** | `routes/runs.ts` cap-override rejection (`overCapField`, 422 above maxima) is an API *defense* layer; comment + LESSONS §32 keep the kernel (P3) the authoritative enforcer. `DEFAULT_RUN_CONFIG.caps` are integer ceilings, not prompt text. No cap asserted in any prompt string on the P6 surface. |
| 2 | Event log append-only + authoritative; projections derived | **PASS** | The ONLY write path on the surface is `event-store/append.ts` (single txn, advisory-lock sequence). Every route/projection/SSE/export module is read-only: grep for `.insert/.update/.delete` and `(insert\|update\|delete).*run_events` across `projections/routes/sse` → NONE. SSE (`run-stream.ts` + `sse/event-bridge.ts`) and replay (`replay-reader.ts`) are `Pick<EventStore,'readByRun'>`-narrowed → writes structurally unreachable. `lineage-export.ts` imports nothing from the writer/drizzle. |
| 3 | No arbitrary code execution | **PASS** | grep `eval(`/`new Function`/`child_process`/`vm`/`exec(`/dynamic `require(` across `projections/routes/sse/runtime` + observability → NONE. No candidate-derived input reaches an execution surface. (Check-runner registry is out of P6 scope — verifier track.) |
| 4 | Secrets never leave the server (redaction at the persistence boundary + before-emit) | **PASS** | TWO boundaries verified. (a) **Persistence:** `event-store/redaction.ts` `scrubEventPayload` runs in the append txn BEFORE the only `insert` (`append.ts:79`), on the *parsed* payload (§18) — so every read-side projection/SSE/REST response serves already-scrubbed bytes (no second secret source bypasses it). (b) **Before-emit:** `observability/emit.ts` `createEmitBoundary` does ceiling-THEN-scrub-THEN-emit, fails safe (dropped + local warn, no authoritative-log write) — the §28 twin of the event-store discipline, composing frozen `scrubSecrets` + the boundary-local env-value layer (values + array elements + KEYS with de-collision, ≥8-length guard, placeholder-substring guard, proto-safe `Object.defineProperty` rebuild). Both modules read no `process.env` (secret values injected at boot, LESSONS 4 — the only `process.env` hits are doc comments). `model-routes.ts` serves `ModelRoute` config which has NO credential field (env-only, §14). |
| 4 | Kernel-logger two-path split (P6.10) | **PASS** | `observability/kernel-logger.ts`: `log()`/console = LOCAL, unscrubbed — correct (inside the process trust boundary, LESSONS §32 precedent; secrets never reach the input by the env-only structural guarantee). `emitExternal()` = the ONLY external path, routes through the injected `createEmitBoundary` (scrub-before-emit); no boundary injected → no-op (nothing leaves the process). No path leaks a secret to an external sink. |
| 5 | Model output untrusted; candidate text is data, not instructions | **N/A (PASS, not touched)** | No P6 module interpolates candidate/model text into an instruction string (verifier/gateway track owns the sentinel-wrap; SSE/REST only relay already-persisted, already-scrubbed payloads as DATA). No prompt-injection surface introduced. |
| 6 | Held-out judge / rubric / scoring policy immutable to agents | **N/A (PASS, not touched)** | No P6 surface exposes a write path to the judge/rubric/scoring policy. `run-health.readCaps` reads the persisted `RunCaps` read-only. |
| 7 | Replay calls no providers | **PASS** | `projections/replay-reader.ts` is `Pick<EventStore,'readByRun'>`-narrowed; `replay-summary.ts` draws no randomness / makes no web call (asserted in-module + grep `Math.random`/`fetch`/`http` over `projections/` → only negative-assertion comments). Reconstruction folds the persisted log via the §27/§29 builders, reading RNG/embedding/retrieval outcomes verbatim. |
| 8 | Energy = successful productive spend only | **N/A (PASS, read-only)** | `run-health.ts` READS persisted `energy.spent.actual` to report consumed-vs-ceiling (clamped `min(consumed, ceiling)`); it debits nothing. Energy debit lives on the kernel/gateway write path (not P6). The op-pair table counts `*_started` vs completion markers — none narrow to `EnergyEvent`. |
| 9 | Postgres only; provider SDKs only behind the gateway | **PASS** | grep `from 'openai'/@anthropic/openrouter` over the surface → NONE. grep `sqlite`/`better-sqlite`/`:memory:` → NONE. All DB access is Drizzle/Postgres via injected `db`/`store`. |

---

## General security pass

- **Input validation (PASS).** All opaque ids (`runId`/`candidateId`) are path params passed to the parameterized
  `readByRun` (`eq(runEvents.runId, …)`) or used as object-key lookups — never concatenated into SQL/paths/SSE frames.
  `listRunIds` uses `selectDistinct` (parameterized, no concat). Numeric cursors are guarded: SSE `parseCursor`
  (`run-stream.ts:25`) and `GET /events?since=` (`runs-read.ts:47`) reject a present-but-unparseable / negative /
  non-integer cursor with 400 before any read. POST /runs rejects a non-object body (400) and runs
  `validateRunConfig` fail-fast (400) before any append.
- **Injection paths (PASS).** No SQL string-building (no `sql\`\``, no `${id}` template into a query — grep clean).
  **SSE frame-injection (PASS):** the only place producer bytes hit a raw stream is
  `raw.write(\`id:${event.sequence}\ndata:${JSON.stringify(event)}\n\n\`)` — `event.sequence` is a DB-assigned
  integer (not user-controlled) and `JSON.stringify` escapes all `\n`/`\r` inside payload strings, so no payload can
  forge a frame boundary or a fake `id:`/`event:` line (LESSONS §35 single-line framing, pinned in the integration test).
- **Authorization (N/A — accepted MVP posture).** No auth layer on the operator REST surface (§5/§15 single-operator
  local-demo); not a P6-introduced regression. Hosted multi-tenant authz is a recorded carry-forward, consistent with
  the user-ratified hosted-deferral posture.
- **Information disclosure (PASS).** `server.ts` `setErrorHandler` sanitizes every 5xx to `{error:'internal_error'}`
  (internal detail only to `request.log.error` — server stdout, inside the rule-#4 boundary, LESSONS §32); 4xx pass
  through. The one 4xx that echoes `error.message` (`runs.ts:98`) is `validateRunConfig`'s field-identifying error
  (names the offending *config field*, not infra/secret/PII — LESSONS 4) — intended and safe. Route 4xx are sent via
  `reply.status()` (not throws), so no payload-derived message reaches a thrown FastifyError.
- **Unbounded loops / DoS (PASS).** SSE poll loop (`streamRunEvents`) is bounded by `maxIdlePolls` + the
  client-disconnect `AbortController` (checked before each yield, between yields, and around `sleep`); prod default is
  an injectable interval, tests run timer-free. `bodyLimit` (1 MiB ingestion gate, 413) fronts the per-type payload
  ceiling; the before-emit boundary applies the depth-before-size ceiling BEFORE the recursive scrub (no stack-blow on
  a pathological trace). The heartbeat is an injected-clock throttle (no real `setInterval`).
- **Resource exhaustion / reentrancy (PASS).** Append is one txn with advisory-lock-serialized sequence (closes the
  TOCTOU). Idempotency + one-active-run hints are re-validated against the authoritative log before the append (the
  in-memory map is a §5 single-process MVP hint, not the authority). No external call before a state update.

---

## Known-accepted (NOT re-raised, per dispatch)

- **Live-worker wiring + sv3 judge pairing deferred to P3/integration.** The kernel-logger, heartbeat, and SSE
  bridge are built-ahead (the worker is absent on the demo fork); `run-health` excludes `judge.review_started`
  (its `judge.reviewed` completion is sv3). Confirmed these are accuracy/wiring deferrals, NOT security gaps — no
  live secret source exists yet, and the count exclusion cannot leak or over-grant.
- **Append-only DB-privilege [high] — user-ratified defer-to-hosted.** Local demo is trigger-only
  (row-level + statement-level TRUNCATE triggers); the non-owner least-privilege runtime role is a hosted concern.
  Carried as accepted, not re-raised.

## Disposition

No new finding to escalate. **Security row: PASS.** The phase may exit on the security axis.
