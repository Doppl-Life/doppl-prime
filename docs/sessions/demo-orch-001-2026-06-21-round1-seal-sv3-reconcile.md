# Session demo-orch-001 — Demo round 1 orchestrator seal + sv3 integration-reconcile (cycle-proof handoff)

**Date:** 2026-06-21
**Track:** demo · **Role:** orchestrator (demo-observability-orchestrator)
**Siblings (same round):** impl session docs `demo-001-2026-06-21-projections-serve-layer.md` (obs/apps-api, `54f2258`) + `demo-web-001-2026-06-21-p7-web-foundation.md` (web/apps-web, `697c139`).
**Round seal:** `79d73b7` → origin/track/demo (pushed).

> **Purpose:** this doc is the **cycle-proof handoff** for a fresh orchestrator (the cody integration record is NOT readable from the track/demo worktree until merge). Read this at `/orchestrate-start`. The 🔴 sv3 reconcile below is the load-bearing item.

## What landed (round 1 — 11 slices + prototype, two impls, one track/demo worktree)
- **Backend (obs, apps/api):** P6.1 projection-builder core `7d2c6ec` · P6.2 current-state `ef43fca` · P6.3 lineage `f6b324b` · P6.4 replay-summary (safety rule #7) `548f25e` · P6.5 observability redaction (safety rule #4) `0e2f793` · P6.6 REST write + Fastify `034d587` · P6.7 REST read surface `5b9590b`. Suite: unit 71 / integration 43 (real PG/testcontainers + Fastify inject).
- **Web (apps/web):** P7.1 data-client `38749ac` · P7.2 run-store `2d43ac7` · P7.3 status-primitive + design tokens `65a988c` · P7.4 mode-indicator `e75f809`. Suite: 43 unit + build. Built FROM the design-system prototype `7c0d34c` (`docs/doppl-design-system/`).
- **Lessons banked:** apps/api §27–§33, apps/web §1–§3 (+ index/cross-doc rows, module-layout reconciliation).

## 🔴 sv3 / P0.16 integration-reconcile (DEMO→CODY MERGE — DO NOT SHIP THE MERGE WITHOUT THIS)
cody advanced to **schemaVersion 3** (`477859b` P0.16 judge-output seam: **`JudgeResult` + `judge.reviewed` terminal event**) AFTER the demo forked @ `dd69b36` (sv2). The demo round's projections were built against sv2 and **do not handle the new event/contract**. At the demo→cody merge:
- (a) the schemaVersion gate (P6.1) **auto-adapts** — it reads `CURRENT_SCHEMA_VERSION` from the merged contracts (→ sv3 accepted; no code change).
- (b) **ADD a `judge.reviewed` reducer branch to current-state (P6.2)** — otherwise the held-out judge's output folds to no-op (unprojected). This is the load-bearing gap.
- (c) **Map the judge into lineage (P6.3)** — `LineageNodeType` is closed-6 (no 'judge'); likely a `score` node carrying the JudgeResult, or revisit the node-type set.
- (d) replay older-schema fixture (P6.4) is fine (sv1 ≤ sv3).
**Recommendation:** a dedicated **demo "sv3-reconcile" slice** at/before the demo→cody merge (after the kernel P3 + selection P5 land, since judge events are produced live by P4/P5).

## Tracker reconciliation (where it lives)
Per the lead (integration owner), the round's **task ticks (P6.1–P6.7 / P7.1–P7.4), Log entry, and the 3 carry-forward DELETEs were DEFERRED to the demo→cody merge** (kernel precedent: ticks follow the track→cody merge; ticking before merge would falsely claim integration). cody integration record `d81a27e` holds: the sv3 reconcile finding (carry-forward) + a demo round-1-sealed pointer (Currently-in-progress). The **full reconciliation content** (ticks list, Log entry, DELETEs) is in the orchestrator's close-out ack to the lead, captured for the merge.

## Carry-forward state (for the next demo brief)
- **DELETE at merge (consumed this round):** bodyLimit (P6.6) · IDs-opaque (P6.1–6.7 parameterized + P7.1 percent-encoded) · §14 env-value redaction (P6.5).
- **KEEP / integration-reconcile (P3/P4/P5/hosted):** P3 emission semantics (energy_exhausted-terminal sequencing · generation-phase markers · candidate-status advancement) · node-id uniqueness (P3 id-gen) · evidenceRefs full-resolve (P1.7) · persisted-idempotency + log-wide active-run scan (`listRunIds` ready) · P7.14 live-RunStatus-from-SSE wiring (+ possible P7.2 store-status enhancement) · **🔴 sv3/P0.16 reconcile (above)**.
- **STANDING:** ratified observability-scrub seam (demo owns `scrubObservabilityPayload`/`createEmitBoundary`; P2.8 imports, never reimplements — change = cross-track Finding) · bundle-where-safe (safety-invariant slices solo).

## Next round (on the next user go — team is idle, NOT cycled)
- **obs (apps/api):** P6.8 health endpoint (+ the P7.4 live-RunStatus seam) · P6.9 SSE stream (resume from lastEventId, operation-start markers) · then P6.10 self-observability, P6.11 Neo4j spike.
- **web (apps/web):** P7.5 run-config panel (cap-max validation) → P7.6 stop control → P7.7 React Flow lineage (consumes P6.3; resolves the deferred in-flight derivation) → panels P7.8–P7.13 → P7.14 shell (global ModeBanner mount + live-RunStatus wiring) → P7.15 Playwright e2e.
- **Integration:** the sv3-reconcile slice + the demo→cody merge.

## Open follow-ups
Full per-track lists in `demo-001` + `demo-web-001` "Open follow-ups". The orchestrator-side load-bearing item is the 🔴 sv3 reconcile.
