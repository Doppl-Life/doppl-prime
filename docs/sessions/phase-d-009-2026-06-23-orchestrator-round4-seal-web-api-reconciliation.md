# Session phase-d-009 — Orchestrator round-4 seal: live re-run + web↔API wiring & reconciliation

**Role:** orchestrator (`phase-d-api-orchestrator`, fresh successor). **Track:** phase-d (worktree `Capstone-phased`, branch `phase-d`).
**Predecessor:** `phase-d-008-2026-06-23-web-api-wiring-reconciliation.md` (implementer's technical narrative for this same round — read it for the per-slice detail).
**Round-seal commit:** this `/orchestrate-end` (pushed origin/phase-d). **Off:** `59671bf`.

## Why this doc exists
The implementer's `phase-d-008` captures the build. This is the **orchestrator framing**: the findings routed, the load-bearing decisions escalated to the user, the scope calls, the doc-routing ledger, and the merge-gate state. The prior pair was spent before banking the residual round-3 lessons; this round folds those in too.

## What landed (planning level)
- **PD.8c live re-run** (task #5, validation-only): dispatched the impl to run `test:smoke:live` with the user's real keys (sourced from the **repo-root** `.env` — a correction to the handoff's `apps/api/.env`). Result: **10/10 RAN-LIVE, a real `'selected'` winner** — confirmed PD.13's `json_object` fix on a live run. This is the live-LLM validation the user wanted; it **closed the structured-output finding the lead had escalated to the user**.
- **PD.14 `fb27d73`** (web↔API transport: Vite proxy + env baseUrl + a REAL web→proxy→API smoke), **PD.15 `3b3d476`** (read-path/SSE reconciliation; security-reviewer INVARIANT CLEAN), **PD.16 `fd32890`** (command/operator-start-stop reconciliation). All test-first, Step-2.5 reviewed, ZERO frozen-contract change.

## Decisions (orchestrator-routed / escalated)
- **The PD.14 real smoke earned its keep 3×.** It caught (1) the web↔API response-shape drift (the headline finding), (2) the live-SSE silent-drop (null-bearing frames threw the per-frame parse), (3) a bodyless-POST→Fastify-400 on operator Stop. All three were invisible to the prior mocked e2e — the brief's exact thesis, now proven. Banked as apps/web LESSON §12.
- **Web↔API fix = BOTH SIDES (option C), reconcile-then-merge** — ESCALATED to the user via the lead (category 2 finding + category 4 load-bearing: it could have touched the frozen `RunEventEnvelope`). User chose C; ZERO contract change (omit nulls API-side, never `.nullable()`).
- **PD.15 / PD.16 split** — I initially folded start/stop into PD.15 ("small"); the impl corrected the premise (the command ripple is ~13 files). **Deferred to the evidence** → split: PD.15 = read-path/SSE core (committed green), PD.16 = the command ripple. Better commit hygiene; both before the merge.
- **Operator Start/Stop is in-scope before-merge** — I over-surfaced this scope question twice; the lead settled it firmly (the user's live-demo arc — PD.5/PD.10 — makes operator Start unambiguously part of "demo UI fully works"). Calibration note: be more decisive on items clearly inside a stated intent.

## Doc-routing ledger (orchestrator territory — all hot, in the round commit)
- **LESSONS:** apps/api **§96** (unit-tested helper with no caller is dead-by-reachability → wire at build-time; PD.12), **§97** (shared-container full-stack-boot needs its own fresh DB; PD.8c), **§98** (json_object + schema-as-candidate-independent-system-text; PD.13) + **apps/web §12** (a mocked e2e proves render, not the real web↔API connection; PD.14). Index rows added to both `CLAUDE.md`s.
- **ARCHITECTURE.md:** §6 (PD.13 provider structured-output mode), §14 (rule-#5 reinforcement), §11 (the Phase-D web↔API wiring + new routes `/problem-sets`, `/demo/fallback-ladder`), §17 (PD.7–16 continuation).
- **DEMO_RUNBOOK.md:** root-`.env` sourcing (`set -a; . ./.env; set +a`) + the Vite-proxy/API-at-:3000 note.
- **Briefs authored:** `phase-d-020` (PD.15), `phase-d-021` (PD.16).
- **Plan:** PD.14/15/16 done-annotations; PD.15 + PD.16 task blocks added; the resolved structured-output Carry-forward item deleted; round-4 Log + "Currently in progress" seal.

## Merge-gate state (handed to the lead)
- **PD.1–PD.16 DONE at task level.** Both areas `/preflight` CLEAN (api unit 664 · web unit 186 + smoke 4/4). The live demo path works end-to-end through the proxy against the real API: type problem → Start → live SSE → Stop.
- **PD phase checkbox + `Acceptance criteria (PD)` STAY GATED on a CLEAR `/phase-exit PD`.** Recommendation: delta-scope it to the additive **PD.12–16** since the last full fan-out — PD.15 security-reviewer CLEAN, PD.14/16 touch no invariant, reachability confirmed (`phase-d-008` §60–64), ARCH-drift closed by the hot §6/§11/§14/§17 notes. This is part of the **lead-owned phase-d→cody merge + USER sign-off** (I do NOT merge).

## Open follow-ups (post-merge backlog — non-blocking; relayed to the lead)
Cross-track / post-MVP, none blocking the validated demo: `candidate.rejected` emitter (runtime↔selection seam) · fake-gateway `final_judge`/`population_generator` fixtures (test-infra) · retrieval-FETCH wiring (check set honestly N-of-M) · demo polish (RunHealth→frozen promotion, lineage `onSelect`, SSE connection-drop `'error'` listener, chart mean-series) · P2.8 Langfuse export (rule-#2 projection subscriber) · generation-level drain on crash · selection P5 minor code-quality. Live-fixture commit = the user's optional call (default transient).

## Successor / next
**STOP.** Hand to the lead for the phase-d→cody merge + USER sign-off, then `/phase-exit PD` close + the PD checkbox tick. No next brief authored (terminal track-phase; the merge is lead-owned).
