# Session demo-orch-003 — Demo round 3 seal: Phase 6 + Phase 7 COMPLETE (full demo)

**Date:** 2026-06-22
**Track:** demo · **Role:** orchestrator (demo-observability-orchestrator) — **cycling out** (ACTION auto-cycle; full-team).
**Predecessor:** demo-orch-002 (round-2 seal). **Round-3 impl docs:** demo-003 (backend/obs) · demo-web-003 (web).
**Round-3 seal:** this `/orchestrate-end` round-terminal commit on `track/demo`. **NOT pushed** (lead gates the push on the user's pause-vs-continue-into-PD call). **NOT merged to cody.**

> **Cycle-proof handoff for the next demo round.** Read this + demo-orch-002 + demo-orch-001 at `/orchestrate-start`. The cody tracker (integration) holds the authoritative ticks; track/demo is the code. The track/demo `IMPLEMENTATION_PLAN.md` Currently-in-progress is fork-state — the real round state lives here + in cody's plan + cody's carry-forward.

## Round 3 — what landed (continuous-roll; ACTION auto-cycle at the Phase-7 close)
**The full demo backend serve/observe surface + the full React dashboard.** 13 slice commits on `track/demo` (e448b46..90e22ee):

**Phase 6 (obs/apps/api) — COMPLETE + `/phase-exit P6` gate CLEAR:**
- **P6.9** SSE run-event stream — delivery-only, Last-Event-ID resume, polling fallback (`3270745`).
- **P6.10** runtime self-observability — structured kernel-logger + worker heartbeat (`9fb79b4`).
- **P6.11** Neo4j lineage-export spike — derived read-only export + throwaway notebook (`2416292`; **closed Phase 6**).
- **P6 gate-fixes** — SSE empty-cursor, unique lineage edge-ids, §13 spec-tag, +2 low (`0aa031e`).
- 2 style commits (`ec99178` P6.9/6.10 test-format; `c6eaa90` lineage-graph repro-edge format).
- Suites: apps/api unit **76→86**, integration **49→56**, observability **12→16**.

**Phase 7 (web/apps/web) — COMPLETE (P7.6–P7.15):**
- **P7.6** stop control (`5d02b54`) · **P7.7** React-Flow lineage (`f290d6d`) · **P7.8** charts (`c69c3a1`) · **P7.9** energy (`76a3604`) · **P7.10** candidate-inspector (`fef89e0`) · **P7.11** critic-gauntlet (`9ee69f3`) · **P7.12** subtype-check (`e146679`) · **P7.13** final-idea capstone (`a896a11`) · **P7.14** shell + SSE-store IoC wiring (`0bfea9b`) · **P7.15** Playwright happy-path smoke (`90e22ee`).
- Suites: apps/web unit **52→142** + the **§16 e2e smoke ran GREEN** (chromium) — it caught + fixed a real P7.14 effect-loop bug (inline `eventSourceFactory` default → effect-dep churn → re-fetch loop; module-const fix).

## `/phase-exit` status
- **P6: CLEAR** (this round). 4-auditor fan-out (reachability/arch-drift/security/code-quality) all CLEAR — reports `docs/audits/P6-*.md`; preflight + `pnpm audit --prod` clean; spec-lint tests 6 PASS §9/§10/§11/§13. Code-quality surfaced 2 [med] + lows → fixed in the `demo-020` gate-fix slice (re-verified CLEAR).
- **P7: STARTED, deterministic rows PASS, auditor fan-out DEFERRED.** spec-lint tests 7 PASS (§10/§12 covered); `pnpm audit --prod` clean. The 4-auditor fan-out was NOT run (ACTION tier — don't run heavy auditors mid-cycle) → **re-enters at the next round's `/phase-exit P7` start** (mid-gate re-entry; the deterministic results carry forward).

## Lessons banked this round
- **apps/api:** §35 (SSE bridge) · §36 (runtime self-observability) · §37 (per-slice format:check gate — process) · §30 EXTENDED (unique kind-prefixed edge ids — RF breaks on dup ids).
- **apps/web:** §4 (run-control store-derived terminal) · §5 (React-Flow lineage 6→5 + Dagre + in-flight fold) · §6 (metric panel = pure event-selector) · §7 (EvidenceRef in-tier only) · §8 (display emit-only evidence, never re-derive the decision) · §9 (shell SSE-store IoC + raw-events FoldState + link composition) · §10 (e2e smoke route-intercepted, catches what unit doubles miss; module-stabilize effect deps).

## Tooling fixes (root-config) this round
- **eslint ignores the vendored prototype** — `pnpm -r lint` tripped on 357 no-undef errors in `docs/doppl-design-system/` (vendored design reference, not our code; same class as the 2026-06-21 `scaffold/` hotfix). Added `**/doppl-design-system/**` + Playwright artifact dirs to `eslint.config.mjs` ignores (in-repo, tooling-only — no schema/code change). `.prettierignore` already excludes `docs/`; added the Playwright artifact dirs there too.

## cody tracker reconciliation (routed to the lead/integration — applied AT the demo→cody merge; ticks follow the merge, not the seal)
**Tick at merge:** P6.8, P6.9, P6.10, P6.11 + P7.5, P7.6, P7.7, P7.8, P7.9, P7.10, P7.11, P7.12, P7.13, P7.14, P7.15 (this round) [+ P6.1–P6.7 + P7.1–P7.4 from round 1, P6.8/P7.5 from round 2 if not yet ticked]. **Phase 6 + Phase 7 checkboxes** tick on the merged `/phase-exit` CLEAR (P6 CLEAR now; P7 auditor fan-out re-runs at merge/next-round). Log: round-3 (Phase 6 + Phase 7 complete). **DELETE-at-merge (demo-consumed):** the IDs-opaque/bodyLimit/§14-env-value items already deleted from cody's carry-forward at the round-3 carry-forward-hygiene pass (cody `36ba7aa`).

## Carry-forward (all MERGE-TIME; recorded in cody's carry-forward where cross-track, else here for the demo→cody merge)
- **sv5 reconcile** (cody carry-forward, `c771b91`): sv2→sv5 — add `judge.reviewed` reducer branch (P6.2) + judge→lineage (P6.3) + handle `GenerationStatus:'degraded'` + `CandidateStatus:'repairing'` + the 4 new sv5 terminal event types + re-record member-set snapshots, in the current-state reducer + apps/web status-map; all ADDITIVE (demo consumes only). Fixture-tested at merge.
- **packages/observability early-merge** (cody carry-forward, `663af4b`): sv-INDEPENDENT (verified) → can merge EARLY (separate from sv5) to unblock kernel P2.3/P2.8. Lead coordinates.
- **RunHealth reconcile + promotion** (new): the P7.14 web-local `RunHealth` Zod schema (`apps/web/src/data/health.ts`) vs P6.8's real `GET /health` response; decide whether to PROMOTE RunHealth to a shared `@doppl/contracts` model (frozen-contract amendment, lead/contract-coordinated). LESSONS §34 "promote at P7.14".
- **SSE connection-drop fallback** (new): P7.14 `onError` wires the payload-validation hook only; add the EventSource `'error'` listener (the real connection-drop case) at the live-SSE integration.
- **Lineage `onSelect`** (new): P7.7 `LineageGraph` has no `onSelect` prop → interactive lineage-node-click→inspector is unwired (the P7.14 shell defaults to the winner). Small P7.7 follow-up (or merge); NOT blocking (the e2e traverses the winner-default).
- **dataRef↔entity-id bridge + run.configured-carries-RunConfig.caps** (pre-existing): confirm the P7.7 in-flight node-bridge + the P7.9 energy-budget source against the real producer at integration.

## Round-3 web-impl convention check (multi-track memory)
No FROZEN Appendix-A model changed (consumer side). 6 `data/contracts.ts` seam re-exports added (FitnessScore/NoveltyScore/EnergyEvent/CriticReview/CriticMandate/CheckResult) — each a consumed-read-only extension, mirrored in the `apps/web/CLAUDE.md` cross-doc table (orch hot-write). `RunHealth` is web-local (not a frozen amendment). `LineageExport.runId` is apps/api-internal.

## Seal state + next
- **Round-3 terminal commit:** this `/orchestrate-end` commit on `track/demo` (lessons + 13 briefs + 4 P6 audits + eslint/prettier-ignore tooling + this doc). **NOT pushed** — the lead gates the push on the user's **pause-vs-continue-into-Phase-D** call. cody carry-forward records (`36ba7aa`/`663af4b`/`c771b91`) are committed on cody, unpushed.
- **Next demo round (when the user resumes):** (1) `/phase-exit P7` auditor fan-out (re-enter, the deterministic rows passed); (2) **Phase D (demo)** — the local-first demo path + prepared-replay fallback (the remaining demo-track phase); (3) at the demo→cody merge: the sv5 reconcile + observability early-merge + the RunHealth/onSelect/connection-drop/dataRef confirms. **No track/demo slices remain for Phase 6/7** — they're complete.
- **Standing posture:** continuous-roll (no per-round user go); the lead gates the seal on the canonical `/context-check` tier + the user's call. (Process note this round: the orch twice front-ran a seal off gut context-perception — corrected; gate ONLY on the canonical tier.)
