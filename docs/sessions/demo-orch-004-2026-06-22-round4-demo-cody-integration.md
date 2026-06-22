# Session demo-orch-004 — Demo round 4: the demo→cody INTEGRATION (sv2→sv5 reconcile · /phase-exit P7 · GREEN integration preflight)

**Date:** 2026-06-22
**Track:** demo · **Role:** orchestrator (demo-observability-orchestrator).
**Predecessor:** demo-orch-003 (round-3 seal — Phase 6 + Phase 7 complete). **Round-4 impl docs:** demo-004 (backend) · demo-web-004 (web).
**Round-4 seal:** the `/orchestrate-end` round-terminal commit on `track/demo`. **NOT pushed; demo→cody fast-forward NOT pushed.** The LEAD gates the cody push (DAG-override ACCEPTED — we merge ahead of selection on purpose).

> User-directed round: ROUND 4 = the demo→cody INTEGRATION round. Bring cody-sv5 into track/demo, reconcile sv2→sv5, fold the deferred /phase-exit P7, land demo→cody, GREEN integration preflight, then HOLD for the lead's push gate.

## What landed — the integration round

### 1. cody-sv5 → track/demo merge (`da6ef82`)
Brought the integration line (cody `06299c9`, `CURRENT_SCHEMA_VERSION` 2→5 + the kernel/verifier substrate) INTO track/demo so the demo projections + dashboard build against sv5. **Merge-conflict resolution (6 files):**
- `IMPLEMENTATION_PLAN.md` → cody canonical (track/demo's was fork-state).
- `apps/api/LESSONS.md` + `apps/api/CLAUDE.md` lesson index → **UNION**. §1–26 identical both sides; cody's §27–50 (kernel/verifier) kept authoritative; demo's §27–37 collided → **renumbered §51–61** (next free slots), internal cross-refs remapped (§27→§51, §28→§52, §29→§53, §32→§56). The "lesson-numbers collide on merge" playbook.
- `apps/api/CLAUDE.md` cross-doc table → UNION (cody `JudgeResult` + demo `ProjectionWatermark` — the latter dropped by an initial `--theirs`, restored).
- `apps/api/package.json` → union deps (fastify + openai); `pnpm-lock.yaml` regenerated via `pnpm install`.
- `ARCHITECTURE.md` → cody (auto-merged).

Key forecast that held: cody touches **zero** demo projection/reducer/web files → the merge landed sv5 contracts without colliding on the reconcile surfaces; the resulting RED (web status-map exhaustiveness) + the additive-test-first backend drove the reconcile slices.

### 2. sv2→sv5 projection + status-map reconcile (ADDITIVE — demo consumes, emits none)
- **Backend `bb2d75c` (demo-028; P6.2/P6.3/P6.8):** `judge.reviewed`→`JudgeResult` reducer branch (new apps/api-internal `CurrentState.judgeResults` row, rule #7 verbatim) · the 4 new sv5 terminals → terminal status (`run.cancelled`/`generation.skipped`/`agenome.failed`/`candidate.rejected`) · judge → lineage `score` node + guarded `judged_by` edge · run-health `judge.review_started`↔`judge.reviewed` pairing. **`degraded`/`repairing` get NO reducer transition** — no `RunEventType` carries them (kernel-internal §3 states), pinned by an exhaustive-over-41-types test. apps/api unit 359→365 / integration 78→79.
- **Web `87e90d3` (demo-029; P7.3):** status-map `generation.degraded` (`◓`, `var(--warning)`, non-pulse) + `candidate.repairing` (`↻`, `var(--status-review)`, pulse) — the 2 frozen-enum values that were failing the exhaustiveness guard. The 4 sv5 terminal statuses were already mapped. web 142→145.

### 3. `/phase-exit P7` — CLEAR (the deferred round-3 4-auditor fan-out re-run)
- **reachability CLEAR** — 93/97 reachable; 4 non-blocking (2 chart mean-series deferrals, 1 `deriveMode` cleanup, 1 accepted test-seam).
- **arch-drift CLEAR (0 drift)** — §12/§10 code matches spec; 2 stale-doc notes (§12 mermaid `RP[replay timeline]` ahead of prose; the "sv5" label is loose — degraded/repairing are sv4 enum members) + 1 ambiguous (in-flight per-category render) dispositioned as the tracked RunHealth-promotion deferment.
- **security CLEAR** — rules #2/#4 + no-`apps/api`-import + color-not-alone all hold; 1 low (web-local unfrozen `RunHealth`, known MVP defer).
- **code-quality CLEAR** — 4 low (cross-domain color/glyph reuse, a missing pulse-assertion, StatusBadge bare-int px); sv5 specs sanity-checked PASS.
- Reports: `docs/audits/P7-{reachability,arch-drift,security,code-quality}.md`. spec-lint `tests 7` PASS (§10/§12); `pnpm audit --prod` clean.
- **Phase 6** (CLEAR round-3) + **Phase 7** (CLEAR now) task ticks landed this round (P7.14 in-flight per-category bullet left partial → RunHealth-promotion carry-forward).

## Lessons banked
- **apps/api §62** — an sv-skew projection reconcile is ADDITIVE when the downstream consumes-not-emits: new event type → keyed verbatim row / terminal status transition; a new internal-only status with no event type → NO reducer transition, pinned by a test exhaustive over the closed event registry. Distinguish "the frozen enum has the value" (display-exhaustiveness) from "an event carries the value" (reducer fold branch).

## Hot-routing this round
- Lesson §62 (LESSONS.md + CLAUDE.md index). · `ARCHITECTURE.md §3` clarification note (degraded/repairing = state-machine-internal, no `RunEventType`). · Carry-forward: deleted the sv5-reconcile + `packages/observability`-early-merge items (consumed; observability rides the demo→cody ff); added the demo post-integration follow-ups item. · No cross-doc invariant change (CurrentState.judgeResults is apps/api-internal). · No deferment escalation (the per-category in-flight render is a pre-existing tracked deferment, re-confirmed).

## Seal state + next
- **Round-4 terminal commit:** this `/orchestrate-end` commit on `track/demo` (plan ticks + Log + carry-forward triage + lesson §62 + §3 note + 2 briefs + 4 P7 audit reports + this doc).
- **demo→cody = fast-forward** (cody `06299c9` ⊆ track/demo) — to be applied on the cody integration checkout, then the integration preflight (per-area) is the GREEN gate. **NOT pushed — the lead gates the cody push.**
- **Next (when the user resumes):** the cody push (lead-gated) → `/team-end` pause; then the next demo round = **Phase D** (local demo path + prepared-replay fallback) + the demo post-integration follow-ups (RunHealth promotion / per-category in-flight render, lineage `onSelect`, SSE connection-drop listener, dataRef confirms).
