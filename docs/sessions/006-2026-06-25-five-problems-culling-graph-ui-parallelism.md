# Session 006 — five user-reported problems: culling · graph · UI/log · parallelism (+ tool-use deferred)

**Date:** 2026-06-24 → 2026-06-25
**Branch:** `cody` (the user runs the demo from this checkout: `/Users/dreddy/Documents/GauntletAI/Capstone`)
**Mode:** single-operator autonomous direct-drive (ultracode)
**Predecessor:** `docs/sessions/frontend-v2-002-2026-06-24-autonomous-fb-fv-completion-merge.md`
**Successor:** _(the #4 tool-use session — see "RESUME: #4 tool-use" below)_

## Why this session existed
The user reported 5 problems with the live demo (running from the cody checkout, which has the frontend-v2 rebuild merged):
1. **No culling** — no lineage ever dies, so no final answer is ever produced.
2. **Graph unreadable** — wants generation columns, color-coded nodes by operation, clear reproduction parentage, a legend.
3. **UI unpolished + logs scroll the page** — wants a confined, fixed-height, internally-scrollable log box.
4. **Agents need tool use** — web/X/YouTube research to generate ideas.
5. **Parallelism** — agenomes process serially + judges judge one-by-one; wants concurrency.

Each was root-caused by a parallel investigation workflow (5 investigators) against the cody worktree before any code changed.

## What was built (commits on cody)

### #1 Culling — `51b2e58` fix(selection)
Two real bugs, not just a weak policy:
- **Key mismatch (the load-bearing bug):** `cull()` emits `lineage.culled` keyed by **agenomeId** (`payload.targetIds`, no envelope `candidateId`), but `resolveEligibleParents` (the loop) + `partialSummary` (the winner path) excluded by **candidateId** → a firing cull was IGNORED, the culled lineage kept breeding and could still win. Both consumers now map agenomeId→candidates and exclude when either the candidate id OR its agenome id is culled. (The pre-existing terminalClassifier tests used a candidate-keyed `lineage.culled` shape production never emits — that's why the bug shipped green; added a real-shape test.)
- **Weak policy:** the relative `mean − 1·stddev` threshold eroded nothing when fitness clustered. Added optional **truncation pressure** (`CullPolicy.cullFraction`, boot = 1/3) — cull the weakest `floor(n·fraction)` each generation, floor-clamped + weakest-first (deterministic, rule #7). No contract change.
- **Files:** `selection/cull.ts`, `runtime/loop/generationLoop.ts` (resolveEligibleParents, now exported), `runtime/terminal/partialSummary.ts`, `boot/composeRuntime.ts` (MVP_CULL_POLICY); tests `selection/cull.test.ts`, `runtime/terminal/terminalClassifier.test.ts`, new `runtime/loop/resolveEligibleParents.test.ts`.
- **Live-validated:** a pop-6×3 run culled 5 lineages and produced a winner (was 0 culls ever).

### #2 Graph — `a052af7` feat(projections) + `e36db03` feat(web) + `a2e5f36` fix(web)
- **Backend:** additive optional `generationIndex` on `LineageNode` (a derived projection field → NO schemaVersion bump); `buildLineageGraph` sets it by parsing the deterministic `${runId}-gen${N}` id (generation/agenome/candidate from their own generationId; critic/check/score inherit their candidate's column). Field-set snapshots updated in BOTH `entities-lineage-field-sets.test.ts` AND `src/__schema-snapshots__/field-sets.ts` (the central `FIELD_SET_SNAPSHOTS` that `contract-surface.test.ts` checks — remember both on any LineageNode change).
- **Frontend:** `layout.ts` rewritten from Dagre topological → deterministic per-generation **column grid** (agenome stacked above its candidate); `nodeTypes.tsx` color-codes node BODIES by operation (seed/mutation/fusion via `--status-seeded/mutated/reproduced`, culled faded, winner gold+glow) with the StatusBadge glyph kept (color never sole channel); generation node → column-header chip; new `edgeStyles.ts` (fusion solid violet / mutation dashed amber / derivation faint); new `LineageLegend.tsx` (top-right Panel); `lineageToFlow.ts` threads `generationIndex` + derives `bornBy` from the incoming reproduction edge. `@dagrejs/dagre` now unused (prune follow-up).
- **`a2e5f36`:** bounded the LineageGraph in-flight activity feed (the center pane's own feed, separate from the ActivityTicker) to a fixed-height scroll box.
- **Live-validated (browser):** measured 4 clean columns at x=24/364/704/1044 (340px apart), 41 decluttered nodes, legend + gold winner + faded culls render; no console errors.

### #3 UI / log — `7d84bc3` feat(web)
- `ActivityTicker.tsx`: ascending (newest at BOTTOM) + stick-to-bottom auto-scroll (pauses on scroll-up, resumes at bottom) + "jump to latest"; de-truncated (was hard-capped at 12 → soft cap 500); magic numbers → DS tokens.
- `S2OrganismView.tsx`: viewport-contained cockpit — 3-pane grid clamped to `calc(100vh − header)`, each pane scrolls independently; ticker fills its rail.
- `Dashboard.tsx`: stacked panels → responsive grid.
- **Live-validated:** page is viewport-contained (no infinite scroll).

### #5 Parallelism — `f757267` + `1a3ab36` + `8bf2d25`
A bounded-concurrency pool (`src/concurrency/pLimit.ts` — cross-cutting, NOT under `runtime/`, because `successor.ts` is a rule-#9 runtime-handoff that can't import `/runtime`; pinned by `successor_no_kernel_import_runtime_handoff`).
- **Verifier (`f757267`):** candidates verified concurrently (critics + judges no longer one-by-one). Energy-free stage → execution-strategy-only change.
- **Population generation (`1a3ab36`):** agenomes generate concurrently. This is the ONLY energy-debiting stage, so rule #1 is preserved by: a per-batch ceiling clamped to remaining-energy headroom (`floor(remaining/estPerLlmCall)`); each task re-checks `detectKill` before its generate; a post-batch kill poll drains within the one bounded generation step. Event IDs are collision-free under async concurrency (id-build + counter increment is synchronous — atomic in single-threaded Node); candidate order is deterministic (mapLimit preserves input order → keeps the score-seam comparison-set accumulation deterministic). The mid-generation-stop unit + integration tests were updated to the concurrent semantic (the bounded step is the batch, not the per-agenome step; the rule-#1 guarantee — stop observed within one bounded step, reproduction halted — is unchanged).
- **Reproduction (`8bf2d25`):** offspring slots reproduce concurrently (per-slot seed `seed+slot` is position-deterministic → fully order-independent, rule #7).
- **Deferred:** novelty-embed parallelization — low value (~3s; embeddings are fast vs fusion LLM calls) and the score-seam comparison-set accumulation is deliberately serial/replay-load-bearing.
- **Live-validated:** identical pop-6×3 run, serial ~150s → 86s wall-clock (~43% faster), same output (16 candidates, 18 fusions, 5 culled, winner).

## Decisions made
- Targeted ALL work at the **cody** worktree (the user's running checkout), not phase-d. phase-d does NOT have the frontend-v2 rebuild.
- Culling: fix the consumers to honor the agenome-keyed cull (smaller blast radius than re-keying the frozen `CullingEvent`) + add truncation. No contract change.
- Graph generationIndex is a derived projection field → no schemaVersion bump (rule #2: projections are rebuildable).
- Parallelism ceiling for the energy-debiting stage is a clamped hint (like spawnBudget); the kernel kill stays the authoritative cap enforcer (rule #1).
- pLimit lives in a cross-cutting `src/concurrency/` so selection can use it without violating the runtime-handoff layering.

## Decisions explicitly NOT made (deferred)
- **#4 tool-use** — deferred to a fresh focused session (user's call; it's a contract-bumping XL epic that benefits from fresh context). Full research + slice plan below.
- Novelty-embed parallelization (see #5).
- `@dagrejs/dagre` removal from `apps/web/package.json` (now unused).

## TDD compliance
Coverage complete + all green. Test-first on the deterministic kernel/selection changes (cull truncation, resolveEligibleParents, partialSummary, pLimit, the concurrency-proving loop tests). The frontend graph/UI work (React components) was impl-then-test in-slice (order deviation, not a coverage gap — consistent with prior sessions' React posture). Two safety-invariant tests (mid-generation-stop, unit + integration) were UPDATED to the concurrent semantic with explicit comments — the rule-#1 guarantee is preserved, the bounded-step granularity refined (per-agenome → per-batch).

## Verification
- Backend: `pnpm -C apps/api typecheck` clean · unit **771** green · integration **191** (7 skipped) green · lint + format clean.
- Contracts: **207** green. Web: **319** unit + build green; lint/types/format clean.
- Live runs on the cody API (live mode): culling fires + winner emerges; graph renders columns/colors/legend; cockpit viewport-contained; parallelism 150s→86s.

## How to use what was built
- Run the API: `DOPPL_GATEWAY=live pnpm -C apps/api start` from the cody root (auto-loads `.env`). Restart to pick up these commits.
- Tune parallelism: `GenerationLoopDeps.maxAgenomeConcurrency` (default 6) + `VerifySeamDeps.maxConcurrency` (default 6); reproduction uses `DEFAULT_REPRODUCE_CONCURRENCY` (6). Generation is additionally energy-headroom-clamped.
- Tune culling pressure: `MVP_CULL_POLICY.cullFraction` in `boot/composeRuntime.ts` (default 1/3).

---

## RESUME: #4 tool-use (the deferred epic)

**Goal:** agents do their OWN research (web + X + YouTube) to generate ideas. The user picked **Option A** (gateway-orchestrated, full safety compliance, NO new API keys) over OpenRouter-native-web-only.

**Provider backends (NO new keys — all via the existing OpenRouter key):**
- `web_search` → OpenRouter server-side `openrouter:web_search` tool OR the `plugins:[{id:'web'}]` web plugin.
- `fetch_url` → OpenRouter server-side `openrouter:web_fetch` tool, or a direct vendor-free HTTP fetch adapter (SSRF guard: public http(s) only, no localhost/RFC1918).
- `x_search` → route a sub-call to `x-ai/grok-*` with its live (X) search.
- `youtube_search` → route a sub-call to `google/gemini-*` (YouTube/URL understanding).
- ⚠️ Verify the exact OpenRouter pass-through for Grok live-search + Gemini YouTube via Context7 (`/websites/openrouter_ai`) BEFORE building the platform adapters — the generic `tools`/`plugins`/`tool_calls` shapes are confirmed; the platform-specific params are not.

**OpenRouter API facts confirmed (Context7, 2026-06-25):**
- Server-side tools: `tools: [{ type: 'openrouter:web_search' }]`, `{ type: 'openrouter:web_fetch' }` — executed server-side in one completion.
- Web plugin: `plugins: [{ id: 'web', max_results: N }]`.
- Standard function-calling: `tools: [{type:'function', function:{...}}]` → `response.choices[0].message.tool_calls` → append `{ role: 'tool', tool_call_id, content }` for the multi-turn loop.

**Current-state gaps (file:line, from the investigation):**
- `ModelGatewayRequest` (packages/contracts/src/gateway/gateway-request.ts) has NO `tools` field; `ChatRole` is closed `system|user|assistant` (no `tool` role).
- `ModelGatewayResponse` (gateway-response.ts) has no tool-call surface.
- `openrouter.adapter.ts` `buildParams`/`complete`/`mapSdkResponse` — single round-trip, ignores `tool_calls`/`finish_reason`.
- `toGenerationGateway` (boot/composeRuntime.ts:139) is a pass-through (`{ response: await modelGateway.call(request) }`) — the dead-channel to replace.
- **`maxToolCalls` is a defined RunCaps dimension but NOT kernel-enforced in the loop** (the loop calls `enforceCap` only for maxPopulation/maxGenerations; `detectKill` checks energy/wallclock/operator-stop, never maxToolCalls). Closing this is a rule-#1 safety-invariant slice that must land regardless.
- `tool_call.started/finished` events already exist (FB.7) and fall through to GENERIC_PAYLOAD_SCHEMA → no contract bump needed for the tool events themselves.

**Slice plan (each a /tdd cycle; safety-invariant slices SOLO):**
1. **Contract (forced-serial, sv10→11):** `ModelGatewayRequest.tools?` (optional → absent = byte-identical, so critic/judge/embedding requests unaffected, rule #6 anchor byte-identical), a tool-result message channel (PREFER a separate structured tool-result variant over adding a `tool` member to the closed ChatRole — keeps the 3-member union the rule-#5 isolation reasoning depends on), `ModelGatewayResponse` tool-call-request surface, a frozen `ToolDescriptor` allowlist union (web_search/fetch_url/x_search/youtube_search — non-executing by shape, rule #3), capability flag. Grep-the-pins (LESSON 17/100): version.ts + field-sets + envelope + fixtures-valid + the new amendment test owns the literal pin.
2. **Kernel maxToolCalls enforcement (SOLO safety-invariant, rule #1):** `enforceCap('maxToolCalls', …)` before each tool debit + fold tool_call.finished count into `detectKill`. Lands regardless of the rest.
3. **Tool registry (model-gateway):** `TOOL_REGISTRY` allowlist + parallel pure-impl map + fail-safe `resolveTool` (mirror check-runners/registry.ts, LESSON 39); `web_search` + `fetch_url` adapters (fetch_url SSRF guard).
4. **OpenRouter adapter tool-calling:** emit `tools`/`plugins`; parse `choices[].message.tool_calls` + `finish_reason` in `mapSdkResponse`.
5. **Tool-orchestrating GenerationGateway (replaces toGenerationGateway):** on a tool-call request, resolve against the allowlist, execute, PERSIST the result (rule #7), debit energy on success (#8), wrap as `wrapUntrusted` DATA + a `TOOL_RESULT_DATA_FRAMING` const (rule #5 — web content is the prime injection vector), re-inject, loop (bounded by the kernel maxToolCalls). Populate `toolCalls[]` so the loop's existing FB.7 relay finally feeds.
6. **Replay:** re-read tool results from the persisted log keyed by (agenomeId, ordinal) — never re-fetch (rule #7); assert state-equivalence.
7. **Platform adapters:** `x_search` (Grok) + `youtube_search` (Gemini) routing.
8. **Eval:** held-out-rubric eval comparing gen-N-without-tools vs with-tools on grounding/novelty/feasibility.

**Invariants to hold throughout:** judge stays tool-FREE (rule #6 — tools attach ONLY to the population_generator route, so tool-use is structurally unable to reach the evaluation/scoring anchor; the rubric/policy stays byte-identical across the sv bump). Energy debits only on a successful tool result (#8). Every tool result persisted + replayed, never re-fetched (#7). maxToolCalls kernel-enforced (#1). Web content re-enters as wrapUntrusted DATA, never instructions (#5).

## Open follow-ups (non-blocking)
- #4 tool-use (above).
- Novelty-embed parallelization (low value).
- Remove unused `@dagrejs/dagre` from `apps/web/package.json`.
- Re-record the demo replay fixture with VARIED candidate content so the committed fixture demonstrates a cull (currently byte-identical candidates → 0 culls in the fixture; the LIVE path culls correctly).
- Bolder graph node colors / dead interim-Dashboard cleanup (cosmetic).
