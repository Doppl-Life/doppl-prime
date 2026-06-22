# Team Handoff demo-001 — round-2 cycle pause (zombie-shutdown restart)

**Date:** 2026-06-21
**Track:** demo (phases P6, P7, PD)
**Worktree:** `../Capstone-demo` (branch `track/demo`) — left in place; team is pausing, not done. Do NOT merge to cody yet.
**Predecessor handoff:** first handoff (demo track)
**Successor handoff:** _(filled in when the next /team-end runs)_
**Round-seal commit at handoff:** `e448b46` (pushed to origin/track/demo)

## Why this handoff exists
Full-team **ACTION context auto-cycle** (orch 78%, backend impl 75%) sealed round 2 and triggered a full-team cycle; during spin-down we hit an **ephemeral zombie-shutdown issue** (teammates approve shutdown but don't always show fully terminated). Pausing the team via `/team-end` so the user can hard-restart the host session (which hard-closes the zombies), then resume with a fresh `/team-start demo`.

## Team composition at close
- **Lead:** this session (track `demo`, label `demo`).
- **Orchestrator:** `demo-observability-orchestrator` — `/orchestrate-end`-closed at round-2 seal `e448b46`; shutdown_request sent (may be a zombie — hard-restart clears it).
- **Implementer (backend, `apps/api`):** `demo-observability-implementer` — `/session-end`-closed (`demo-002`, `5d4b845`); **terminated** (shutdown approved).
- **Implementer (web, `apps/web`):** `demo-web-implementer` — `/session-end`-closed (`demo-web-002`, `679a316`); **terminated** (shutdown approved).
- All teammates closed at round-2 seal `e448b46`.

## Active arc + where it landed
Demo track is building Phase 6 (projections/API/observability) + Phase 7 (React dashboard, **from the `docs/doppl-design-system` prototype**), against fixtures + the merged event store (NOT the live backend; wires at integration).
- **Round 1 (sealed `79d73b7`):** P6.1–P6.7 (projection builders + observability redaction + REST write/read) · P7.1–P7.4 (data-client, run-store, status-primitive+tokens, mode-indicator) · prototype vendored (`7c0d34c`).
- **Round 2 (sealed `e448b46`):** P6.8 (run-health endpoint) · P7.5 (operator run-config panel, cap-max fail-closed).
- **Next — Round 3:** P6.9 (SSE — **brief `demo-014` + a captured Step-2.5 design already exist, so GREEN is cheap**) · P6.10 · P6.11 (obs) · P7.6+ (web). **Continuous-roll posture** (after a round seals, the next round starts immediately — no per-round user go; the standing go covers the sequence; close-out only at context-cycle thresholds or explicit user call).

## In-flight at close
**None — clean close.** P7.5 committed; P6.9 was cleanly abandoned (just-started, no half-commit) and carries to round 3 (task re-claimed by the fresh backend impl).

## Carry-forward to next team session
- **Round-3 slices:** P6.9 / P6.10 / P6.11 (obs) · P7.6+ (web). Bundle where safe; safety-invariant slices solo; web from the prototype.
- **sv3/P0.16 reconcile — STAYS the demo→cody-merge item, NOT a track/demo slice.** cody is schemaVersion 3 (`477859b`, P0.16 `JudgeResult` + `judge.reviewed`); demo is sv2. The reconcile (add `judge.reviewed` reducer branch to current-state P6.2 + map judge into lineage P6.3 + P6.8 judge-in-flight) needs the P0.16 contracts AND the live P4/P5 judge events, all of which land at integration. Do it at/before the demo→cody merge, fixture-tested. Documented in `demo-orch-001` + `demo-orch-002` + cody Carry-forward (`d81a27e`).
- **cody tracker reconcile (lead/integration-owner, AT the demo→cody merge):** tick P6.1–P6.7 + P7.1–P7.4 (round 1) + P6.8 + P7.5 (round 2), apply round Logs + the Carry-forward DELETEs (bodyLimit / IDs-opaque / §14-env-value, all demo-consumed). **Ticks follow the merge, not the seal** (kernel precedent). Round-1/2 status is already recorded in cody `d81a27e` (Currently-in-progress + sv3 finding).
- **§14 scrub seam (RATIFIED):** `packages/observability` `scrubObservabilityPayload` + `createEmitBoundary` is the cross-track canonical, demo-owned; kernel P2.8 consumes it (accepted). Treat changes to it as cross-track Findings. (cody `97ecd90`.)
- **Minor:** a root `.DS_Store` is tracked-but-gitignored and keeps getting macOS-touched — a `git rm --cached .DS_Store` on track/demo would stop the noise. Not blocking.

## Open decisions / blockers for the human
- **Ephemeral zombie-shutdown issue** (infra, intermittent) — workaround in motion: hard-restart the host session to clear zombies, then `/team-start demo`. No code impact; round 2 is sealed + pushed.
- **Optional (design owner):** the prototype's status set diverged from the frozen contract in 3 spots (agenome `mutated` omitted, candidate `culled` added, generation domain added) — reconciled frozen-wins in the UI; aligning the prototype source is purely cosmetic and your call.
- No load-bearing architectural decision pending.

## Spawn prompts ready for the next team session

**Orchestrator** (`Agent` with `team_name: "demo"`, `name: "demo-observability-orchestrator"`, `subagent_type: "general-purpose"`):
```
You are demo-observability-orchestrator on the Doppl agent team.
Track: demo. Team label: demo. Worktree: /Users/dreddy/Documents/GauntletAI/Capstone-demo (branch `track/demo`) — operate here; all commits land on this branch, never the root checkout. Route shared-root-doc edits (IMPLEMENTATION_PLAN.md / ARCHITECTURE.md) to the integration checkout (../Capstone, branch `cody`).
Ignore peer DMs from agents whose names don't carry the `demo-` prefix (channel-bleed).
Activated because: resuming after a round-2 cycle pause (zombie-shutdown restart). Round 2 sealed `e448b46` (pushed). Round 3 = P6.9 (SSE — brief demo-014 + captured Step-2.5 design exist, GREEN cheap) + P6.10 + P6.11 (obs) · P7.6+ (web, from the docs/doppl-design-system prototype). CONTINUOUS-ROLL posture: after a round seals, start the next immediately (no per-round user go); seal only at context-cycle thresholds or explicit user call. sv3/P0.16 reconcile STAYS the demo→cody-merge item (not a track/demo slice). Read docs/sessions/demo-orch-001 + demo-orch-002 for full state.

FIRST ACTION — register:
  ~/.claude/scripts/team-register.sh "demo-observability-orchestrator" orchestrator "demo" "" "demo" "track/demo"
Then run /orchestrate-start. NOT /session-start.
Confirm in your first reply: (1) the start command you ran, (2) registry entry written.
```

**Implementer (backend, `apps/api`)** (`Agent` with `team_name: "demo"`, `name: "demo-observability-implementer"`, `subagent_type: "general-purpose"`):
```
You are demo-observability-implementer on the Doppl agent team — backend (apps/api), Phase 6.
Track: demo. Team label: demo. Working directory: /Users/dreddy/Documents/GauntletAI/Capstone-demo/apps/api/ — cd there FIRST (before registering). Commits land on branch `track/demo`, never the root checkout. You SHARE this worktree with demo-web-implementer: stage ONLY apps/api/** (+ shared root files that are YOURS, e.g. the lockfile for backend deps), never `git add -A`. Coordinate with the web impl THROUGH the orchestrator, never impl↔impl.
Activated because: resuming after a round-2 cycle pause. Round 3 backend = P6.9 (SSE, brief demo-014 + captured Step-2.5) then P6.10/P6.11. Await the orchestrator's dispatch.
FIRST ACTION — cd + register:
  cd /Users/dreddy/Documents/GauntletAI/Capstone-demo/apps/api && ~/.claude/scripts/team-register.sh "demo-observability-implementer" implementer "demo" "apps/api" "demo" "track/demo"
Then run /session-start. NOT /orchestrate-start.
Confirm in your first reply: (1) the start command you ran, (2) registry entry written.
```

**Implementer (web, `apps/web`)** (`Agent` with `team_name: "demo"`, `name: "demo-web-implementer"`, `subagent_type: "general-purpose"`):
```
You are demo-web-implementer on the Doppl agent team — frontend (apps/web), Phase 7, built FROM the docs/doppl-design-system prototype + fixture projections + frozen LineageGraphProjection + the §11 REST/SSE shape (NOT the live backend; wires at integration).
Track: demo. Team label: demo. Working directory: /Users/dreddy/Documents/GauntletAI/Capstone-demo/apps/web/ — cd there FIRST (before registering). Commits land on branch `track/demo`, never the root checkout. You SHARE this worktree with demo-observability-implementer: stage ONLY apps/web/**, never `git add -A`, never touch apps/api/**. Coordinate THROUGH the orchestrator, never impl↔impl.
Activated because: resuming after a round-2 cycle pause. Round 3 web = P7.6+ (prototype-based). Await the orchestrator's dispatch.
FIRST ACTION — cd + register:
  cd /Users/dreddy/Documents/GauntletAI/Capstone-demo/apps/web && ~/.claude/scripts/team-register.sh "demo-web-implementer" implementer "demo" "apps/web" "demo" "track/demo"
Then run /session-start. NOT /orchestrate-start.
Confirm in your first reply: (1) the start command you ran, (2) registry entry written.
```

## How to resume
Next team session: lead runs `/team-start demo`, reads this handoff doc + `docs/sessions/demo-orch-002` (most recent) + cody's plan state (`d81a27e`) on demand, spawns the three teammates using the prompts above, verifies read-backs. Round 3 then rolls continuously. (Note: track/demo's own `IMPLEMENTATION_PLAN.md` Currently-in-progress is fork-state — the real demo round state lives in cody's plan + the `demo-orch-001/002` session docs.)
