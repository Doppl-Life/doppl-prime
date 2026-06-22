# P3 (Runtime kernel) — phase-boundary security review

**Dispatch:** `/phase-exit` phase-boundary, policy `security-reviewer: invariant`.
**Verdict: CLEAR.** No critical or high finding. The phase ships.

## Scope + surface caveat

Cross-cutting whole-system security pass for **Phase 3 (runtime kernel)** slices
**P3.11 (terminal classifier)**, **P3.12 (worker: idempotency + activeRunGuard + heartbeat)**,
**P3.13 (crash-forward)** on branch `track/kernel`.

Per the phase-boundary policy, the review surface is the phase's accumulated branch
diff + crossed trust boundaries. **This over-approximates to the accumulated kernel-track
runtime diff** — the diff is scoped here to the 8 runtime files touched by the three
slices (`git diff 1e865c6..307ada8 -- apps/api/src/runtime/`, +713 lines, 0 deletions),
which is the honest review surface for P3.11–13. Earlier P3 substrate (caps/energy/RNG/loop,
P3.1–P3.10) was per-slice reviewed in prior rounds and is not re-litigated here except where
P3.11–13 reach into it (the append path, the state-machine guards, the kill summary).

Files reviewed (all additive):

- `apps/api/src/runtime/terminal/terminalClassifier.ts` (180) — P3.11 pure verdict + path guard
- `apps/api/src/runtime/terminal/partialSummary.ts` (101) — P3.11 scored-survivor projection
- `apps/api/src/runtime/worker/runWorker.ts` (147) — P3.12 production caller (the live trust boundary)
- `apps/api/src/runtime/worker/activeRunGuard.ts` (53) — P3.12 single-active-run decision
- `apps/api/src/runtime/worker/idempotency.ts` (46) — P3.12 sequence-watermark idempotency
- `apps/api/src/runtime/recovery/crashForward.ts` (99) — P3.13 boot recovery
- `apps/api/src/runtime/loop/generationLoop.ts` (+26) — terminal executor + `onIteration` hook
- `apps/api/src/runtime/index.ts` (+61) — re-exports only (no logic)

Confirmed against the trust-boundary collaborators (read, not in-diff):
`event-store/append.ts` (the single guarded append path), `runtime/state/runStateMachine.ts`
(`RUN_TERMINALS` / `canTransitionRun`), `runtime/caps/killSwitch.ts` (`KillPlanSummary`).

---

## Invariant pass (invariant-touching: yes)

Per-axis cross-check against root `CLAUDE.md` "Key safety rules". The P3 boundary touches
rules #1, #2, #7, #8 directly + the §5 single-active-run kernel enforcement.

### Rule #1 — caps kernel-enforced, never prompt; spawnBudget clamped — **PASS**
P3.11–13 introduce no new cap/budget/limit surface. The terminal classifier reads the
*already-persisted* log; it does not enforce population/generation/energy/depth/tool/wall-clock
caps (those are the P3.4 `capEnforcer` + P3.10 loop, prior-reviewed). The worker carries no
`spawnBudget` and no trait/prompt-derived ceiling — `runWorker` reads `config.caps`
(authoritative `RunConfig.caps`) and threads them into the loop unchanged. No prompt text
asserts a cap anywhere in the diff. `grep` for cap/budget terms in the 6 new modules returns
only the loop's pre-existing `enforceWallClock` import (unchanged behavior).
*spec: ARCHITECTURE.md §5 caps; LESSONS §48.*

### Rule #2 — append-only authoritative log; no double-emit; no historical mutation — **PASS**
Both new write sites append through the single guarded `eventStore.append` path
(`generationLoop.ts:484` terminal executor; `crashForward.ts:82`). Neither performs an
UPDATE/DELETE, raw `run_events` insert, drizzle call, or projection write — `grep -niE
'(insert|update|delete).*run_events|drizzle|\.insert\(|\.update\(|\.delete\('` over the three
new directories returns only one **comment** match (`runWorker.ts:51` documenting the injected
`listRunIds`). The `EventStore` port the worker holds exposes `append` + `readByRun` only — no
mutation surface reachable (LESSONS §55).

**Double-emit defense (the load-bearing rule-#2 concern at this boundary) verified two ways:**
1. `classifyRunTerminal` step 1 returns `{terminalEvent: null}` when the log already carries a
   real run-terminal event (`existingRunTerminal`) — so the operator-stop / non-energy-cap /
   wall-clock kill path (whose terminal is pre-emitted by `executeKillAndDrain`) re-classifies
   to a NO-OP at loop exit (`terminalClassifier.ts:126-129`).
2. The loop executor gates on BOTH `verdict.terminalEvent !== null` AND
   `runTerminalPath('running', status) !== null` before appending (`generationLoop.ts:493`);
   `runTerminalPath` returns `null` from any terminal `from` (P3.2 `from_terminal`), so a
   re-entry can never force a second terminal.
3. crash-forward skips already-terminal runs (`isRunTerminal` → `continue`,
   `crashForward.ts:60`) → idempotent re-run appends nothing.

No historical row is read-modified-written; the terminal/crash payloads are *new* appends with
DB-allocated monotonic sequence. *spec: ARCHITECTURE.md §4 sequence / §3 terminal; LESSONS §67/§72/§73.*

### Rule #4 (boundary observed) — secret redaction at persistence — **PASS**
Not a primary P3 axis, but the two new append sites carry candidate-derived payloads
(`partialSummary` with `finalIdeaRef`/candidate ids, `from`/`to`/`reason`). Verified these route
through `append.ts:78-85`: `validateEventPayload` (per-type narrow + payload-DoS ceiling,
returns the PARSED value, LESSON §18) THEN `scrubEventPayload` (the frozen `scrubSecrets` +
boundary env-value layer) BEFORE the only `tx.insert`. No new payload path bypasses the scrub.
*spec: ARCHITECTURE.md §14; LESSONS §21/§26/§46.*

### Rule #7 — replay determinism; no provider/RNG/clock on the authoritative-read path — **PASS**
`terminalClassifier`, `partialSummary`, `activeRunGuard`, `idempotency`, and `crashForward` are
pure log-derived decisions. Import-list + call-shape scan
(`grep -nE 'Math\.random|Date\.now|new Date\(|fetch\(|setTimeout|setInterval|process\.env|
import .*(openai|anthropic|openrouter)|ModelGateway|embedding|retrieval|providerCall'`) over the
three new directories returns **only one prose-comment match** (`crashForward.ts:20` describing
what it does NOT do). No PRNG, no clock, no provider, no IO except the injected `EventStore`
read + `listRunIds`. Determinism is structural, not flag-guarded (extends LESSONS §30/§55):
- `bestScoredSurvivor` tie-breaks on LOWEST `sequence` (never `occurredAt`/insertion order),
  so the same log always yields the same `finalIdeaRef` (`partialSummary.ts:65-77`, LESSONS §68).
- `scoredSurvivors` reads `total` from the persisted `FitnessScore` payload, never recomputes;
  a non-numeric total degrades to `-Infinity` (can't win), no throw (`partialSummary.ts:54-56`).
- crash-forward "NEVER resumes" — appends only the run-terminal, no generation re-execution,
  no re-sample (`crashForward.ts:54-99`).
The worker's `now` defaults to `() => 0` and is the injected replay-safe clock shared with the
heartbeat + loop; the heartbeat is a §60 SIDE SIGNAL (no `run_event`, rule #2).
*spec: ARCHITECTURE.md §4 replay; LESSONS §30/§55/§67/§72.*

### Rule #8 — energy success-only; worker never double-debits — **PASS**
P3.11–13 emit NO `energy.spent` event and perform no energy debit — energy emission stays in the
P3.10 loop (prior-reviewed, success-only by frozen `EnergyEventType` shape, LESSONS §49). The
worker's contribution is the *idempotency guarantee that prevents a double-debit*: a
running/terminal run already carries `run.started`, so `runWorker` returns
`{started:false, reason:'already_started'}` (`runWorker.ts:103-105`) — no loop re-entry ⇒ no
second pass over the generations ⇒ no double `energy.spent`. Idempotency keys off the PERSISTED
log via `stepAlreadyRecorded` / `sequenceWatermark`, never the loop's in-memory `eventSeq`
(`idempotency.ts:8-12`), so a crash mid-run + restart cannot replay a debit. *spec: ARCHITECTURE.md
§5 idempotency / §4 sequence; LESSONS §70.*

### Single-active-run kernel enforcement (§5) — **PASS**
`activeRunGuard` decides over the AUTHORITATIVE log: a candidate run is rejected if any OTHER run
is non-terminal, where "terminal" derives DIRECTLY from `RUN_TERMINALS` (the P3.2 state machine)
via `RUN_TERMINAL_EVENTS = {run.${s}}` — NOT a fold mirroring `projections/.../lifecycle.ts`
(`activeRunGuard.ts:13-21`). `energy_exhausted` is correctly excluded from the terminal set
(mid-flight ⇒ still active), consistent with the P3.11 classifier and `RUN_TERMINALS`
(`{completed, stopped, failed, cancelled}`, verified in `runStateMachine.ts:20-25`). The candidate
excludes itself from the scan (a run never blocks itself; run-level idempotency handles self).
The REST `activeRunId` hint is documented as a mirror — the kernel guard decides
(`runWorker.ts:85-96`). *spec: ARCHITECTURE.md §5 workers/concurrency; LESSONS §70.*

---

## General security pass

- **Input validation / boundary** — the only new external-data boundary is `runWorker`'s
  injected `listRunIds` + the `EventStore` reads; all run-derived values flow back through the
  validating+scrubbing `append` path before persistence. No new HTTP/file/network ingress in this
  diff (REST POST→worker + stop→operatorStop are explicitly DEFERRED to Phase D; `routes/`
  untouched). Clean.
- **Authorization** — no new privileged path; the worker is an in-process caller, not an endpoint.
  Clean.
- **Injection** — terminal/crash payloads are object literals (`from`/`to`/`reason`/
  `partialSummary`); no string concatenation into SQL/command/path. Event ids are deterministic
  template strings over `runId` (`${runId}-crash-forward`, `${runId}-run-started`) — `runId` is a
  persisted/validated identifier, and uniqueness is DB-enforced by `unique(run_id, sequence)` +
  the deterministic id. No injection surface. Clean.
- **Unbounded loop / DoS** — the worker scans `listRunIds` once (bounded by run count) and
  `crashForward` iterates run ids once; both do a single `readByRun` per run. `partialSummary`
  iterates the log a constant number of passes. Payload-DoS is bounded by
  `enforcePayloadCeiling` on the append path. No user-controlled unbounded loop. Clean.
- **Information disclosure** — the append path's error messages are path+code only (no payload
  echo, LESSON §26); the new modules add no error strings that leak secrets/PII. The heartbeat
  emits to an injected sink, NOT to the event log or Langfoge. Clean.
- **Reentrancy / race** — see the dispositioned TOCTOU below; otherwise the pure decisions hold
  no mutable state.

---

## Dispositioned (NOT new findings — carried in from per-slice review, re-confirmed in-scope)

1. **[medium] read-then-append TOCTOU on the single-active-run guard** —
   `runWorker.ts:87-118`: `activeRunGuard` reads the log, then `run.started` is appended in a
   later step; two concurrent workers could both pass the guard before either appends. **Bounded
   and accepted for the serial single-in-process MVP** (ARCHITECTURE.md §5 "MVP serializes to one
   active run at a time"): the deterministic event id (`${runId}-run-started`) + the
   `unique(run_id, sequence)` constraint make a true race fail LOUD at the DB, not silently
   double-start. **Carry-forward:** the Phase-D REST trigger must single-flight-serialize worker
   dispatch (matches the LESSONS §56 in-memory one-active-run hint re-validated against the log).
   Re-confirmed correctly scoped — no escalation.

2. **[low] `from === null` degenerate-run skip in crash-forward** —
   `crashForward.ts:62-63`: a run carrying neither `run.started` nor `run.configured` is skipped
   (nothing to recover). **Fail-safe** — a malformed/unknown run is left untouched rather than
   forced to an illegal terminal; the `runTerminalPath` backstop at line 80 is a second
   defensive guard. No action.

---

## Verdict

**security-reviewer: 8 files reviewed (P3.11/12/13 accumulated runtime diff).**
**Invariant pass: PASS on all axes — #1 / #2 / #7 / #8 / single-active-run (§5); #4 boundary observed PASS.**
**General pass: 0 findings (0 critical / 0 high / 0 medium / 0 low new).**
**2 prior dispositioned items re-confirmed correctly scoped (1 medium carry-forward, 1 low no-action).**

**CLEAR.** No Step-9 Finding. Nothing escalates to the lead.
