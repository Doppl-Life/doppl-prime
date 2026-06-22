# /tdd brief — live_check_rerun

## Feature
The **live allowlisted-check re-run affordance** (`liveRerun`): re-runs an allowlisted check live for a
prepared problem through the **same** P4.5 registry path (no new execution surface), and if the live
attempt stalls/fails, serves a **replay-backed fallback** — the recorded `check.completed` result read
from the authoritative event store (never auto-fabricated, never a provider re-sample). The mechanism is
the verifier-track deliverable; the operator-trigger + demo UI + the "winning idea" selection are
P3/P5/demo-deferred. Feature slice (reuses the rule-#3 allowlist + the append-only store; no new invariant).

## Use case + traceability
- **Task ID:** P4.11
- **Architecture sections it implements:** `ARCHITECTURE.md §7` (the "execute the transfer live" demo moment —
  re-run the winning idea's allowlisted check live for prepared problems, with replay-backed fallback, `REQ-E-003`),
  `§9` (the recorded result is read from the authoritative `run_events` log — replay never re-calls the web),
  `§17` (the demo fallback ladder).
- **Related context:**
  - **Scope correction:** `Depends on: P0.7, P4.5, P4.9` — all landed. The mechanism depends on the verifier
    harness + the event store, NOT the demo track. The "winning idea" is the candidate input (injected); the
    operator-trigger + demo UI are the demo track's. So this is buildable now (was mis-scoped "demo-gated").
  - **P4.5 `runCheck` (`89ab697`):** the live re-run goes through the SAME `runCheck` → registry path (no new
    execution surface). The allowlist gate already restricts to registered/prepared adapters (an unregistered id → skipped).
  - **Event store (P1.3):** `createEventStore(...) → {append, readByRun}`. The replay-fallback reads the recorded
    `check.completed` via `readByRun(runId)` (ordered `RunEventRow[]`; filter `type==='check.completed'` + matching
    `candidateId`/checkType; the payload IS the recorded `CheckResult`). No re-sampling — reads the persisted row.
  - **Frozen `CheckResult` (P0.7).**
  - Key safety rule #7 (replay reads the persisted outcome, never re-calls a provider) — the fallback embodies it.

## Acceptance criteria (what "done" means)
- [ ] `liveRerun(...)` attempts the live re-run through `runCheck` (the same registry path — no new execution surface) and, on a USABLE live result (status passed/failed), returns that fresh `CheckResult` (+ its `check.started`/`check.completed` events, exactly the normal path — no special-case shape).
- [ ] If the live attempt **stalls/fails** (Q1: throws, or returns `skipped`), `liveRerun` serves the **replay-backed fallback** — the most-recent recorded `check.completed` `CheckResult` for that candidate+checkType, read from the event store via `readByRun` — and does NOT fabricate a result.
- [ ] The fallback performs **no provider/web re-sampling and no new append** — it reads + serves the persisted `CheckResult` (rule #7); the live path's events are the only ones emitted.
- [ ] The live re-run is **gated to prepared/allowlisted problems only** — an unregistered/unprepared adapter id cannot be live-run (inherited from the `runCheck` registry gate: it resolves to `skipped`, which is NOT a usable live result → fallback or surfaced).
- [ ] If the live attempt fails AND there is **no recorded result** to fall back to, `liveRerun` returns a clear non-fabricated signal (Q2: a `skipped`/error result or a typed "no fallback available" — never an invented pass).
- [ ] The re-run emits the same schema-valid `CheckResult` + `check.completed` as the normal path (the live path reuses `runCheck` verbatim).
- [ ] All unit tests in `apps/api/test/unit/check-runners/live-rerun.test.ts` pass; the integration test in `apps/api/test/integration/check-runners/live-rerun.test.ts` passes against real Postgres; `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none (full runtime invocation) — first caller is the demo operator affordance (demo track) + the P3/P5 path
that identifies the "winning idea."** `liveRerun` takes the `EventStore` + registry + the check `request` +
`runContext` + (Q1) an optional injectable `liveAttempt` (default `runCheck`) — all injected. Exercised
end-to-end via the integration test (real store: seed a recorded `check.completed`, then a failing live attempt
→ assert the recorded result is served; a succeeding live attempt → assert the fresh result + events). Confirm
at Step 7.5: the live path goes through `runCheck` (no bypass); the fallback only reads (`readByRun`) + never appends.

## Files expected to touch
**New:**
- `apps/api/src/check-runners/live-rerun.ts` — `liveRerun(...)`: try live (`runCheck`) → on stall/fail, `readByRun` → most-recent matching `check.completed` → serve its `CheckResult`.
- `apps/api/test/unit/check-runners/live-rerun.test.ts` — unit (fake EventStore: live-usable returns fresh; live-fail serves recorded; no-recorded → non-fabricated; gated-to-allowlisted).
- `apps/api/test/integration/check-runners/live-rerun.test.ts` — integration (real PG: seed a recorded check.completed; failing live → serves it; succeeding live → fresh result + events; no extra append on the fallback path).

**Modified:** none (reuses `runCheck`/registry/event-store unchanged).

> **Tracker path drift (FYI):** P4.11 cites `apps/api/check-runners/live-rerun.ts`; correct path is `apps/api/src/check-runners/live-rerun.ts`.

## RED test outline
**Unit (`test/unit/check-runners/live-rerun.test.ts`)** — fake EventStore + injectable liveAttempt:
1. **`live_usable_result_returned`** — Asserts: a live attempt returning passed/failed → that fresh `CheckResult` is returned (positive guard first, lesson 10); the recorded fallback is NOT consulted. Why: §7 (live path).
2. **`live_fail_serves_recorded_fallback`** — Asserts: a live attempt that throws/skips (Q1) → the most-recent recorded `check.completed` `CheckResult` (from `readByRun`) is served; no fabrication. Why: §7/§9 replay-backed fallback.
3. **`fallback_reads_no_resample_no_append`** — Asserts: on the fallback path, no provider call and no `store.append` occurs — only `readByRun`. Why: rule #7 (no re-sample) + the recorded result is authoritative.
4. **`no_recorded_result_non_fabricated`** — Asserts: live fails AND no recorded `check.completed` exists → a non-fabricated signal (Q2 default), never an invented pass. Why: §7 (never auto-fabricate).
5. **`unregistered_adapter_not_live_run`** — Asserts: an unregistered adapter id → the live `runCheck` resolves to `skipped` (not a usable live result) → fallback/surfaced, never executed. Why: §7/rule #3 (gated to allowlisted).
6. **`most_recent_recorded_result_selected`** — Asserts: with multiple recorded `check.completed` for the candidate+checkType, the latest (highest sequence) is served. Why: §9 (the authoritative latest).

**Integration (`test/integration/check-runners/live-rerun.test.ts`)** — real PG:
7. **`live_success_emits_normal_events`** — Asserts: a succeeding live re-run via `runCheck` emits the normal `check.started`+`check.completed` (same shape) + returns the fresh result. Why: §7 (same registry path, no special shape).
8. **`live_fail_serves_persisted_result_no_new_append`** — Asserts: seed a recorded `check.completed`; a failing live attempt → the persisted `CheckResult` is served; the event count for the run did NOT grow on the fallback path (no re-sample, no fabricated append). Why: §7/§9/rule #7.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Reuses `runCheck`/registry/`CheckResult`/event-store. No Appendix-A change.
- **§2.5-seam model touched?** No. The `CheckResult.safeParse` on the served/persisted result is the producer-agreement pin (lesson 20).
- **Orchestrator doc rows to write hot (Step 9):** likely none. Possible **Architecture-doc note** (§7/§17 — name `liveRerun` as the live-rerun + replay-fallback mechanism; record the operator-trigger/demo-UI + winning-idea selection as P3/P5/demo-deferred). Flag at Step 9.

## Things to flag at Step 2.5
1. **(design) Fallback trigger — what counts as "live stalls/fails".** Pure adapters don't stall; a "live" check fails by throwing (a future timeout/provider error) or by returning `skipped` (couldn't run live, e.g. retrieval_unavailable). My default: **`liveRerun` takes an injectable `liveAttempt` (default `runCheck`); the fallback fires when the live attempt THROWS or returns a `skipped` result** (both "the live re-run didn't produce a usable verdict"). A passed/failed live result is "usable" → returned. (The P3 wall-clock stall surfaces as the liveAttempt throwing — modeled by the injectable.) Confirm.
2. **No-recorded-fallback outcome.** Live fails + nothing recorded. My default: return a `skipped` `CheckResult{reason:'live_failed_no_recorded_fallback'}` (a schema-valid, non-fabricated result the caller/operator surfaces) — NOT a throw and NOT an invented pass. Alternative: a typed `{fallback:false}` result object. Confirm.
3. **Locating the recorded result.** My default: `readByRun(runId)` → filter `type==='check.completed'` with matching `candidateId` (+ checkType from the payload) → the highest-`sequence` one (the latest authoritative). Confirm the match key (candidateId + checkType).
4. **Scope — mechanism only.** Confirm the operator-trigger, the demo UI, and the "winning idea" selection (which candidate's check to re-run — a P5/runtime output) are OUT (named-deferral); this slice builds + tests the `liveRerun` mechanism against injected inputs.

## Dependencies + sequencing
- **Depends on:** P0.7 `CheckResult` (✅); P4.5 `runCheck`/registry (✅); P4.9 allowlisted-executable + the transfer adapters (✅); the event store P1.3 `readByRun` (✅). **No P3/P5/demo dependency for the mechanism** (inputs injected; winning-idea + UI deferred).
- **Blocks:** the demo track's "execute the transfer live" affordance (wires the operator trigger + UI to `liveRerun`); the P3/P5 path that selects the winning idea.

## Estimated commit count
**1.** One focused mechanism (`liveRerun` + its fallback). NOT a safety-invariant slice (rule #3 is pinned in
P4.5; this reuses the gated `runCheck` + the read-only `readByRun`). **security-reviewer: invariant-touching**
(confirm: the live path adds NO execution surface beyond `runCheck`; the fallback only READS (`readByRun`) +
never appends/fabricates; no provider re-sample on the fallback path — rule #7).

## Lessons-logged candidates anticipated
- **Convention candidate** — possibly: "a live-rerun-with-replay-fallback is try-live-through-the-same-gated-path / else-serve-the-recorded-authoritative-result (read-only, no re-sample, no fabrication) — the fallback reads the highest-sequence recorded event, never invents a result; the live path reuses the normal runner verbatim (no special-case shape)." Flag at Step 9 if it generalizes.
- **Architecture-doc note candidate** — §7/§17: name `liveRerun`; record the operator-trigger/UI/winning-idea as P3/P5/demo-deferred.
- **Future TODO** — the demo track wires the operator affordance + UI to `liveRerun`; P3/P5 supplies the winning-idea selection.

## How to invoke
1. **Read this brief end-to-end** (session re-engaged — the earlier "buildable-complete" was a scope error; P4.11 IS buildable). No `/session-start` needed.
2. **Run `/tdd live_check_rerun`.**
3. **Step 0/1** — confirm Feature + file list (note the path-drift + the mechanism-only scope).
4. **Step 2.5** — answer the 4 design questions; ping the orchestrator before GREEN.
5. **Step 9** — surface anything beyond the anticipated candidates. **security-reviewer (invariant-touching).**
