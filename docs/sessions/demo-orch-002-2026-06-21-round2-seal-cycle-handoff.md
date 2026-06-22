# Session demo-orch-002 — Demo round 2 seal + FULL-TEAM cycle handoff

**Date:** 2026-06-21
**Track:** demo · **Role:** orchestrator (demo-observability-orchestrator) — **cycling out** (ACTION auto-cycle; full-team).
**Predecessor:** demo-orch-001 (round-1 seal). **Round-2 impl docs:** demo-002 (obs, `5d4b845`) · demo-web-002 (web, `679a316`).
**Round-2 seal:** this `/orchestrate-end` commit → origin/track/demo.

> **Cycle-proof handoff for the FRESH round-3 team** (orchestrator + 2 impls all respawn). Read this + demo-orch-001 at `/orchestrate-start`. The cody tracker (integration) holds the authoritative ticks; track/demo is the code.

## Round 2 — what landed (continuous-roll; ACTION auto-cycle mid-round)
- **P6.8** run-health projection + `GET /runs/:id/health` (`c0a8d23`): read-only log-derived signal — generation, candidates-in-flight, operations-in-flight (count-based unpaired markers), last-event time, caps-consumed clamped to ceiling. apps/api unit 76 / integration 49.
- **P7.5** operator run-config panel (`a64f80c`): form over RunConfig/RunCaps (shared-Zod validated), cap-max fail-closed client-side (DEFENSE/UX; clampCap lowering-only, CAP_CEILING mirrors API defaultConfig.caps), idempotent Start (per-submit Idempotency-Key; additive `runClient.startRun` extension), validate-on-submit a11y. apps/web 52 unit.
- **LESSONS banked:** apps/api **§34** (run-health: read-only log-derived, count-based ops-in-flight, clamped caps).
- **P6.9 ABANDONED CLEAN at the ACTION cycle** — Step-0/RED only, NO commit/source, RED files removed, suite green (76/76), server.ts at the P6.8 boundary. Task carries to round 3. **The approved Step-2.5 design is captured below so round 3 redoes GREEN cheaply.**

## 🟢 Round 3 targets (continuous-roll posture STANDING — roll without per-round user goes; ACTION auto-cycle is the backstop)
- **obs (apps/api):** **P6.9** SSE (brief `demo-014` + the captured design ↓) · **P6.10** runtime self-observability (structured kernel logs + worker heartbeat; redaction-filtered before external emit — reuses the P6.5 observability scrub) · **P6.11** Neo4j spike (timeboxed throwaway, week-2, derived lineage export — only after the React-Flow path works).
- **web (apps/web):** **P7.6** stop control (idempotent kill path — sibling of P7.5; runClient.stopRun) · **P7.7** React Flow lineage (consumes P6.3; resolves the deferred in-flight derivation + the P7.4 live-RunStatus seam) · **P7.8–P7.13** panels (charts/energy/candidate/critic/subtype/final-idea) · **P7.14** shell (global ModeBanner mount + live-RunStatus-from-SSE wiring + health panel) · **P7.15** Playwright e2e (+ ModeBanner hatch visual).

## 📌 Captured P6.9 design (Step-2.5-approved this round — round 3 reuses, no re-design)
Bridge = **poll** `readByRun` past the cursor: `streamRunEvents(store, runId, fromSequence, options)` async-generator, demo-owned, **read-imports** the event store (like P6.7 `listRunIds` — NO kernel append-hook edit); injectable `sleep`/`intervalMs`/`maxIdlePolls`/`signal` (no real timers). Cursor = `Last-Event-ID` header + `?lastEventId` fallback (numeric-guard → 400 if present-but-invalid; absent → -1 = from sequence 0). Route `GET /runs/:id/stream`: parse cursor → readByRun empty → 404 → `reply.hijack()` + `raw.writeHead(text/event-stream)` → for-await write `id:<sequence>\ndata:<json>\n\n` → `raw.end()`; client-disconnect (`request.raw 'close'`) → `AbortController.abort()`. Delivery-only (rule #2). Test bound = injected no-op sleep + `maxIdlePolls=1` (close-after-one-empty-poll). buildServer gains `sse?: EventBridgeOptions` (prod default = real sleep + maxIdlePolls=∞).

## 🔴 sv3 / P0.16 reconcile — STILL the demo→cody-merge item (see demo-orch-001 for detail)
cody = schemaVersion 3 (JudgeResult + judge.reviewed); demo = sv2. At the demo→cody merge: add a `judge.reviewed` reducer branch (P6.2 current-state), map the judge into lineage (P6.3), and complete P6.8's judge-in-flight pairing (judge.review_started↔judge.reviewed). NOT a round-3 track/demo slice (needs the sv3 contracts + live P4/P5 judge events).

## Convention candidates (round 3 banks as apps/web §4 if they recur)
- Browser cap-max is **fail-closed DEFENSE/UX** (lowering-only) — validate SHAPE via the shared Zod, NEVER re-implement the contract; the API + kernel are the authoritative enforcers.
- **validate-on-submit** (clickable Start + inline accessible errors that say WHY) over the prototype's hard-disable-until-valid — an a11y improvement; the port may improve on the prototype (cf. P7.3/P7.4 adherence fixes).

## Carry-forward (working set)
- **Round-1 (stand):** P3/P4/P5 integration-reconciles (energy_exhausted-terminal · generation-phase · candidate-status · node-id uniqueness · evidenceRefs-P1.7 · persisted-idempotency + log-wide-active-run [listRunIds ready]) · P7.14 live-RunStatus-from-SSE · ratified observability-scrub guard (P2.8 imports, never reimplements) · **sv3-reconcile** (above). DELETE-at-merge: bodyLimit, IDs-opaque, §14-env-value (all consumed).
- **Round-2 adds:** P6.9 (round 3) · P7.6 (round 3) · failed-op-in-flight decrement (cheap refinement, deferred) · the convention candidates above.

## cody tracker reconciliation (routed to the lead/integration — applied at the demo→cody merge, kernel precedent: ticks follow the merge, not the seal)
Tick at merge: **P6.8, P7.5** (round 2) [+ P6.1–P6.7, P7.1–P7.4 from round 1]. Log: round-2 (P6.8 + P7.5; P6.9 abandoned-to-round-3 at the ACTION cycle). Currently-in-progress: round-2 sealed; round 3 = P6.9/P6.10/P6.11 obs · P7.6+ web; sv3-reconcile at merge.

## Push posture
track/demo round-2 commit pushed to origin/track/demo. NOT merged to cody (that's the lead/integration's merge, where the sv3-reconcile + the deferred ticks land).
