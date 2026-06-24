# /tdd brief — operator_prompt_panel

## Feature
The web **OperatorPromptPanel** (PD.5b — the web half of PD.5): the operator picks a prepared problem (from `GET /problem-sets`) OR types a freeform prompt; both become the run's `seed` and start a demo run by POSTing a PARTIAL `{seed}` through the existing `POST /runs` (the api deep-merges defaults — PD.5a/PD.10 verified). On start, the panel hands the new run to the existing Dashboard shell (`onStarted`), which auto-wires the live SSE/lineage/health view. Mostly-visual React, so the deterministic surface is `/tdd` (form logic + the data-client methods) and the render→submit→live flow is a Playwright e2e; ZERO new contract surface.

## Use case + traceability
- **Task ID:** PD.5
- **Architecture sections it implements:** `ARCHITECTURE.md §12` (frontend dashboard — read-only over projections + REST commands), `ARCHITECTURE.md §17` (the demo "operator-entered live prompt" path). The **PD.5b (web) half**; consumes PD.5a's `GET /problem-sets` + the existing `POST /runs`.
- **Related context:** **web hat** — read `apps/web/CLAUDE.md` (logic-module ↔ view-component split like `runConfigForm.ts`↔`RunConfigPanel.tsx`; Vitest unit + Playwright e2e; **forbidden: direct fetch (use the injected runClient), `apps/api/**` imports (only `@doppl/contracts` types), provider keys, SSE-as-truth, mutating authoritative state**). PD.10 made the `seed` shape generation (so a selected/typed problem has real effect) + isolates it as `wrapUntrusted` DATA. `POST /runs` deep-merges a partial `{seed}` (`validateRunConfig`, verified). `ProblemSet` is NOT in `@doppl/contracts` (it's a runtime-config schema) → web-local Zod mirror, exactly parallel to the existing web-local `RunHealth` pattern (apps/web LESSON §9). Existing handoff: `RunConfigPanel`'s `onStarted?(run)` → Dashboard `setObservedRunId(run.id)` → the shell wires SSE/lineage/health.

## Acceptance criteria (what "done" means)
- [ ] `runClient.getProblemSets(): Promise<ProblemSet[]>` — GETs `/problem-sets`, validates the response against a web-local `ProblemSet` Zod schema (non-2xx → the existing `TransportError`; invalid payload → the existing `PayloadValidationError`), returns the catalog.
- [ ] `runClient.startDemoRun(partial: { seed: string }, opts?: { idempotencyKey?: string }): Promise<Run>` — POSTs the PARTIAL body `{ seed }` to `/runs` (mirrors the existing `postInit`/`getJson` + Idempotency-Key pattern), returns the `Run`. (The api deep-merges defaults; the panel never sends caps — the boot ceiling applies.)
- [ ] `operatorPromptForm`: `buildDemoSeed(form)` → the chosen `seed` string — the prepared problem's `prompt` (when source=prepared) OR the freeform text (when source=freeform); `validateOperatorPrompt(form)` → fails when no source is chosen or the chosen text is empty (the seed must be non-empty, matching `RunConfig.seed` min(1)).
- [ ] `OperatorPromptPanel.tsx`: on mount fetches `getProblemSets()` (renders the prepared options); the operator toggles prepared (dropdown) vs freeform (textarea); submit → `startDemoRun({ seed }, { idempotencyKey })` → calls `onStarted?(run)`; loading + error states rendered accessibly (labeled inputs, `role="alert"` errors — projector-legible, per apps/web conventions).
- [ ] Mounted in `Dashboard.tsx` with `onStarted={(run) => setObservedRunId(run.id)}` — the existing shell then wires the live SSE/lineage/health view (no new run-lifecycle state).
- [ ] **Playwright e2e (happy path):** with mocked `GET /problem-sets` + `POST /runs` (+ SSE), the operator picks a prepared problem OR types a freeform prompt → submit → the run appears live (ModeBanner LIVE / lineage renders) — mirrors `test/e2e/dashboard-smoke.spec.ts`.
- [ ] Forbidden-pattern clean: no direct `fetch` (uses runClient); no `apps/api/**` import (only `@doppl/contracts` + web-local types); no provider keys; the panel issues only the `POST /runs` command (no authoritative mutation); SSE stays non-authoritative (the shell's existing resync).
- [ ] `/preflight` clean (web: typecheck + lint + Vitest + the e2e smoke).

## Wiring / entry point (Step 7.5)
`apps/web/src/routes/Dashboard.tsx` mounts `<OperatorPromptPanel runClient={runClient} onStarted={(run) => setObservedRunId(run.id)} />` (in the "Run" panel, alongside or as the demo-forward alternative to `RunConfigPanel`). The `onStarted` handoff reuses the shell's existing machinery (SSE wire + lineage/health load on `observedRunId`). Reachable; the Playwright e2e exercises the full path. Confirm the panel is actually mounted (not just defined) at Step 7.5.

## Files expected to touch
**New:**
- `apps/web/src/components/demo/OperatorPromptPanel.tsx` — the view (prepared dropdown / freeform textarea / submit). *(Path: `components/demo/` matches the `components/run/` convention; the plan wrote `src/demo/` — use whichever matches apps/web conventions, your call at Step 2.5.)*
- `apps/web/src/components/demo/operatorPromptForm.ts` — pure logic (`buildDemoSeed`, `validateOperatorPrompt`, the form-values type).
- `apps/web/src/data/operatorPromptClient.ts` — the web-local `ProblemSet`/`ProblemSets` Zod mirror (+ `getProblemSets` if not folded into runClient).
- `apps/web/test/unit/components/demo/operatorPromptForm.test.ts`
- `apps/web/test/unit/data/operatorPromptClient.test.ts` (getProblemSets validation + startDemoRun partial POST)
- `apps/web/test/e2e/operator-prompt-panel.spec.ts` (Playwright happy path)

**Modified:**
- `apps/web/src/data/runClient.ts` — add `startDemoRun(partial, opts)` + `getProblemSets()` (mirror `postInit`/`getJson`).
- `apps/web/src/routes/Dashboard.tsx` — mount `<OperatorPromptPanel … onStarted=… />`.

If implementation needs files beyond this list, **flag at Step 2.5**.

## RED test outline (Step 2)
Vitest unit — `operatorPromptForm.test.ts`:
1. **`build_demo_seed_from_prepared`** — source=prepared + a selected problem → `buildDemoSeed` returns that problem's `prompt`. Why: §17 prepared path.
2. **`build_demo_seed_from_freeform`** — source=freeform + typed text → returns the freeform text. Why: §17 operator-prompt path.
3. **`validate_rejects_empty_or_no_source`** — no source / empty selection / empty freeform → validation error (seed must be non-empty). Why: `RunConfig.seed` min(1); fail-closed.

Vitest unit — `operatorPromptClient.test.ts`:
4. **`get_problem_sets_validates_payload`** — a valid `GET /problem-sets` body → parsed `ProblemSet[]`; an invalid payload → `PayloadValidationError`; non-2xx → `TransportError`. Why: apps/web L1 (validate every server payload; injected transport, no direct fetch).
5. **`start_demo_run_posts_partial_seed`** — `startDemoRun({seed}, {idempotencyKey})` POSTs body `{seed}` to `/runs` with the Idempotency-Key header; returns the `Run`. Why: §17 — both paths flow through the existing write path; the api deep-merges defaults.

Playwright e2e — `operator-prompt-panel.spec.ts`:
6. **`operator_prepared_then_live`** — mock `GET /problem-sets` + `POST /runs` (+ SSE): pick a prepared problem → submit → the run appears live (ModeBanner LIVE / lineage visible). Why: §12/§17 happy path.
7. **`operator_freeform_then_live`** — type a freeform prompt → submit → run live. Why: §17 operator-entered path. (May be one parametrized e2e.)

> **Visual rendering** (layout/styling) is covered by the e2e + design review, not unit assertions (apps/web TDD posture: pure-visual → e2e/design-fixture). The `/tdd` surface is the form logic + the data-client methods (1–5).

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** none. ZERO new contract surface — the web-local `ProblemSet` Zod is a MIRROR of the api runtime-config schema (parallel to the existing web-local `RunHealth` pattern), not an `@doppl/contracts`/Appendix-A model; the partial `{seed}` POST reuses the existing `POST /runs`.
- **Orchestrator doc rows to write hot (Step 9 routing):** none expected. Likely an **Architecture-doc note** (§12/§17): the OperatorPromptPanel is the demo operator-prompt UI (prepared/freeform → partial `{seed}` → existing write path → existing shell handoff). Possibly a **carry-forward** echoing the existing web-local-mirror-vs-promote-to-contracts tension (the RunHealth promotion item) — if `ProblemSet` should later be promoted to `@doppl/contracts`, note it (not this slice).
- **§2.5-seam model touched?** No.

## Things to flag at Step 2.5
1. **`ProblemSet`: web-local Zod mirror vs promote to `@doppl/contracts`?** My default vote: **web-local mirror** (parallel to the existing web-local `RunHealth`, apps/web L§9) — promoting would be new frozen-contract surface (forbidden here + a contract-coordination round). Note the promote-later option in carry-forward.
2. **`startDemoRun` (new method) vs extend `startRun` to accept a partial?** My default vote: **new `startDemoRun(partial, opts)`** — keeps `startRun(config: RunConfig)` fully-typed; `startDemoRun` is explicitly the partial-`{seed}` demo path.
3. **Panel location: `components/demo/` vs the plan's `src/demo/`?** My default vote: **`components/demo/`** (matches the `components/run/` convention) — but defer to apps/web conventions (your read of `apps/web/CLAUDE.md`).
4. **Mount: alongside `RunConfigPanel` or replace it?** My default vote: **alongside** (the operator panel is the simple demo-forward path; `RunConfigPanel` stays for full control) — a small tab/section in the "Run" panel.
5. **Content-logging toggle?** **DEFERRED to P2.8** (Langfuse export isn't wired + persisting a toggle = new contract surface) — do NOT add it here (tracked in the PD.5 entry + Trims).

## Dependencies + sequencing
- **Depends on:** PD.5a (`GET /problem-sets`, landed `65b2496`); PD.10 (the `seed` shapes generation — makes the panel meaningful); the existing `POST /runs` + the Dashboard shell + runClient.
- **Blocks:** PD.8's "operator prompt → live run" rehearsal walkthrough (the demo's headline flow).

## Estimated commit count
**1.** One cohesive web slice (panel + form logic + data-client methods + unit tests + e2e). Not safety-touching (read-only over projections; the only command is the existing `POST /runs`; no new invariant) → security-reviewer = **phase-boundary** (no per-slice review). NOT bundled with PD.6/PD.7 (separate panels; keep bisectable).

## Lessons-logged candidates anticipated
- **Architecture-doc note candidate** — §12/§17: the OperatorPromptPanel is the demo operator-prompt UI; prepared/freeform → partial `{seed}` → existing `POST /runs` deep-merge → existing shell handoff (no new run-lifecycle state).
- **Future TODO (carry-forward)** — promote `ProblemSet` to `@doppl/contracts` (with the existing `RunHealth` promotion) if a frozen catalog contract is wanted later (contract-coordinated; not this slice).

## How to invoke
1. **Read this brief end-to-end** + **`apps/web/CLAUDE.md`** (web hat: conventions, forbidden patterns, Vitest/Playwright).
2. **Run `/tdd operator_prompt_panel`**.
3. **Step 0 (Restate)** — the web operator-prompt panel; prepared/freeform → partial `{seed}` → existing write path → existing shell handoff; web-local `ProblemSet` mirror; ZERO new contract surface.
4. **Step 1 (Identify files)** — confirm against "Files expected to touch" (+ your panel-location call).
5. **Step 2.5** — test-design + coverage map + the 5 answers. (The deterministic surface is /tdd; the visual is e2e/design — say which acceptance bullets map to the e2e.)
6. **Step 9** — surface anything beyond the anticipated candidates.

> **CWD — CRITICAL (Bash cwd RESETS each call):** Read/Edit/Write → ABSOLUTE paths under `/Users/dreddy/Documents/GauntletAI/Capstone-phased/`; **web TESTS → `pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone-phased/apps/web test ...`** (a bare `pnpm test` runs the KERNEL worktree = FALSE GREEN; note this is `apps/web`, not `apps/api`); git → `git -C /Users/dreddy/Documents/GauntletAI/Capstone-phased ...`; branch-check `== phase-d` before the first edit AND the Step-10 commit.
