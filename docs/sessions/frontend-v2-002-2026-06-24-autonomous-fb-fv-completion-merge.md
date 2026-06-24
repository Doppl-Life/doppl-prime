# Session frontend-v2-002 — autonomous completion of Phase FB + FV, phase-exits, and the frontend-v2→cody merge

**Date:** 2026-06-24
**Phase:** frontend-v2 (Phase FB backend run-controls/telemetry + Phase FV web rebuild) → integration merge to cody
**Mode:** single-operator **autonomous direct-drive** (no separate orchestrator/implementer team — see Decisions)
**Predecessor:** `docs/team-handoffs/frontend-v2-001-2026-06-24-round1-seal-resume.md` (round-1 seal `61c4754`)
**Successor:** _(filled in by the next session)_

## Why this session existed
Resume after a host-session restart cleared an EPERM filesystem lockout. The standing autonomous mandate: push the overnight backlog, finish the code-complete scoring/culling fix, then carry the frontend-v2 build to completion (finish the in-flight FB.4, the remaining FB/FV slices, both phase-exits, and the frontend-v2→cody merge) while the user was away — deciding surfaced questions architecturally-correct, with full push/merge authority.

## What was built

### Backend — Phase FB (apps/api + packages/contracts)
**Files created**
- `apps/api/src/runtime/loop/generationBias.ts` — FB.4 diverge/converge dial: `BIAS_FRAGMENTS` (5 bands), pure `composeBiasFraming` + `biasToTemperature` (`clamp(0.7+0.3·bias,[0.4,1.2])`).
- `packages/contracts/test/__schema-snapshots__/fb8-judge-rationale.test.ts` — the FB.8 sv8→9 amendment + rule-#6 byte-identical guard.

**Files modified**
- `packages/contracts/src/gateway/sampling-params.ts` (FB.4 WIP, prior session) + `gateway-request.ts`/`domain/llm-call-telemetry.ts` (+`samplingParams`), `version.ts` (sv→9), `verifier/judge-result.ts` (+`axisRationales`), `__schema-snapshots__/field-sets.ts` (+JudgeResult `axisRationales`), `src/test-fixtures/index.ts` (+rationale fixture) + the version-pin tests (field-sets/envelope/fixtures-valid/fb4).
- `apps/api/src/runtime/loop/generationLoop.ts` — FB.4 (bias framing + temperature on the `population_generator` request only; record executed `samplingParams` into `llm_call_telemetry`) + FB.7 (relay actual `query`/`result` into `tool_call.started`/`.finished`, truncated-with-marker + scrubbed via the existing seams).
- `apps/api/src/boot/composeRuntime.ts` — `mergePerRunConfig` threads `generationBias`.
- `apps/api/src/model-gateway/adapters/openrouter.adapter.ts` — thread the dial's `temperature` to the provider call.
- `apps/api/src/verifier/judge/judge-call.ts` — FB.8: `JudgeModelOutput` +optional `rationales`, the instruction asks for a per-axis rationale, `runJudge` attaches `axisRationales` only when all 5 present (acceptance stays runner-computed).
- Tests: `generationBias.test.ts` (new), `generationLoop.test.ts` (FB.4 + FB.7 blocks), `composeRuntime.test.ts` (FB.4), `run-judge.test.ts` (FB.8).
- `apps/api/package.json` — **env-fix**: `start`/`dev` → `tsx --env-file-if-exists=../../.env src/main.ts` (auto-load the root `.env`).

### Frontend — Phase FV (apps/web)
**Files created**
- `apps/web/src/routes/S1LauncherScreen.tsx` (FV.3) — the dedicated launcher: prompt-source picker (`getProblemSets`) + the FB-equipped `RunConfigPanel`.
- `apps/web/src/panels/nodeTelemetry.ts` (FV.5b) — pure selectors `deriveAgenomeTelemetry` (FB.6 raw + FB.4 temp + FB.7 tool-calls) + `deriveJudgeRationale` (FB.8).
- Tests: `routes/S1LauncherScreen.test.tsx`, `panels/nodeTelemetry.test.ts`.

**Files modified**
- `apps/web/src/components/run/runConfigForm.ts` + `RunConfigPanel.tsx` — FV.3 FB controls (operator multi-select + diverge/converge dial), threaded additively into `RunConfig`.
- `apps/web/src/app/routes.tsx` — repoint `/launch` → `S1LauncherScreen`.
- `apps/web/src/data/contracts.ts` — barrel +`GenerationOperator`, `JudgeResult`, `LlmCallTelemetry`.
- `apps/web/src/components/run/NodeInspectorContent.tsx` — FV.5b render (raw-capture, tool-call timeline, judge rationale).
- Tests: `runConfigForm.test.ts`, `RunConfigPanel.test.tsx`, `app/router.test.tsx` (retargeted for the S1 `/launch`), `NodeInspectorContent.test.tsx`.

### Cross-area
- **Scoring + culling fix** (code-complete from the prior session) verified + committed: cody `ecc28cd`, phase-d `89a394b`.
- **Merge frontend-v2 → cody**: `52d5e78` (145 files; 5-file apps/api conflict surface — 3 auto-merged, 2 hand-resolved).
- Doc routing (done hot, single-operator — see Cross-doc audit): `ARCHITECTURE.md` (§4 sv→9 + §5 FB.3/FB.4 notes + §13 FV notes), `apps/api/CLAUDE.md` + `LESSONS.md` (§104–108), `apps/web/CLAUDE.md` + `LESSONS.md` (§23–24), `IMPLEMENTATION_PLAN.md`.

## Decisions made
1. **Direct-drive instead of re-spawning the multi-session team.** Empirically verified an Agent-tool subagent shares the lead's session id + cwd → it cannot team-register distinctly, is invisible to `/context-check`, and starts in the wrong worktree. The persistent team needs separate host Claude-Code sessions (a tmux spawner unavailable from one session). So I drove every slice directly with `/tdd` discipline + short-lived reviewer/auditor subagents for the safety gates — same outcomes, a path a dead pane can't stall.
2. **FB.4 mid-slice reconciliation.** The interrupted slice left contracts done+green but the api impl *not started* (only RED tests) — a clean RED, no corruption. Wrote the impl + fixed two mid-slice test gaps (a missing `buildPopulationRequest` import; an unused `composeBiasFraming` import).
3. **The dial / rationale stay rule-#6 SOLO + emit-only.** FB.4 temperature+framing reach the `population_generator` request only (structural: `assembleIsolatedRequest` has no bias field). FB.8 `axisRationales` is explanatory output; acceptance stays runner-computed. Both confirmed by security-reviewer INVARIANT CLEAN + the merge rule-#6 verifier.
4. **Merge conflict — live-gateway hybrid.** cody's embedding-role fix (`d287675`) vs fv2's FB.1 provider-dispatch were reconciled as a HYBRID: the embedding-role short-circuit runs FIRST (always → OpenAI adapter, never the chat misroute), then the FB.1 provider-dispatch map (ollama + honest-reject). Boot + the FB.2 override factory carry BOTH clients. Critical call: fv2's `openai→openRouterCall` legacy entry *was* the misroute cody fixed, so I could not take fv2's side wholesale.
5. **Env DX fix.** The app never auto-loaded `.env`; added `--env-file-if-exists=../../.env` to start/dev so `pnpm start` works without manual sourcing (shipped to cody + phase-d).
6. **Verified before pushing.** Both phase-exits run as parallel-auditor workflows; the merge result run through a 3-verifier adversarial workflow (all CLEAR) before the cody push.

## Decisions explicitly NOT made (deferred)
- **FV.3b — per-run model-selection UI** (`modelRouteOverride`): the heaviest control (partial per-role map); deferred to keep FV.3 a coherent shippable slice. The contract + form already carry the field.
- **FB.7 production tool-call wiring**: `toGenerationGateway` does not surface provider tool calls (pre-existing Phase-D deferral) → FB.7's relay (and FV.5b's tool-call timeline) are empty in production until that lands. Not a regression.
- **Live `/design-review` + `/qa`** projector-legibility/a11y browser pass: a static audit can't cover it; run against the live API.
- **Dead-code cleanup**: the interim `Dashboard.tsx` cluster (`RunListPanel`, the `demo/` panels) is orphaned after the FV route-repoint; removal deferred to an FV cleanup slice.

## TDD compliance
Honest audit — **coverage is complete (every change has tests; all suites green) and the safety-critical FB slices (FB.4/7/8) were security-reviewed INVARIANT CLEAN — but strict test-first ORDER was not uniform:**
- **Test-first (clean):** the scoring/culling fix (RED tests pre-existed), FB.4 api impl (made the prior session's RED tests green), FB.7 (RED test block written first), and the FV.3 form-logic core (`runConfigForm` RED tests first).
- **Impl-then-test (same-slice, green — TDD-ORDER deviations, not coverage gaps):** FB.8's *new-behavior* tests (the contract amendment + `runJudge` change preceded the fb8 + run-judge tests), the FV.3 `RunConfigPanel` controls + `S1LauncherScreen`, and the FV.5b `nodeTelemetry` derivation + `NodeInspectorContent` render. The tests landed in the same slice and pass; the red-green order was not followed for these (React + the judge runtime).
- No safety-critical change shipped without a test, and the rule-#6 surfaces were independently security-reviewed. The order deviations are noted as a discipline follow-up, not a blocker.

## Reachability
- **Backend FB** (reachability-auditor at FB phase-exit): 6/7 reachable from `POST /runs` (composeBiasFraming/biasToTemperature, buildPopulationRequest bias, mergePerRunConfig threading, openrouter temperature, judge axisRationales persistence). **1 unreachable:** FB.7 `ToolCallObservation.query/.result` — `toGenerationGateway` never populates `toolCalls` (pre-existing Phase-D gap; tracked open follow-up, not a regression).
- **Frontend FV** (reachability-auditor at FV phase-exit): all 4 routes + every FV component reachable from `main.tsx` (S1LauncherScreen at `/launch`, NodeInspectorContent + nodeTelemetry via the S2 node-click). One orphan cluster: the interim `Dashboard` + sub-tree (dead code, tracked).

## Open follow-ups
- **FB.7 prod wiring (Phase-D):** `toGenerationGateway` (`apps/api/src/boot/composeRuntime.ts`) must surface provider tool-call observations into `GenerateResult.toolCalls` → then FB.7 + FV.5b tool-call timeline go live.
- **FV.3b:** per-run model-selection UI (`modelRouteOverride`).
- **FV cleanup:** remove the orphaned interim `Dashboard.tsx` cluster.
- **Live `/design-review` + `/qa`** browser pass on the new launcher + inspector against the live API.
- **TDD-order discipline:** prefer strict red-green on React components + runtime changes in future slices (this session's coverage is complete but the order was uneven — see TDD compliance).
- (Step-9 routing for every slice was done hot during the session — ARCH/CLAUDE/LESSONS/PLAN all committed; no open routing items.)

## How to use what was built
- **Run the API (either branch):** `pnpm -C apps/api start` from the repo root — auto-loads `.env` now (no sourcing). Live mode: `DOPPL_GATEWAY=live pnpm -C apps/api start`.
- **The launcher** (`/launch`): pick a prepared problem or type a seed, select mutagen operators + the diverge/converge dial, Start → observe the run.
- **The inspector** (S2 node-click): an agenome node shows raw generation capture + executed temperature + tool-call detail; a candidate node shows the judge's per-axis rationale.
