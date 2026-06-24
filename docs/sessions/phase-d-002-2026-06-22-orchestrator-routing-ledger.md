# phase-d-002 — Orchestrator routing ledger (Phase-D round 1)

**Date:** 2026-06-22 · **Role:** phase-d-api-orchestrator · **Track:** phase-d (demo) · **Worktree:** `Capstone-phased` (branch `phase-d`, off cody `d7b290a`)
**Predecessor:** — (first phase-d orchestrator session) · **Companion impl doc:** `phase-d-001-2026-06-22-demo-boot-spine-replay-loop.md`

## What this round did (orchestrator framing)

Drove **Phase-D round 1** — the demo's runnable spine + safety net — across **5 slices** (all test-first, Step-2.5 reviewed, security-reviewer CLEAN/bounded-restore-confirmed, `/preflight` clean; suite unit 616 · integration 155). **PD.3 COMPLETE** (`migrate → seed → start` unified boot). Doppl now boots end-to-end, runs, and stops via the kernel kill-and-drain.

| Slice | Commit | Brief | Task |
|---|---|---|---|
| Boot-spine (production boot root `main.ts`) | `f330475` | `phase-d-001-PD.3-production-boot-root.md` | #35 |
| Stop-rewire (POST /runs/:id/stop → kernel operatorStop kill-and-drain, async 202) | `b5ada03` | `phase-d-002-PD.3-operator-stop-rewire.md` | #36 |
| PD.1 dump-replay export | `c8102a4` | `phase-d-003-PD.1-dump-replay-export.md` | #37 |
| PD.2 seed-demo restore | `86d62de` | `phase-d-004-PD.2-seed-demo.md` | #38 |
| PD.3-completion (env-gated boot seed step + per-event seed validation) | `2788ba8` | `phase-d-005-PD.3-boot-seed-completion.md` | #39 |

Round terminal commit: this `/orchestrate-end` (pushed to origin/phase-d).

## Decisions made (load-bearing)

- **Slicing split** (lead): boot-spine then the operator-stop rewire as an ISOLATED safety-adjacent slice (stop semantics = rule #2 authoritative terminalization; never bundle with feature work).
- **Stop routes through the kernel** (lead, ratified): `POST /runs/:id/stop` SIGNALS the kernel `operatorStop` kill-and-drain (the worker drains the current generation + terminalizes `run.stopped` running→stopping, actor `runtime`; the route returns `202 stopRequested` + appends nothing — rule #2). The old in-route `run.stopped` append was a demo-era placeholder AND buggy against a live worker (the loop polls the injected signal, not the log → double-terminal hazard) — so the rewire is also a correctness fix.
- **Gateway boot default = `recorded`** (forced): `selectGateway({useStub:false})` throws ("real gateway not yet wired, P2.5") → the boot default is `recorded` (local-first, §17); `live` is an honest throw until the OpenRouter adapter is wired into `selectGateway`.
- **PD.2 [low](b) §46 hardening ELEVATED + folded** into PD.3-completion (the seed bypasses the append path's per-event validation → a malformed event would insert via jsonb + pass replayEvents ordering-only → fail on READ = a corrupt demo run; PD.3-completion adds per-event `RunEventEnvelope`(null-stripped copy)+`validateEventPayload` before insert).

## Hot-routing landed this round

- **Lessons §84–§88** (`apps/api/LESSONS.md` + index rows in `apps/api/CLAUDE.md`): §84 boot-root=IO/composition · §85 operator-abort=latching-signal · §86 replay-dump · §87 replay-seed-restore · §88 env-gated-boot-seed+pool-cleanup. §87's deferred-gap note updated to CLOSED.
- **Arch note** (`ARCHITECTURE.md §17`): Phase-D implementation status (boot sequence, dump/seed seams, async-stop). §17 already specified the design; this pins the implementation. Fuller arch reconcile happens at the phase-end cody merge.
- **Plan**: PD.1/PD.2/PD.3 task-level done-markers + Currently-in-progress Phase-D seal entry + Carry-forward triage + this Log entry. PD **phase** checkbox + `Acceptance criteria (PD)` ticks are GATED on `/phase-exit PD` (after PD.8).
- **Closed**: selection P5 carry-forward (a) route-max + (b) production boot root (both `f330475`); Phase-D bootstrap-wiring carry-forward (#58, `f330475`/`b5ada03`).

## Carry-forward state (for the next orch — PD.4+ working set)

- **(a) Wire OpenRouter adapter into `selectGateway`** so `DOPPL_GATEWAY=live` works — gates the PD.4 rung-1 LOW-CAP-LIVE rung (the ladder runs on prepared/replay meanwhile; the `providerCall` adapter exists, just not composed into `selectGateway`/`createGateway` as the default). **NOT a blocker, but PD.4 wants it.**
- **(b) Multi-fixture / fixture-catalog seeding** — `seed-demo` loads ONE `<runId>`; PD.4's prepared-run rungs may want a catalog.
- **(c) Web stop-control async-202 handling (apps/web)** — P7.6 stop control now gets `202 {stopRequested}` (async) not `200 {stopped:true}`; show "stopping…" + observe `run.stopped` via SSE; verify no hard-dependency on the old shape.
- **Broaden fake-gateway item**: `createFakeGateway` is NOT loop-capable (BOTH `final_judge {score:3}` AND `population_generator {idea}` fixtures) — loop-driving tests inject a bespoke multi-role fake. Fix both when a recorded demo gateway is promoted to `src/`.
- **P2.8 Langfuse export** (Tier-3): a projection subscriber off the event log (rule #2 — never the gateway write path), scrub-via-the-built `createEmitBoundary` seam.
- **Demo post-integration follow-ups** (RunHealth→frozen contract / lineage onSelect / SSE connection-drop / chart mean-series): fold into PD.6/PD.7 briefs.
- _(Cross-track items — `candidate.rejected` emitter, retrieval-FETCH wiring, gen-level crash drain — are lead-owned cross-track, not phase-d's to triage; reconciled at the phase-end merge.)_

## Next session target

**PD.4 — operator-driven fallback-ladder controller** (low-cap live → prepared run → labeled replay; manual stage timing; demo-cap-override only LOWERS within validated maxima — §17). Files: `apps/api/runtime/demo/fallback-ladder.ts` + `demo-cap-override.ts` (NEW). Fold in carry-forward (a) [live rung] + (b) [multi-fixture]. Then PD.5 → PD.6 → PD.7 → PD.8 → `/phase-exit PD` → the cody merge (user-gated).

## Operating notes for a successor orchestrator

- **CWD wrinkle**: phase-d sessions inherit `cwd=Capstone-kernel` (the spawner's), NOT the `Capstone-phased` worktree. Force `cd /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/api` + absolute paths + a `git -C .../Capstone-phased branch --show-current`==`phase-d` gate before any edit/commit (memory lesson "Spawned teammates inherit lead cwd").
- **spec-lint gotcha**: the brief gate reads `§NN` as ARCHITECTURE anchors → write lesson refs as `LESSON NN`, never `§NN`, or the lint fails.
- **Shared worktree**: orch + impl share `Capstone-phased`; sequence commits (impl `/session-end` session-doc commit, THEN orch `/orchestrate-end` round commit + the single push). `.md` is prettier-ignored (no /preflight interference).
- **cody merge is DEFERRED** to phase completion (after PD.8) + USER sign-off — push phase-d→origin ONLY; route plan/arch edits to phase-d's copies (reconciled at the merge), not cody.
