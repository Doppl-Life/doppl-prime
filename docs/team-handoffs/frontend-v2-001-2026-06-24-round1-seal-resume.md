# Team Handoff frontend-v2-001 — Round 1 seal; resume FB.3 → FB.4 → FV.3+

**Date:** 2026-06-24
**Track:** frontend-v2
**Worktree:** `../Capstone-frontend-v2` (branch `track/frontend-v2`) — persists across this cycle; the fresh team works HERE.
**Predecessor handoff:** `docs/team-handoffs/phase-d-002-2026-06-24-phase-d-complete-frontend-v2-handoff.md`
**Successor handoff:** _(filled in when the next /team-end runs)_
**Round-seal commit at handoff:** `61c4754`

## Why this handoff exists
Round-boundary **cycle for fresh context** (NOT an end-of-day pause) — the delicate safety-invariant slices FB.3 (security INVARIANT) + FB.4 (SOLO rule-#6 dial proof) are best authored + reviewed by a fresh full-context orchestrator. User-approved. A fresh team is spawned immediately after this doc.

## Team composition at close (round 1)
- Lead: this session (`frontend-v2-team-lead`, `d4a8eddb`) — **persists** across the cycle.
- Orchestrator: `frontend-v2-orchestrator` (`dbe704f2`) — `/orchestrate-end`-closed; round terminal `61c4754`. Shut down at cycle.
- Implementer (api): `frontend-v2-api-implementer` (`0b5b29f2`) — `/session-end`-closed; last `a6104fa` (FB.2). Shut down at cycle.
- Implementer (web): `frontend-v2-web-implementer` (`bcb99f55`) — `/session-end`-closed; last `8e6400d` (FV.4). Shut down at cycle.

## Active arc + where it landed
Phase FB (backend run-controls + deep telemetry) + Phase FV (web app shell + DS screens). **Round 1 landed 7 feature commits** (fork = cody `5633888`):
- Backend: FB.0 `4bd2b4d` (RunConfig run-controls amendment, schemaVersion 5→6) · FB.1 `a99a92e` (ollama adapter + provider-dispatch) · FB.2 `a6104fa` (per-run modelRouteOverride clamped to a frozen allowlist — **judge EXCLUDED, rule #6**). All security-reviewer INVARIANT CLEAN.
- Web: FV.0 `9a6be17` (DS components → production `.tsx` `ds/`) · FV.1 `0c670d9` (app shell + router) · FV.2 `5ee233b` (S0 Runs Home) · FV.4 `8e6400d` (S2 Organism 3-pane shell). Zero contract change.
- Suites green at seal: contracts 194 · api 686 + 185 · web 256.

**Next planned slices:** FB.3 (mutagen operators) → FB.4 (dial proof, SOLO) → FB.5 (`/phase-exit FB`-prep) → FB.6/7/8 (deep telemetry); web FV.3 (Launcher — wires FB) → FV.5 (node-inspector) → FV.6/7/8/9.

## In-flight at close
**None — clean close.** FB.3 was dispatched then cleanly unwound (no commit; test files reverted); its brief `frontend-v2-008` (`@64ee91d5`) + the validated Step-2.5 rule-#5 design are on disk for the fresh team. FB.3 task deleted so it can't be auto-reclaimed.

## Carry-forward to the fresh team (resume queue)
- **FB.3 (mutagen operators)** — brief `frontend-v2-008` on disk. **rule-#5 design is RATIFIED by BOTH lead AND user (2026-06-24):** operators are a CLOSED 7-member enum (breakthrough · first-principles · polymath · breakout · blindside · subtraction · constraint) selected by the operator → mapped to SYSTEM-AUTHORED vetted prompt fragments = TRUSTED system framing (no untrusted free-text → no injection vector). The per-run **problem** stays isolated as untrusted DATA (PD.10 `wrapUntrusted`, unchanged). Rule #5 holds. Build FB.3 on this; security-reviewer INVARIANT verifies the pin. **No further user ratification needed — proceed.**
- **FB.4 (diverge/converge dial)** — the **SOLO safety-invariant** slice; never bundle. The dial biases GENERATION only; the **invariant test asserts the held-out judge rubric + scoring policy are byte-identical** for dial=diverge vs dial=converge (rule #6 anchor unmoved). security-reviewer INVARIANT. Research weekly-limit was hit round 1 (resets midnight America/Chicago — likely reset by now).
- **FB.5–FB.8** — `/phase-exit FB`-prep; then deep telemetry: FB.6 (raw reasoning/response capture — SECRET-SURFACE slice, redaction scrub before append rule #4, 1 MiB ceiling truncate-with-marker, replay-reads rule #7), FB.7 (tool-call detail query+results), FB.8 (judge per-axis rationale — safe re rule #6).
- **FV.3 (Launcher)** — wires the FB controls (operators, dial, model-select incl. the FB.2 permitted-models read route); depends on FB.0–FB.4.
- **FV.5 (node-inspector)** — surfaces FB.6/7/8 telemetry; **FV.6/7/8/9** (ticker+roster, Final Idea, replay scrubber, `/phase-exit FV`).
- Full detail: `IMPLEMENTATION_PLAN.md` "Currently in progress" + Carry-forward "FRESH-TEAM RESUME"; plan doc `docs/planning/frontend-v2-phase-plan.md`.

## Open decisions / blockers for the human
- **None blocking.** Two ratified findings carried to the eventual **FB→cody merge** (NOT this round): FB.0 schemaVersion amendment → announce-before-merge protocol; FB.2 rule-#6 judge-exclusion (operators tune the generation model, never the judge). Both already lead-ratified.

## Spawn prompts ready for the fresh team
**Orchestrator (`frontend-v2-orchestrator`):**
```
You are frontend-v2-orchestrator on the Doppl agent team (round 2).
Track: frontend-v2. Team label: frontend-v2. Worktree: /Users/dreddy/Documents/GauntletAI/Capstone-frontend-v2 (branch track/frontend-v2). Operate here; commits land on this branch, never the root checkout/another worktree.
⚠️ CWD GATE (spawned from the lead's session in a DIFFERENT worktree): FIRST run `cd /Users/dreddy/Documents/GauntletAI/Capstone-frontend-v2 && git branch --show-current` — MUST print track/frontend-v2; if not, STOP + tell the lead.
Route shared-root-doc edits (IMPLEMENTATION_PLAN.md/ARCHITECTURE.md) to the integration checkout /Users/dreddy/Documents/GauntletAI/Capstone (cody). Ignore peer DMs without the frontend-v2- prefix.
Activated because: round-1 sealed (61c4754) for fresh context; resume Phase FB/FV. Read docs/team-handoffs/frontend-v2-001-2026-06-24-round1-seal-resume.md (this doc) + IMPLEMENTATION_PLAN Currently-in-progress. Dispatch in parallel: FB.3 (api-impl — brief frontend-v2-008 ON DISK, rule-#5 design lead+USER-ratified, build on it) + the next web slice (FV.5 or FV.6 — FV.3 needs FB.0-4 first). FB.4 is the SOLO rule-#6 dial slice (never bundle; security-reviewer INVARIANT). FB.0 announce-before-merge + FB.2 rule-#6 finding carried for the eventual FB→cody merge.
FIRST ACTION (after the CWD GATE) — register: ~/.claude/scripts/team-register.sh "frontend-v2-orchestrator" orchestrator "frontend-v2" "" "frontend-v2" "track/frontend-v2"
Then run /orchestrate-start (NOT /session-start). Confirm: (1) CWD gate branch, (2) start command, (3) registry entry exists.
```

**Implementer (api — `frontend-v2-api-implementer`):**
```
You are frontend-v2-api-implementer on the Doppl agent team (round 2).
Track: frontend-v2. Team label: frontend-v2. Working directory: /Users/dreddy/Documents/GauntletAI/Capstone-frontend-v2/apps/api. Commits land on track/frontend-v2 only.
⚠️ CWD GATE (spawned from the lead's session in a DIFFERENT worktree): FIRST run `cd /Users/dreddy/Documents/GauntletAI/Capstone-frontend-v2/apps/api && git branch --show-current` — MUST print track/frontend-v2; if not, STOP + tell the lead.
Talk only to frontend-v2-orchestrator; ignore peer DMs without the frontend-v2- prefix.
Activated because: round-2 resume of Phase FB. First slice = FB.3 (mutagen operators) — brief frontend-v2-008 ON DISK; the rule-#5 trusted-framing design is lead+USER-RATIFIED (closed 7-enum → system-authored vetted TRUSTED fragments; problem stays untrusted PD.10 DATA). Then FB.4 (SOLO rule-#6 dial proof) → FB.5 → FB.6/7/8 telemetry. Wait for the orchestrator's FB.3 dispatch.
FIRST ACTION (after the CWD GATE) — register: ~/.claude/scripts/team-register.sh "frontend-v2-api-implementer" implementer "frontend-v2" "api" "frontend-v2" "track/frontend-v2"
Then run /session-start (NOT /orchestrate-start). Confirm: (1) CWD gate branch, (2) start command, (3) registry entry exists.
```

**Implementer (web — `frontend-v2-web-implementer`):**
```
You are frontend-v2-web-implementer on the Doppl agent team (round 2).
Track: frontend-v2. Team label: frontend-v2. Working directory: /Users/dreddy/Documents/GauntletAI/Capstone-frontend-v2/apps/web. Commits land on track/frontend-v2 only.
⚠️ CWD GATE (spawned from the lead's session in a DIFFERENT worktree): FIRST run `cd /Users/dreddy/Documents/GauntletAI/Capstone-frontend-v2/apps/web && git branch --show-current` — MUST print track/frontend-v2; if not, STOP + tell the lead.
Talk only to frontend-v2-orchestrator; ignore peer DMs without the frontend-v2- prefix.
Activated because: round-2 resume of Phase FV. FV.0/1/2/4 done (DS port · shell+router · S0 Runs Home · S2 Organism 3-pane). Next backend-INDEPENDENT slices: FV.5 (node-click inspector — will surface FB.6/7/8 telemetry once built) · FV.6 (ticker+roster) · FV.7 (Final Idea) · FV.8 (replay scrubber). FV.3 (Launcher) waits on FB.0-4. Reuse the tested data layer; implement DS screens, don't redesign; use the doppl-design skill. Wait for the orchestrator's dispatch.
FIRST ACTION (after the CWD GATE) — register: ~/.claude/scripts/team-register.sh "frontend-v2-web-implementer" implementer "frontend-v2" "web" "frontend-v2" "track/frontend-v2"
Then run /session-start (NOT /orchestrate-start). Confirm: (1) CWD gate branch, (2) start command, (3) registry entry exists.
```

## How to resume
The lead is spawning the fresh team from the prompts above immediately (user-approved continue-now). If instead resuming LATER: lead runs `/team-start frontend-v2`, reads this doc + `IMPLEMENTATION_PLAN.md` "Currently in progress", spawns from the prompts above, verifies read-backs. This doc IS the orient — no re-derivation.
