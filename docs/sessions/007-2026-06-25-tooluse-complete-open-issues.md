# Session 007 — Tool-use (#4) COMPLETE + live-validated; open run/graph issues for next session

**Date:** 2026-06-25 · **Branch:** `cody` (ALL work here; user runs the demo from cody) · **NOT pushed** (push only on user OK).

> **READ-FIRST on resume.** The #4 agent-tool-use epic is DONE, committed to cody, and live-validated (the agent
> made 3 real tool calls — web_search + x_search + youtube_search — and produced a grounded idea citing real
> URLs). A subsequent full LIVE run by the user surfaced NEW issues unrelated-or-adjacent to tool-use:
> a run failure, no culling / no mutation (only fusion), two check-runner skips, and a still-messy lineage graph.
> Those are the NEXT work. Details + root-cause leads below.

---

## A. What landed this session — #4 tool-use (8 slices), all on cody

Agents now do their OWN research (web + X + YouTube) to generate ideas. Option A (gateway-orchestrated, NO new keys —
everything via the existing OpenRouter key). Commits (oldest→newest):

| commit | slice |
|---|---|
| `464df38` | fix(test): reproduce-seam concurrent-offspring flake (pre-existing, found via preflight) |
| `47a48b7` | Slice 1 — contract **sv9→10**: ToolName/ToolDescriptor/ToolCallRequest + gateway `tools?`/`toolCallRequests?` |
| `47a3fe6` | Slice 2 — SOLO rule #1: **maxToolCalls kernel-enforced** in the loop (inline reserve-gate + detectKill fold). reviewed CLEAR |
| `afa1ca3` | Slice 3 — tool registry + web_search/fetch_url executors + **SSRF guard**. reviewed (2 high/3 med/1 low → fixed/escalated) |
| `f12e47a` | Slice 4 — OpenRouter adapter tool-calling (emit tools, parse tool_calls, discipline short-circuit) |
| `e1e89f4` | Slice 5a — multi-turn message variants + shared adapter translation |
| `87eac74` | Slice 5b-1 — **tool-orchestrating GenerationGateway** (multi-turn loop, wrapUntrusted, budget) + rule-#8 ok-gated tool energy |
| `cdb1e9e` | Slice 5b-2 — live wiring (composeRuntime) + real SSRF-hardened fetch/dns/web-search seams. reviewed (all invariants PASS) |
| `4138134` | Slice 6 — replay state-equivalence with persisted tool calls (rule #7) |
| `4cae697` | Slice 7 — x_search (Grok) + youtube_search (Gemini) |
| `f7561ae` | research nudge (system-message instruction to research before generating; rule #5/#6-safe) |
| `8e3828e` | Slice 8 — LIVE tool-use validation (gated, skipIf keyless) |
| `a3a1eaf` | Slice 8 — tools-vs-no-tools A/B eval (gated) |
| `4e094c2` | chore: drop unused eslint-disable |

**Verification at close:** contracts 212 · api 821 unit + 192 integ (8 live-gated skips) · web 319 (unchanged) · typecheck/lint/format clean. Live: 3 tool calls (web/x/youtube, all ok), grounded candidate w/ real URLs, multi-turn protocol + wrapUntrusted + schema-repair all worked.

**Architecture (where the pieces live):**
- Contract tool surface: `packages/contracts/src/gateway/tool.ts` + the `ChatMessage` union in `gateway-request.ts`.
- maxToolCalls enforcement: `apps/api/src/runtime/loop/generationLoop.ts` (`toolCallsConsumed` reserve-gate ~line 585; detectKill fold ~line 420; ok-gated tool debit ~line 629).
- Registry/executors/SSRF: `apps/api/src/model-gateway/tools/{registry.ts,ssrf.ts}`.
- Orchestrator (the multi-turn loop): `apps/api/src/boot/toolOrchestrator.ts` (`TOOL_USE_FRAMING` nudge, `TOOL_RESULT_DATA_FRAMING`).
- Real IO seams: `apps/api/src/boot/toolSeams.ts` (httpGet/resolveHostIsPublic/createGroundedSearch).
- Wiring: `composeRuntime.ts` (orchestrator iff `toolExecutorSeams` present) ← `startRun.ts` ← `main.ts` (live branch).
- Live tests: `apps/api/test/integration/demo/{live-tool-use,eval-tool-use}.test.ts` (gated).

**Security findings disposition (from the Slice-3 + Slice-5 reviews):**
- FIXED: fetch_url fails-closed unless both http+resolver wired; IPv6 compatible/NAT64 decode; deep-freeze registry; streamed body-size cap (DoS).
- **[high] ACCEPTED MVP residual (escalated):** resolve→connect TOCTOU in `createSafeHttpGet` — a rebinding DNS that answers public to the resolver + private to the socket isn't closed (common vectors ARE: literal IPs, split-horizon multi-record, redirect-follow). Proper close needs a connect-time-validating dispatcher (undici Agent w/ `connect.lookup`, or node:https custom `lookup`) — needs a dep or a stream rewrite. Documented at `model-gateway/tools/registry.ts` ToolExecutorDeps JSDoc + `boot/toolSeams.ts` module doc. **Decision for next session: accept for local demo, or close before any hosted deploy.**
- [low] ACCEPTED: concurrent outbound-IO overshoot bounded to one wave (persisted/energy stay capped at maxToolCalls).

**.env note (resolved):** the `.env` `OPENROUTER_API_KEY` line has trailing prose after the key (166 chars incl. an em-dash), but node's `--env-file` correctly parses only the clean 73-char key, so the app's live boot is FINE. Only a raw shell `cut` grabbed the prose. No action needed.

---

## B. OPEN ISSUES from the user's live run (the NEXT work) — with root-cause leads

> The user did a full LIVE run (tools on) and reported: it FAILED · saw NO culling · only FUSION (no mutation) ·
> two check-runner SKIPS · the lineage graph is still a visual mess. User clarification: **multiple tool calls per
> agenome is CORRECT and desired** (each agenome should do proper research); parallelizing where possible is IDEAL
> but NOT required. So do NOT "fix" by reducing research.

### B1 — Run failed (tool-use run). LIKELY: caps too low for proper research.
- Tool-use makes each agenome do a MULTI-TURN loop → ~5× the LLM calls of a no-tool agenome (initial + per-tool re-ask + final), plus the tool calls themselves, plus real ~2–5 s latency per OpenRouter call.
- The boot **default** caps (`apps/api/src/runtime/config/configSchema.ts`) are `energyBudget: 1000`, `maxToolCalls: 64`, `wallClockTimeoutMs: 600_000`. The route-side defaults (`server.ts`) are higher (energyBudget 100_000, maxToolCalls 200). **Which the demo run used determines whether energy/wall-clock exhausted.**
- The loop's energy-headroom-clamped concurrency + detectKill will end a run on `energy_exhausted` or wall-clock `cap_breach` → `run.failed`. With ~5× LLM spend, energyBudget 1000 is plausibly too small → early failure.
- **FIX direction (per user):** RAISE the caps for tool-use runs (energyBudget + wall-clock + maxToolCalls), don't reduce research. Verify the actual cap that the demo POSTs (the web S1 launcher / the POST /runs body) and the boot default; likely the demo needs a tool-use-aware higher energyBudget. Check `apps/web` run-config defaults + `routes/runs.ts` ingestion clamps.
- **INVESTIGATE FIRST:** the failed run's `run_events` — look for `energy_exhausted` / `cap_breach{dimension}` / `run.failed` + the total `energy.spent`. That pinpoints which cap blew. (Query Postgres `run_events` for the failed runId, or re-run with verbose.)
- **IDEAL optimization (not required):** the orchestrator executes a turn's tool calls SEQUENTIALLY — `boot/toolOrchestrator.ts` `for (const request_ of requests) { ... await resolved.execute ... }`. A model often returns several tool calls in ONE turn (the live run did web+x+youtube together). Wrap the per-turn executions in a bounded `Promise.all` (reuse `src/concurrency/pLimit.ts` `mapLimit`) so the 3 fire in parallel — big latency win, keeps the budget/ok-flag accounting unchanged (still record one observation per call). Watch: keep the toolBudget reservation correct under parallel exec (reserve the slots before dispatching).

### B2 — No MUTATION, only fusion. STRUCTURAL (pre-existing, not tool-use).
- `generationLoop.ts:841`: `mode: eligibleParents.length === 1 ? 'mutation_only' : 'fusion'`. Mutation fires ONLY when exactly **1** eligible parent.
- BUT the cull policy (`boot/composeRuntime.ts:135`) has `minSurvivors: 2` — the population floor never drops below 2 eligible parents. **⇒ eligibleParents.length is always ≥2 ⇒ mutation_only can essentially NEVER trigger ⇒ always fusion.** This is a design quirk, not a tool-use regression.
- **FIX direction:** decide the intended mutation policy. Options: (a) ALSO mutate within a fusion generation (per-offspring: some fused, some mutated) instead of all-or-nothing by parent-count; (b) lower `minSurvivors` to 1 so a tight run degenerates to mutation; (c) add a mutation probability to the reproduce seam independent of parent count. The selection track owns `apps/api/src/selection/reproduction/` — check `reproduce.ts` / the mode wiring. This is a SELECTION design decision — likely worth an AskUserQuestion on the intended evolutionary dynamics.

### B3 — No CULLING (in the failed run). INVESTIGATE — likely a symptom of B1.
- Culling WAS fixed in the 5-problems arc (`51b2e58`: agenomeId↔candidateId key + `cullFraction: 1/3` truncation). A successful run (the graph image) DOES show culled nodes. So the cull works in general.
- The user's FAILED run showing no culling is most likely because the run DIED (B1, energy/wall-clock) BEFORE the score→cull phase completed across generations — i.e., a symptom of B1, not a separate cull bug.
- **INVESTIGATE:** the failed run's events for `lineage.culled` (any? per generation?) and whether the run reached the scoring/cull phase at all before terminalizing. If the run completed generations but still didn't cull → a real cull regression to chase (check `selection/cull.ts` + the relative-stddev + cullFraction application against the LIVE fitness distribution). If it died early → fix B1 and re-test.

### B4 — Check-runner SKIPS (expected-deferred; tool-use is the ENABLER).
- `transfer.allowlisted_executable — SKIPPED: problem_not_prepared` and `transfer.prior_art — SKIPPED: retrieval_unavailable`.
- These are HONEST deferred skips (lesson 43/44): `prior_art` needs retrieval results threaded in; `allowlisted_executable` needs a prepared problem. Not regressions — the shipped check set is honestly N-of-M.
- **OPPORTUNITY (now unlocked by tool-use):** the agents now PRODUCE research (the persisted `tool_call.finished` results). The verify/check phase could thread those persisted tool results into `prior_art` as the `retrievalResults` DATA so the grounding check actually runs (the caller-does-retrieval split, lesson 44). That turns the agent's own research into grounding evidence. Scope: the verify seam (`apps/api/src/verifier/verify-seam.ts`) reads the candidate's `tool_call.finished` results and passes them to the grounding check adapters. Medium effort; high demo value (closes the grounding loop).

### B5 — Lineage graph still a visual MESS (frontend). Separate from tool-use.
- 5-problems #2 added gen columns + operation colors + legend, but the EDGE ROUTING + node layout are still cluttered: dashed mutation lines crossing everywhere, fusion edges tangled, nodes overlapping, long titles overflowing. (See the user's screenshot.)
- This is an `apps/web` task — the React Flow lineage layout. Files: `apps/web/src/components/lineage/` + `lib/layout.ts` (rewritten off Dagre in the 5-problems arc). Directions: bundle/curve edges, increase vertical spacing per row, de-emphasize/hide derivation edges (the gray "spawned→generated" lines add the most clutter), truncate titles, maybe collapse seeded-agenome rows. Consider an actual layered layout (elkjs) or tighter manual columns. Use `/browse` (gstack headless) or the claude-in-chrome extension for pixel review against a running web app.

---

## C. RESUME PROMPT (paste into a fresh session)

```
Resume the Doppl build on the `cody` worktree (/Users/dreddy/Documents/GauntletAI/Capstone, branch cody —
verify with `git -C ... branch --show-current`). The #4 agent-tool-use epic is COMPLETE + live-validated +
committed to cody (NOT pushed). DO NOT push without asking. Demo run: Docker doppl-pg up; .env at cody root;
`DOPPL_GATEWAY=live pnpm -C apps/api start` (no hot-reload — restart for code changes).

FIRST read docs/sessions/007-2026-06-25-tooluse-complete-open-issues.md (the canonical orient) — Section B is the
work. Then fix the open issues from the user's live run, in this order:

1. (B1) Run failure — the tool-use multi-turn research is CORRECT + desired (do NOT reduce tool calls). Find which
   cap blew (query the failed run's run_events for energy_exhausted / cap_breach / total energy.spent), then RAISE
   the run's caps (energyBudget + wallClockTimeoutMs + maxToolCalls) so proper research fits. IDEAL (not required):
   parallelize a turn's tool executions in boot/toolOrchestrator.ts via a bounded Promise.all (mapLimit), keeping
   the toolBudget reservation + ok-flag accounting correct.
2. (B3) Re-test the run end-to-end live and confirm culling fires across generations (likely a B1 symptom).
3. (B2) Decide the mutation policy — mutation currently can't fire (minSurvivors:2 vs mutation-at-1-parent at
   generationLoop.ts:841). Likely needs an AskUserQuestion on intended evolutionary dynamics, then a selection fix.
4. (B4) OPTIONAL high-value: thread the agents' persisted tool_call.finished research into the prior_art grounding
   check (verify-seam → retrievalResults DATA) so transfer.prior_art runs instead of skipping.
5. (B5) Clean up the lineage graph clutter in apps/web (edge routing/spacing/de-clutter; pixel-review via /browse).

Mode: autonomous direct-drive with /tdd discipline. Commit per fix to cody (full /preflight per change). Use
ultracode/workflows for fan-out where it helps. The user wants real live-LLM validation of fixes (memory
prefer-live-llm-validation) — run with the CLEAN key (the .env key has trailing prose; node --env-file handles it,
a raw shell export must take the first whitespace token).

Security carry-forward: the [high] resolve→connect TOCTOU in createSafeHttpGet is a DOCUMENTED MVP residual
(accepted for local demo) — close it (connect-time-validating dispatcher) before any hosted deploy.
```

---

## D. Quick reference
- All 8 slices + the open issues are tracked. Tool-use code is green; the issues are live-run/frontend behavior, not unit-test failures.
- maxToolCalls default 64 (configSchema) / 200 (server route). energyBudget 1000 / 100_000. These + wall-clock are the B1 knobs.
- Live tests run gated: `OPENROUTER_API_KEY=<clean-key> pnpm -C apps/api exec vitest run --config vitest.integration.config.ts test/integration/demo/live-tool-use.test.ts`.
