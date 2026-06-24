# Session phase-d-011 — Orchestrator round-5 seal: demo-polish (PD.17–PD.20)

**Role:** orchestrator (`phase-d-api-orchestrator`). **Track:** phase-d (branch `phase-d`).
**Predecessor:** `phase-d-010-2026-06-23-demo-polish-round.md` (implementer's technical narrative for this round).
**Round-seal commit:** this `/orchestrate-end` (pushed origin/phase-d). **Off:** `4a0696d` (round-4 seal).

## Why this doc exists
Orchestrator framing for the user-approved demo-polish round (the impl's `phase-d-010` has the per-slice build detail). Captures the decomposition, the mid-round re-sequence, the context-cycle handling, the doc-routing ledger, and the merge-gate recommendation.

## What landed
A user-requested (hands-on testing) pre-merge polish round, 4 slices, all ZERO frozen-contract change:
- **PD.17 `7980513`** — run-list / replay browser (wires the PD.15 `listRuns`) + `mode` lifted to Dashboard state (fixes a latent fallback-rung mislabel).
- **PD.20 `6a675d2`** — DEMO-CRITICAL: live lineage/health re-fetch on the SSE cadence (the "watch it evolve" headline was frozen at 1 node — PD.15 fixed delivery, not the projection rebuild).
- **PD.18 `002c496`** — cap-maxima read route `GET /config/caps` + RunConfigPanel fetch/clamp (fixes the cap-default 422; rule #1 stays route-authoritative).
- **PD.19 `774b20e`** — clear API startup log (Fastify logger was off → silent boot) + `.env.example` relative-fixture-dir omission (CWD-independent default, pinned).

## Orchestrator decisions / framing
- **Decomposition:** 4 items → 4 slices (run-list solo · cap endpoint+form · boot+config bundle), then a 5th finding (live lineage) inserted as **PD.20**.
- **PD.20 mid-round re-sequence:** the lead surfaced the live-update finding AFTER PD.17 was dispatched. Inserted PD.20 as the demo-critical next slice (before PD.18/19) via **task blockers** (#12/#13 blockedBy #14), respecting slice atomicity (PD.17 finished first). PD.20 had a higher ID than PD.18/19 but ran before them — blockers enforced the order.
- **Context cycle (option a):** impl crossed WARN (71%, PD.18) → ACTION (78%, PD.19) → HARD-STOP (85%, post-PD.19). Per the lead's option-(a), the impl finished all slices (small/non-invariant) then spun down at the seal — no mid-round cycle for the small remaining slices. I carried the seal at OK (≤65%). Per-slice `--brief` lines sent to the lead on each tier crossing.
- **The PD.14 real smoke kept earning its keep:** across rounds 4–5 it caught the response-shape drift, the SSE silent-drop, the bodyless-POST 400, and the run-list `{runs}` fixture staleness.

## Doc-routing ledger (orchestrator territory — all in this seal commit)
- **LESSONS:** apps/web **§13** (one-time-fetched projection goes stale; re-fetch on the SSE cadence — PD.20) + **§14** (a client form mirroring a server ceiling must FETCH the maxima — PD.18); apps/api **§99** (relative `.env.example` path breaks per-pkg run + silent-boot stdout log — PD.19). Index rows added to both `CLAUDE.md`s.
- **ARCHITECTURE.md §11:** the demo-polish addendum (run-list/replay, live re-fetch, `GET /config/caps`, startup log).
- **DEMO_RUNBOOK §3:** the `DOPPL_FIXTURE_DIR` default note (module-relative; omit/absolute-only).
- **Plan:** PD.17–20 done-annotations; round-5 Log + "Currently in progress" seal; the note-only secondary live-run observation (embeddings degrading / rule-#5 malformed handling).

## Merge-gate state (handed to the lead)
- **PD.1–PD.20 DONE at task level.** Both areas `/preflight` CLEAN (api unit 665 · web unit 203 · smoke 5/5). The demo is fully polished: browse/replay past runs, live "watch it evolve" graph, cap-form works against the real ceiling, clear boot.
- **PD phase checkbox + `Acceptance criteria (PD)` STAY GATED on a CLEAR `/phase-exit PD`** — recommend delta-scope to the additive PD.12–20 (per-slice reviewed; PD.15 security-reviewer CLEAN; PD.14/16–20 no invariant; reachability per the slice session docs; ARCH-drift closed by the hot §6/§11/§12/§14/§17 notes). Part of the **lead-owned phase-d→cody merge + USER sign-off**.

## Open follow-ups (post-merge backlog — non-blocking)
Carried in IMPLEMENTATION_PLAN Carry-forward: the cross-track post-MVP items (candidate.rejected emitter, fake-gateway fixtures, retrieval-FETCH, Langfuse export, etc.) + the note-only live-run model-quality observation. `getRun` remains reconciled-but-unused (a future detail panel); `listRuns`/`getReplay` are now USED (PD.17).

## Successor / next
**STOP.** Hand to the lead for the phase-d→cody merge + USER sign-off, then `/phase-exit PD` + the PD checkbox tick. No next brief (terminal track-phase; merge is lead-owned). The impl spun down at the seal (HARD-STOP).
