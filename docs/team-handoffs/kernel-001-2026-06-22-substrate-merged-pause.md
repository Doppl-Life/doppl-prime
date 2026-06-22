# Team Handoff kernel-001 — P3 substrate merged; pause before the sv5 amendment + P3.10

**Date:** 2026-06-22
**Track:** kernel (phases P1, P2, P3)
**Worktree:** `../Capstone-kernel` (branch `track/kernel`) — **left in place** (track is pausing, not done)
**Predecessor handoff:** first kernel handoff
**Successor handoff:** _(filled when next /team-end runs)_
**Round-seal commit at handoff:** `ee8b3d6` (track/kernel); integration merge `671890b` + reconcile `8de6bbd` (cody)

## Why this handoff exists
Lead-cycle: lead at 71% context + user requested pause to restart the lead fresh. Both teammates already shut down at ACTION (impl 75%) after the substrate round seal.

## Team composition at close
- Lead: this session (track `kernel`)
- Orchestrator: `kernel-runtime-orchestrator` — shut down; last work = substrate round-seal `ee8b3d6` + kernel-026 brief authored (held)
- Implementer: `kernel-runtime-implementer` (area `apps/api`) — shut down; last work = `/session-end` doc `kernel-006` (`47d8035`)
- Both closed at round-seal `ee8b3d6`.

## Active arc + where it landed
Phase 3 (runtime kernel). **Deterministic substrate COMPLETE + merged to cody** (`8de6bbd`): P3.1 boot, P3.2 four state machines, P3.4 caps+kill, P3.5 energy ledger, P3.6 seeded RNG, P3.9 seed-set+clamp. P3.3/P3.7/P3.8 satisfied-by-gateway/P1.3 (ticked). Preflight CLEAR (305 unit; integration unaffected — substrate is pure runtime). Two frozen-contract amendments already landed earlier in cody: GenerationStatus+`degraded`, CandidateStatus+`repairing`, schemaVersion→4 (kernel-020 reconciliation after the cross-track P0.16 collision).

## In-flight at close
**None — clean close.** kernel-026 (the sv4→5 terminal-event amendment) was authored + dispatched, then HELD/reverted (decouple decision — it's the NEXT round's first slice, not this one); its RED design was captured by the orch (ledger §H). Tree clean, suite green at seal.

## Carry-forward to next team session (the next round, in order)
1. **kernel-026 — sv4→5 terminal-event amendment** (FIRST slice). Add 4 events to `RunEventType` (37→41): `run.cancelled`, `generation.skipped`, `agenome.failed`, `candidate.rejected`; `CURRENT_SCHEMA_VERSION` 4→5; killSwitch null→event flip (run.cancelled/generation.skipped); re-record member-set snapshot + fixtures. **candidate.rejected = registry-add only, DEFINED-BUT-NOT-YET-EMITTED for MVP** — emission is the RUNTIME's on a SELECTION verdict (P3↔P5 seam), NOT verifier (verifier is evidence-only rule #6 + retired). All user-ratified (4 events). **announce-before-merge already done** (sv5 relayed to verifier/selection/demo; verifier blessed candidate.rejected registry-add). After it's green → lead merges to cody (sv5) + propagates.
2. **P3.10 — generation loop** (the big slice). Carries every banked carry-forward: drain-then-terminalize · kill is a LATCHING halt (armed through the drain) · scrub-fix `git merge cody` (pull the verifier P0.2 fix for energy.spent ProviderMeta — do NOT write a divergent scrub, L21) + scrub→append→read round-trip assertion · cost-map→AppConfig wiring · agenome.failed emission · operation-start markers (generation.verifying/scoring/reproducing) + tool_call.started/finished relay.
3. Then **P3.11** terminal classification, **P3.12** in-process worker (SOLO), **P3.13** crash-forward (SOLO). Then `/phase-exit P2` (P2.3/P2.8 — see cross-track) + `/phase-exit P3` close the kernel track.

## Cross-track state (lead-managed)
- **Demo `packages/observability` → cody merge** is queued at the demo track's cadence (possibly early/standalone — it's schemaVersion-independent) → unblocks kernel **P2.3** (satisfied-by P1.2 + demo P6.5) + **P2.8** (Langfuse — kernel does a small gateway-wireup consuming the demo seam, never reimplementing). Demo lead will ping when merged. Non-urgent.
- **Verifier track complete + retired** (P4 in cody). **announce-before-merge protocol ADOPTED** (user) — `docs/runbooks/cross-track-contract-coordination.md`. sv5 is the active cross-track contract; demo/selection re-record member-set snapshots on next pull (additive, consume-only).
- **Lesson numbering:** verifier owns §37–46, kernel §47–50 (renumbered at the substrate merge). Future kernel lessons start at §51.

## Open decisions / blockers for the human
**None pending.** All freeze-amendments ratified (degraded/repairing/the 4 terminal events); candidate.rejected emission-ownership resolved (runtime, deferred); kill-switch §5/§3 reconciliation resolved; PG harness = testcontainers; Postgres-as-log + Neo4j-as-deferred-Layer-2 confirmed.

## Spawn prompts ready for the next team session

**Orchestrator** (`Agent` name `kernel-runtime-orchestrator`, team_name `kernel`, subagent_type `general-purpose`):
```
You are kernel-runtime-orchestrator on the Doppl agent team.
Track: kernel. Team label: kernel. Worktree: /Users/dreddy/Documents/GauntletAI/Capstone-kernel (branch track/kernel) — operate here; commits land on this branch only. Route shared-root-doc edits (IMPLEMENTATION_PLAN.md / ARCHITECTURE.md) to the integration checkout (cody). Ignore peer DMs without the kernel- prefix.
Reconstruct from the SHARED TASK LIST + the kernel-003 routing ledger (§G/§H) + session docs kernel-005/006 + LESSONS §47–50 + git log on track/kernel.
FIRST DISPATCH = kernel-026 (sv4→5 terminal-event amendment) — brief already authored/committed in ee8b3d6; the impl captured its RED design. Add 4 events (run.cancelled/generation.skipped/agenome.failed/candidate.rejected), RunEventType 37→41, CURRENT_SCHEMA_VERSION 4→5, killSwitch null→event flip, re-record snapshots. candidate.rejected = registry-add only (emission deferred to runtime↔selection seam — NOT verifier). announce-before-merge already done by the lead. After it's green, flag the lead for the cody merge (sv5). THEN P3.10 generation loop (pull verifier scrub fix via git merge cody at a clean boundary; all banked carry-forwards in ledger §H).
FIRST ACTION: ~/.claude/scripts/team-register.sh "kernel-runtime-orchestrator" orchestrator "kernel" "" "kernel" "track/kernel"
Then run /orchestrate-start. NOT /session-start. Confirm: start command + registry entry written.
```

**Implementer** (`Agent` name `kernel-runtime-implementer`, team_name `kernel`, subagent_type `general-purpose`):
```
You are kernel-runtime-implementer on the Doppl agent team.
Track: kernel. Team label: kernel. Working directory: /Users/dreddy/Documents/GauntletAI/Capstone-kernel/apps/api/ — commits land on track/kernel only. Talk only to kernel-runtime-orchestrator; ignore other-prefix peer DMs.
Activated because: kernel P3 substrate is done + merged (cody 8de6bbd); next is kernel-026 (sv4→5 terminal-event amendment) then P3.10 generation loop. The orch dispatches via task + one-line wake; don't start until it does.
FIRST ACTION: ~/.claude/scripts/team-register.sh "kernel-runtime-implementer" implementer "kernel" "api" "kernel" "track/kernel"
Then run /session-start. NOT /orchestrate-start. Confirm: start command + registry entry written.
```

## How to resume
Next team session: lead runs `/team-start kernel`, reads this handoff + `IMPLEMENTATION_PLAN.md` "Currently in progress", spawns the two teammates with the prompts above, verifies read-backs. This doc IS the orient.
