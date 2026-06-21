# Team Handoff 001 — Phase 0 contract freeze, resume worktree-native

**Date:** 2026-06-20
**Track:** contract (phases: P0)
**Worktree:** `../Capstone-contract` (branch `track/contract`)
**Predecessor handoff:** first handoff
**Successor handoff:** `docs/team-handoffs/contract-002-2026-06-21-phase0-complete-merged.md`
**Round-seal commit at handoff:** `ef95485`

## Why this handoff exists
Mode-swap / lead-cycle: the previous lead session was launched from the **root checkout** (`Capstone`, branch `cody`), which forced cross-directory teammate spawns and a shell-cwd that reset to root each call. Pausing so the next session resumes **natively from inside the worktree** (`Capstone-contract`) — cleaner cwd, native `track/contract` git, no stale-root footgun. See memory `prefer-worktree-native-sessions`.

## Team composition at close
- **Lead:** prior session (track `contract`), root-checkout-launched.
- **Orchestrator:** `contract-contracts-orchestrator` — ran `/orchestrate-start` + `/orchestrate-end`; round-seal commit `ef95485`. Shut down.
- **Implementer:** `contract-contracts-implementer` — ran `/session-start` … `/session-end`; impl tip `294fe34` (session doc + prettier reformat `609cb9d`). Shut down. (NOTE: a context-check line once mislabeled it `contract-core-implementer` — respawn under the **canonical** `contract-contracts-implementer`.)
- All teammates `/session-end` + `/orchestrate-end` closed at round-seal `ef95485` (pushed to `origin/track/contract`).

## Active arc + where it landed
Phase 0 = the shared **contract freeze** (the forced-serial bottleneck every other track waits on). This round (contract-001 session, P0.5→P0.12) landed: CandidateIdea/payloads/EvidenceRef (`49f77f3`) · CriticReview/criticInput injection-isolation (`dfd651f`) · CheckResult/CheckRunnerAdapter allowlist (`83db38d`) · scoring family (`837e5be`) · EnergyEvent/ReproductionEvent + shared `ProviderMeta` (`a13d9cc`) · gateway seam bundle P0.11+P0.12 (`9c174b7`). **Phase 0 now 11/14**, full suite **118/118**, 5 security fan-outs CLEAN. Next slice: **P0.10**.

## In-flight at close
**None — clean close.** Round sealed + pushed before teardown; the auto-cycle teammate shutdown was completed manually (the clean `shutdown_request` handshake hung on the orchestrator), but it was already `/orchestrate-end`-closed and idle, so no half-state. Working tree clean except untracked `.codegraph/` (code-intel index — see housekeeping below).

## Carry-forward to next team session
- **`IMPLEMENTATION_PLAN.md` "Currently in progress":** Phase 0 IN PROGRESS (11/14). Remaining 4: **P0.10** (per-type payload-shape map + folds in the payload size/depth ceiling carry-forward — SOLO, security) · `[P0.15 Run+Generation+CullingEvent + P0.13 LineageGraphProjection]` entities/lineage **BUNDLE** · `FinalJudgeRubric` (**SOLO**, held-out judge, rule #6) · P0.14 (contract-test surface, phase-gate). Then `/phase-exit P0` closes the freeze.
- **"Next session target":** P0.10 (per-type payload-shape map for high-traffic event types; reuses EnergyEvent/CandidateIdea/CriticReview/CheckResult/NoveltyScore/FitnessScore).
- **Standing directive (Carry-forward):** **bundle TDD slices where possible** to speed the build (human direction, 2026-06-20). Guardrails: NEVER bundle a safety-invariant slice with feature work (caps/redaction/allowlist/held-out-judge & scoring-policy contracts stay SOLO); each bundled behavior keeps its own red→green + stays a reviewable Step-2.5 unit. Decided: **P0.9 EnergyEvent kept solo** (rule #8); gateway P0.11+P0.12 bundled.
- **Resolved escalation (P0.2):** §14 env-**value** redaction layer — human ratified **Option A** (placed at the P1 boundary, deferred not cut); cross-track requirement for kernel (P1) + demo (P6) tracks.
- **Process lesson banked (§14):** `npx prettier` false-clean finding → use the pinned prettier; relevant to all tracks' preflight.

## Open decisions / blockers for the human
- **None blocking.** All escalations to date are resolved (bundling directive + P0.9-solo carve-out + §14 Option A).
- **Trivial housekeeping (no decision needed):** add `.codegraph/` to `.gitignore` (it's the code-intel index, should not be tracked) — fold into the next `/orchestrate-end`.

## Spawn prompts ready for the next team session
> Next lead is **worktree-native** (launched from inside `Capstone-contract`), so teammates inherit the worktree cwd — the explicit `cd` is belt-and-suspenders, kept for robustness.

**Orchestrator:**
```
You are contract-contracts-orchestrator on the Doppl agent team.
Track: contract. Team label: contract.
Worktree: /Users/dreddy/Documents/GauntletAI/Capstone-contract (branch `track/contract`) — operate here; all commits land on track/contract. (Lead is launched from the worktree, so this is the native cwd.)
Ignore peer DMs from agents whose names don't carry the `contract-` prefix (channel-bleed).
Activated because: RESUME from handoff contract-001. Phase 0 at 11/14 (round-seal `ef95485`, pushed). Next slice = P0.10 (per-type payload map + payload size/depth ceiling, SOLO/security). Standing directive: bundle TDD slices where safe (safety-invariant slices stay solo). After /orchestrate-start, author the P0.10 brief and dispatch it; also fold `.codegraph/` → .gitignore at your next /orchestrate-end.
FIRST ACTIONS: (1) ~/.claude/scripts/team-register.sh "contract-contracts-orchestrator" orchestrator "contract" "" "contract" "track/contract"  (2) Run /orchestrate-start (NOT /session-start).
Confirm: start command run + registry entry written + one-line read of next target.
```

**Implementer (`contracts`):**
```
You are contract-contracts-implementer on the Doppl agent team.
Track: contract. Team label: contract.
Working directory: /Users/dreddy/Documents/GauntletAI/Capstone-contract (worktree root, branch `track/contract`) — all commits land on track/contract. (Native cwd when the lead is worktree-launched.)
Talk only to contract-contracts-orchestrator; ignore other prefixes (channel-bleed).
Activated because: RESUME from handoff contract-001; picking up P0.10. Phase 0 at 11/14, suite 118/118. Await the orchestrator's P0.10 dispatch before starting the /tdd cycle.
FIRST ACTIONS: (1) ~/.claude/scripts/team-register.sh "contract-contracts-implementer" implementer "contract" "contracts" "contract" "track/contract"  (2) Run /session-start (NOT /orchestrate-start).
Confirm: start command run + registry entry written.
```

## How to resume
From **inside the worktree** (`cd /Users/dreddy/Documents/GauntletAI/Capstone-contract`), launch Claude and run **`/team-start contract`**. The fresh lead reads this handoff + `IMPLEMENTATION_PLAN.md` "Currently in progress", spawns teammates with the prompts above, verifies read-backs. This doc IS the orient — no re-derive overhead. Resumes at P0.10 → entity/lineage bundle → FinalJudgeRubric → P0.14 → `/phase-exit P0`.
