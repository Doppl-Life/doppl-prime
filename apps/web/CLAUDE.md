# Doppl `apps/web/` — Build Guide

> **You're in `apps/web/`.** This file plus root `CLAUDE.md` both load. The root file covers global project conventions + shared comm rules (track-prefix, escalation taxonomy, messaging budget); this file owns code-area conventions for the React dashboard.

## Launch protocol

| Working on... | cwd | Loads |
|---|---|---|
| Planning / docs / commits | repo root (`Capstone/`) | root `CLAUDE.md` only |
| the React dashboard code | `apps/web/` | this `CLAUDE.md` + root |
| the backend (Doppl kernel + subsystems) code | `apps/api/` | `apps/api/CLAUDE.md` + root |

If you find yourself fighting the wrong conventions, check your cwd.

## Session start/end protocol

**At session start:**
1. Read `IMPLEMENTATION_PLAN.md` (repo root) **by section, not whole** — `grep -n "^##" IMPLEMENTATION_PLAN.md` for offsets, then Read with offset/limit just "Currently in progress" + the active phase. (The file grows; never load it whole.)
2. Confirm with the user what feature this session is targeting.
3. Read the relevant section of `ARCHITECTURE.md` from the lookup table below.

**At session end** (only when the user explicitly says we're done):

1. **Implementer runs `/session-end`.** Implementer writes ONLY:
   - `apps/web/` code files (the slice's implementation)
   - test files (the slice's tests)
   - dependency manifest / lockfile (deps the slice adds)
   - `docs/sessions/<NNN>-<date>-<topic>.md` (session doc, created at `/session-end` Step 5)

   **Implementer must NOT touch (all orchestrator territory).** *This list is the canonical statement
   of the territory rule — `/session-end`, the brief template, and the generated
   `scripts/guards/territory-guard.sh` PreToolUse hook (which mechanically enforces it in team mode)
   all point here.*
   - `IMPLEMENTATION_PLAN.md`
   - `apps/web/LESSONS.md`
   - `apps/web/CLAUDE.md` (entire file — both the Cross-doc invariants table AND the Lessons logged index)
   - `ARCHITECTURE.md`
   - `docs/orchestrator-briefing.md` / `docs/tdd-brief-template.md` / `docs/briefs/` / `docs/runbooks/`
   - other top-level deliverable / design docs
   - `.gitignore` and root-level dotfiles (unless adding a new artifact to ignore, flagged at Step 9)

   At Step 10: **explicit `git add <path>` per slice file; never `git add -A`/`.`; never stage an orchestrator-territory file.** Changes to any orchestrator-territory file (a new cross-doc model, a lesson, an arch note) are **flagged at Step 9**, not edited here — the orchestrator writes them hot (root `CLAUDE.md` + the Step-9 matrix).

2. **Orchestrator runs `/orchestrate-end`** for round close-out + Carry-forward triage + round terminal commit + push.

## Lookup table — where to find canonical info

Don't paste these sections into the prompt. Grep the file:section, read only what you need. `/check-arch <topic>` dispatches off this table.

| Topic | File (relative to repo root) | Section |
|---|---|---|
| Frontend dashboard (panels, live/replay, React Flow, accessibility) | `ARCHITECTURE.md` | §12 |
| Lineage graph & LineageGraphProjection | `ARCHITECTURE.md` | §10 |
| Backend API & flows (REST endpoints, SSE, resume, health) | `ARCHITECTURE.md` | §11 |
| Lessons logged (full prose) | `apps/web/LESSONS.md` | by lesson # |

<!-- Starts near-empty. Add a row whenever a topic is looked up twice. -->

**Code intelligence & docs (when available):** prefer a code-intelligence MCP / docs MCP over grep+read loops — see root `CLAUDE.md` "Code intelligence & docs."

## Stack

<!-- ▼ EXAMPLE BLOCK [id=area-stack]: stack quick-reference for implementer sessions. Canonical stack lives in root CLAUDE.md + ARCHITECTURE.md; this is the cheat sheet. ▼ -->

- **Runtime:** Node 22 LTS (pnpm workspace)
- **Framework:** React 19 + Vite (React Flow for the lineage graph)
- **Validation:** Zod (shared schemas from `packages/contracts` — consumed read-only)
- **Lint / types / tests:** ESLint / `tsc --noEmit` (strict) / Vitest (unit) + Playwright (e2e happy-path smoke)

<!-- ▲ END EXAMPLE BLOCK [id=area-stack] ▲ -->

## Standard commands

```bash
# Install deps (run once; re-run when the manifest changes)
pnpm install

# Run the dev server (if applicable)
pnpm dev

# Tests
pnpm test

# Quality
pnpm lint
pnpm format:check
pnpm typecheck

# Preflight (use before saying "done" with a feature)
pnpm lint && pnpm typecheck && pnpm test
```

## TDD protocol

**Write the failing test first.** Applies to deterministic code — see the TDD posture in root `CLAUDE.md`. For the dashboard, that means: the REST/SSE client, the sequence-keyed resync reducer, the projection→view mapping, and the accessible-status primitive are unit-test-first; the end-to-end render is covered by **one Playwright happy-path smoke** (start → live events → final-idea links resolve).

**Commit per slice when practical.** Never bundle a safety-critical slice with anything else.

## Forbidden patterns

<!-- ▼ EXAMPLE BLOCK [id=forbidden-patterns]: forbidden patterns — 3-5 narrow, enforceable, domain-specific rules. Shape: "Don't <pattern X> because <reason / past incident>; use <alternative Y>." Test-pin them where possible. Starts small; accretes as lessons surface. ▼ -->

Do not:

1. **Write code without a failing test first** (for deterministic code). Even one-line functions.
2. **Mutate authoritative runtime state from the dashboard** — the UI is read-only; all commands go through the REST endpoints (safety rule 2; `ARCHITECTURE.md` §12).
3. **Treat the SSE stream as the source of truth** — SSE is delivery only; resync from the last `sequence` (`lastEventId`) or poll the projection (safety rule 2).
4. **Encode a status by color alone** — every status uses shape + label + icon (colorblind-safe, projector-legible) — the dashboard is an acceptance surface shown to a room (`ARCHITECTURE.md` §12).
5. **Fetch or render a provider key / secret in the client** — server-side only (safety rule 4).
6. **Import backend internals (`apps/api/**`)** — the dashboard reads projections through the typed API/SSE client; it shares only `packages/contracts` types.

**Enforcement patterns (machine-readable — `/preflight` warn-greps the staged diff against these).**
One `grep -E` (or `ast-grep`) expression per line, each tied to a numbered rule above. Rules that can't
be expressed as a pattern carry a `pin:` (test ref) or `accepted:` note on the rule itself instead.

```forbidden-patterns
# rule 6 (no backend-internals import): from ['"].*apps/api/
# rule 4 (no color-only status): pin: accessible-status primitive test (shape+label+icon)
# rule 3 (resync from sequence): pin: SSE reducer test — reorders/resyncs by sequence
```

<!-- ▲ END EXAMPLE BLOCK [id=forbidden-patterns] ▲ -->

## Cross-doc invariants — schema/docs mirroring

Several typed models in this codebase are **contracts** mirrored in `ARCHITECTURE.md` and indexed in the table below. The architecture doc is the canonical contract; the model is the executable enforcement. Drift produces silent disagreement.

**Authoring discipline (orchestrator owns this table).** The implementer never edits this table or `ARCHITECTURE.md` directly — it flags a field add/remove/rename at Step 9 as a `Cross-doc invariant change`; the orchestrator writes the row + the arch edit hot the same round (see root `CLAUDE.md` + `docs/orchestrator-briefing.md`). Commits stagger; the working tree stays aligned within the round.

| Model | `ARCHITECTURE.md` section | Notes |
|---|---|---|
| Consumed read-only: `RunEventEnvelope`/`RunEventType`, `RunConfig`/`RunCaps`, `CandidateIdea`, `LineageGraphProjection`, `ModelRoute`, `FitnessScore`, `NoveltyScore`, `EnergyEvent`, `CriticReview`/`CriticMandate`, `CheckResult` | §4 / §5 / §7 / §8 / §10 / §11 / §12 | The dashboard **CONSUMES** these frozen contracts **read-only** via the single `apps/web/src/data/contracts.ts` re-export seam (`z.infer` types; never redefined — defines no Appendix-A model). Drift is caught by `tsc` against the frozen `@doppl/contracts` exports **+** the `runClient`/`sseStream` Zod-validate-on-read (a server payload that drifts from the contract surfaces as a typed `PayloadValidationError`, never corrupt state). (P7.1; `FitnessScore`/`NoveltyScore` added P7.8 — charts read `total`/`score` verbatim from the `fitness.scored`/`novelty.scored` payloads, §8; `EnergyEvent` added P7.9 — the energy panel sums `actual` from `energy.spent` only, rule #8 success-only DISPLAYED, §5.) |

<!-- The dashboard is a read-only CONSUMER (it defines no Appendix-A model); this row tracks the consumed contract surface. Add/refine as later panels consume more (e.g. the health signal at P7.14 if promoted to a shared contract). -->

## Module organization

<!-- ▼ EXAMPLE BLOCK [id=module-layout]: module layout + layer dependency rule. Replace with the project's real directory tree and import-direction DAG. ▼ -->

```
apps/web/
  src/
    data/                 # REST client + SSE stream over the typed contracts + typed errors (P7.1: runClient, sseStream, contracts, errors)
    state/                # client run-store: sequence-keyed fold + resync + polling fallback (P7.2: reducer, runStore, resync)
    styles/               # design tokens COPIED from docs/doppl-design-system (P7.3): index.css barrel + tokens/*.css + assets/fonts/*.woff2; imported once at the app root
    components/           # components PORTED TS-strict from the prototype, by its categories:
      core/               #   StatusBadge + status-map (P7.3); Button, Meter (core primitives)
      cards/              #   CandidateCard, AgenomeCard (inspectors)
      feedback/           #   ModeBanner (P7.4 mode indicator), system/empty/error/degraded states
      observatory/        #   HealthIndicator, RunEnergyGauge, CriticGauntletPanel, ActivityTicker
      lineage/            #   React Flow lineage tree + NodeInspector (P7.7, from ui_kits/organism-view)
    routes/               # dashboard shell + route composition (run-launcher, runs-home, final-idea)
  test/{unit,e2e}/
```

Layer dependency direction (top depends on bottom, never reverse):

```
routes → components (core/cards/feedback/observatory/lineage) → state (run-store) → data (REST/SSE client) → packages/contracts (types only)
                                  ↘ styles/tokens (CSS custom properties; consumed via var(), no raw hex/px — design adherence)
```

The dashboard never imports `apps/api` internals; it reads projections through `lib/`. Enforce with a boundary lint where possible — the test *is* the spec for the rule.

<!-- ▲ END EXAMPLE BLOCK [id=module-layout] ▲ -->

## Subagents

See `.claude/agents/README.md` for the canonical inventory + integration points.

<!-- ▼ EXAMPLE BLOCK [id=area-subagent-candidates]: area-specific subagent candidates — list candidates that would earn their keep specifically in this area (e.g. an ABI/types syncer for a frontend area, a Pyth/feed verifier for a contracts area). Build only on real friction. ▼ -->

Candidates (build only on real friction):
- **contracts-types syncer** — when a `packages/contracts` model changes, check the dashboard's projection-consuming components + the API-client types moved with it.
- **a11y/projector linter** — assert status encodings carry shape+label+icon (not color alone) and meet contrast for projector legibility (safety/UX rule 4).

<!-- ▲ END EXAMPLE BLOCK [id=area-subagent-candidates] ▲ -->

## Lessons logged from prior sessions

The full prose for each lesson lives in `apps/web/LESSONS.md`. This index is the compact orientation surface.

**Lesson numbers are stable IDs** — once assigned, they don't change. New lessons get the next sequential number. `/session-end` proposes additions when it detects them; the user approves before the entry is written and a row is added here.

Lessons start at §1.

| # | Date | Topic | Rule (one-liner) |
|--:|---|---|---|
| 1 | 2026-06-21 | [dashboard data seam](LESSONS.md#1) | validate every server payload before view state (typed `PayloadValidationError`; gate non-2xx → typed `TransportError` before parse); SSE ordered/deduped by `sequence` ALONE (monotonic watermark, `occurredAt` never consulted) + non-authoritative (resync from `lastEventId` reaches the same view); inject the transport (fetch/EventSource doubles) → network-free deterministic tests; no `apps/api` import, no secret, opaque ids percent-encoded · pin: `apps/web/test/unit/data/{runClient,sseStream}.test.ts` |
| 2 | 2026-06-21 | [client run-store fold + resync](LESSONS.md#2) | the run-store folds validated events keyed by `sequence` (idempotent monotonic watermark — re-apply/seed-overlap never double-counts); resync after `lastEventId` reaches a fresh-fold state (SSE non-authoritative); retain failure events (not dropped); carry `mode` (live\|replay) on the store, NEVER fold it (identical live/replay fold); the store is a pub-sub AND the sseStream `onEvent` SINK (IoC — wire the stream at integration/P7.14, not in the store); guard the resync cursor before fetch; defer a consumer-less/pairing-ambiguous derivation (in-flight window) to the slice that renders it (P7.7) · pin: `apps/web/test/unit/state/{reducer,resync,runStore}.test.ts` |
| 3 | 2026-06-21 | [build UI from the design-system prototype](LESSONS.md#3) | build the dashboard FROM `docs/doppl-design-system/`: COPY its CSS tokens (consume via `var()`, no raw hex/px — the port may EXCEED the prototype's own adherence, e.g. fix its raw-px StatusBadge to `--space-*`) + PORT components to TS-strict (never import the `.jsx`); the status-map is EXHAUSTIVE over the FROZEN domain enums (contract = authority, prototype = design ref), drift reconciled frozen-wins (omit prototype-only e.g. agenome 'mutated'; add frozen-only e.g. candidate 'culled' + the whole `generation` domain; unknown→neutral); status = shape+icon+label+color never color alone, glyph `aria-hidden` + status in label/`title` · pin: `apps/web/test/unit/components/{status-map,StatusBadge}.test.*` |
| 4 | 2026-06-21 | [run-control = store-derived terminal + idempotent command](LESSONS.md#4) | a run-control (start/stop) is read-via-store / write-via-contract-command (rule #2): terminal/disabled state is DERIVED FROM STORE STATE (`ViewState.entities[runId].status` = latest run-level `RunEventType` ∈ the closed terminal set `{run.completed,run.failed,run.stopped}`; `run.cancelled` is a `RunStatus` not a `RunEventType` → excluded), NEVER optimistically guessed — the only authoritative terminal is the folded `run.stopped/completed/failed`; an in-flight command shows a LOCAL "…ing" disabled status (there is no `run.stopping` event), cleared on settle; pure `isRunTerminal` + `deriveControlState` (precedence terminal>in-flight>errored>idle); issue the idempotent contract command DIRECTLY (`runClient.stopRun`) — repeated/after-terminal clicks are no-ops (API+kernel own dedup, not re-implemented), failures surface `role="alert"`+`aria-describedby` retry-safe; non-destructive (reads store, never mutates — `failures[]`/`entities` ref-equal after), subscribe via `useSyncExternalStore` · pin: `apps/web/test/unit/components/run/{StopControl,runControl}.test.*` |
| 5 | 2026-06-21 | [React-Flow lineage = pure 6→5 mapping + deterministic Dagre + pure in-flight fold; visuals ported](LESSONS.md#5) | render the lineage from the storage-agnostic `LineageGraphProjection` (§10) via a PURE `lineageToFlow` (closed 6 `LineageNodeType` → 5 rendered: critic+check merge, selected-winner = candidate+`status:'selected'` per LESSONS §30, generation = minimal backbone tier node; DROP dangling edges — RF breaks on them); deterministic `@dagrejs/dagre` LR layout (same projection → same positions, incremental on `sequenceThrough`, stale watermark never shown over newer); the in-flight sub-state is a PURE `deriveInFlight(events)` in `lineage/` (NOT the store — resolves the P7.2 deferral LESSONS §2: op-start marker w/o paired completion → working, cleared on completion, live activity feed; replay-equivalent via occurredAt-inverted fold, sequence sole ordering); node-bridge `dataRef ∈ workingEntityIds` + judge-in-sv2 = integration assumptions confirmed at P7.14 / sv3 reconcile; visuals PORTED TS-strict from `ui_kits/organism-view` (no `.jsx`, LESSONS §3), `src/lineage/**` adherence test (var() tokens, Dagre geometry EXEMPT), pixels deferred to P7.15 (RF in happy-dom: ResizeObserver+matchMedia stubs + `<ReactFlowProvider>`); `@xyflow/react` v12 · pin: `apps/web/test/unit/lineage/{lineageToFlow,layout,inFlight}.test.ts` + `LineageGraph.test.tsx` |
| 6 | 2026-06-21 | [dashboard metric panel = pure selector over typed events; read scores verbatim; order by sequence; encode beyond color](LESSONS.md#6) | a metric/score panel derives from the TYPED EVENTS, not the lean run-store `ViewState` (it holds status not metric values, LESSONS §2): a PURE selector (`deriveFitnessSeries`/`deriveGenerationComparison`) folds the `fitness.scored`/`novelty.scored` events (`getEvents`/`getReplay`) into the series — zero/partial-safe (0→empty, 1-gen→renders, never throws); reads `FitnessScore.total`/`NoveltyScore.score` VERBATIM via the frozen schema (never recompute — scoring authoritative, rule #6-adjacent; mismatched payload skipped); orders by first-seen `sequence` (sole ordering → replay-equivalent; NEVER generationId string-sort — ids opaque) grouping on `RunEventEnvelope.generationId` (score payloads carry none; missing-id excluded); encodes pattern(dash)+marker(glyph)+label beyond color (rule #4 / §12) via `chartTheme`, `var()` tokens (chart/layout geometry numerics EXEMPT from the `src/charts` adherence test); hand-rolled SVG = no charting-lib dep; consumed contracts added to the `data/contracts.ts` seam (never `@doppl/contracts` direct); store stays lean (live update wires at P7.14) · pin: `apps/web/test/unit/charts/{chartData,FitnessOverTime,GenerationComparison}.test.*` |
| 7 | 2026-06-21 | [EvidenceRef/trace renders in-tier only, never an external href](LESSONS.md#7) | an `EvidenceRef` (eventId/uri/label/observationId) + Langfuse trace ids render as IN-TIER reference text + `data-*` attrs the shell resolves within the Postgres tier — the dashboard NEVER constructs an external `<a href>` (no `http(s)`, no external Langfuse URL; §9/§4 + rule #9); one shared `EvidenceRefLink`, reused by critic/check/candidate/final-idea · pin: `apps/web/test/unit/panels/evidenceRef.test.tsx` (asserts no `<a>`/`[href]`) |
| 8 | 2026-06-21 | [display emit-only evidence verbatim — NEVER re-derive the decision](LESSONS.md#8) | the dashboard shows critic reviews/check results/scores (emit-only evidence, rule #6 anti-reward-hacking) but NEVER re-derives the decision: critics/checks are evidence, the kernel/judge is authoritative — a selector returns each record VERBATIM (exactly the 7 `CriticReview` fields, no winner/verdict); a check status renders verbatim (`'failed'` despite a high score — never re-judged); the final-idea panel shows the kernel's `status:'selected'` winner + ignores a higher-metric non-selected candidate (never re-ranks) · pin: `apps/web/test/unit/panels/{criticData,checkData,finalIdeaData}.test.ts` (emit-only-verbatim + no-re-selection) |
| 9 | 2026-06-21 | [the shell wires the deferred SSE-store IoC + raw-events FoldState + link-target composition](LESSONS.md#9) | the shell `wireRunStream` = `store.resync()` on mount then `createSseStream({onEvent: store.applyEvent, onError: () => store.poll()})` (P7.2 deferred IoC, LESSONS §2; store = single ViewState sink, shell never re-folds); the panels need raw `RunEventEnvelope[]` the lean store drops → the shell holds a SEPARATE sequence-keyed events FoldState (getEvents seed + live-append); composes the panel set via dataRef/candidateId link targets (link-not-embed); the unfrozen `/health` gets a web-local `RunHealth` Zod schema (MVP — can't touch frozen contracts; LESSONS §34); live-producer confirms (dataRef bridge, run.configured, RunHealth promotion) are merge-time · pin: `apps/web/test/unit/routes/{dashboardWiring,Dashboard}.test.*` |
| 10 | 2026-06-21 | [the e2e smoke = route-intercepted deterministic mock; catches what unit doubles miss; module-stabilize effect deps](LESSONS.md#10) | the §16 happy-path smoke drives the mounted shell with a mocked data-client via Playwright `page.route` (REST fixtures + synthetic `text/event-stream`) — deterministic (locator waits, no sleeps), no live backend; the spec IS the deliverable (run if browsers install, else doc as CI); it CAUGHT a real bug unit tests missed — an inline non-injected default (`eventSourceFactory = url => new EventSource(url)`, a new fn each render) churned the wiring effect's deps → a re-fetch loop cancelling state before commit (unit passed only via INJECTED stable doubles); fix = a module-const default — module-stabilize effect-dep defaults · pin: `apps/web/test/e2e/dashboard-smoke.spec.ts` |
| 11 | 2026-06-23 | [final-idea proof panel labels the transfer-evidence rung from the run MODE — zero-surface presentation, not a re-judgement](LESSONS.md#11) | the §12 final-idea panel labels the transfer-evidence rung live (→"live allowlisted (non-executing)") vs replay (→"replay-backed") from the run `mode` ALONE — the frozen `CheckResult` has no live/replay discriminator, so a per-check field would be forbidden new contract surface; the label is a presentation of mode, NEVER a re-judgement (held-out judge/scoring immutable, rule #6 emit-only); reflects terminal zero-survivors from the existing run-level `RunEventType` (`isRunTerminal`) — never fabricates a winner; new panel props OPTIONAL (existing tests don't churn); winner `evidenceRefs` render in-tier via the shared `EvidenceRefLink` (§7) · pin: `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` |
| 12 | 2026-06-23 | [mocked e2e proves render, not the real web↔API connection](LESSONS.md#12) | a mocked e2e (route-interception w/ consumer-shaped fixtures) proves render NOT the real connection — origin/prefix/response-shape drift silently 404s/PayloadValidationErrors in the real app; a demo UI needs ≥1 web→proxy→REAL-API smoke (child-process the booted+seeded API — creds-free recorded gateway, NEVER import → layer rule #6 holds — + drive Vite's proxy, assert real winner + unbuffered SSE), gated (env flag + skipIf no Docker) so the unit gate stays network-free; KEEP the mocked e2e AND add the real smoke. It caught a material web↔API response-shape drift the mock hid · pin: `apps/web/test/smoke/web-api-smoke.test.ts` |
| 13 | 2026-06-23 | [one-time-fetched projection goes stale; re-fetch on the SSE cadence](LESSONS.md#13) | a live projection rendered from a ONE-TIME fetch stays stale even with live SSE (PD.15 fixed delivery, not the projection rebuild) → the lineage froze at 1 node; re-fetch lineage+health on the SSE cadence (trailing-debounce via an injected `refetchDebounceMs` test-seam + FORCED on terminal, reusing isRunTerminal) leaning on the rebuild-on-read API; run-state stays live via the store-fold (no double-fold); folding the raw feed ≠ rebuilding the projection · pin: `apps/web/test/unit/routes/Dashboard.test.tsx` |
| 14 | 2026-06-23 | [client form mirroring a server ceiling must FETCH the maxima](LESSONS.md#14) | a static client mirror of a server-owned ceiling drifts → spurious 422 (RunConfigPanel CAP_CEILING > deployed .env caps); serve the EXACT authoritative bound via a read route (GET /config/caps = defaultConfig.caps, the same overCapField enforces), fetch + clamp the form to it, static fallback on fetch-fail; rule #1 unchanged (overCapField sole authority, clamp UX-only) · pin: `apps/web/test/unit/components/run/{runConfigForm,RunConfigPanel}.test.tsx` |
| 24 | 2026-06-24 | [deep per-node telemetry lives in EVENTS not the projection — surface it with PURE validate-at-boundary selectors over the fold; emit-only display, no new secret surface](LESSONS.md#24) | the FB deep telemetry (FB.6 raw capture + FB.4 executed temp on llm_call_telemetry; FB.7 query/result on tool_call.finished; FB.8 axisRationales on judge.reviewed) is in the EVENT LOG not the lineage projection → surface it with PURE selectors over the observatory fold events (same as the FV.5a fitness/critic panels, §6), NOT a new API; validate-at-boundary (LlmCallTelemetry/JudgeResult.safeParse, read verbatim, skip malformed defensively so the drawer never crashes); match agenome by payload.agenomeId ?? envelope.agenomeId (generic tool_call payload carries none → envelope), candidate by JudgeResult.candidateId, latest-sequence wins; EMIT-ONLY (rule #6 — display the judge rationale+scores, derive no acceptance, re-rank nothing); no new secret surface (rule #4 — the captures were already scrubbed+truncated at persistence, render the safe text); pure → replay-identical (rule #7); add LlmCallTelemetry/JudgeResult to the web contracts barrel; reachability caveats are pre-existing not FV.5b bugs (FB.7 detail needs toGenerationGateway Phase-D wiring; FB.6/8 appear on a live run) · pin: `apps/web/test/unit/{panels/nodeTelemetry,components/run/NodeInspectorContent}.test.tsx` · accepted: convention (event-derived deep-telemetry inspector) |
| 23 | 2026-06-24 | [wiring the FB run-controls into the launcher = ADD to the pure form mapping (omit-when-default → byte-identical baseline) + render from the closed-enum source; a dedicated screen COMPOSES the panel + a prompt-source picker; repoint /launch + update prior route tests](LESSONS.md#23) | the FB run-controls (FB.0's optional RunConfig generationOperators/generationBias) wire in two layers: (1) the PURE form mapping (runConfigForm) gains operators:GenerationOperator[] + generationBias:number, threaded ADDITIVELY in buildRunConfig — operators only when ≥1 (contract min(1).optional → empty omitted), bias only when ENGAGED (!==0) → a default launch is byte-identical to the pre-FB shape + recorded==set (matches FB.4 mergePerRunConfig); no new validateForm branch (the frozen RunConfig Zod validates the optionals, the dial clamps [-1,1]); (2) UI: operator checkboxes over GenerationOperator.options (single closed-enum source, never hardcoded) + a range dial [-1,1] step 0.1 with the numeric value + diverge/converge/neutral label (DS rule 1/4, never position/color alone) + aria-valuetext; both bias GENERATION only (no judge/scoring lever, rule #6); the dedicated S1LauncherScreen COMPOSES the FB-equipped RunConfigPanel + a getProblemSets quick-pick (failed/empty fetch still allows freeform — DS honesty), keyed-remount prefills the seed; repoint /launch off the interim Dashboard + UPDATE the prior FV.1/FV.2 router tests (run-list assertion moves to S0, cf §17); read-only (rule #9), ZERO contract · pin: `apps/web/test/unit/{components/run/runConfigForm,components/run/RunConfigPanel,routes/S1LauncherScreen}.test.tsx` · accepted: convention (launcher run-controls wiring) |
| 22 | 2026-06-24 | [a replay step-scrubber re-folds events[0..N] with the existing PURE foldEvents (no server call/provider, rule #7); replay-only so the live path is provably unchanged](LESSONS.md#22) | a replay scrubber needs no new mechanism — foldEvents is a pure reduce so foldAtStep(events,n)=foldEvents(events.slice(0,clamp(n,0,len))) gives the FoldState at step n client-side (no refetch/provider, rule #7); the fold-derived panels (ticker + fitness/energy charts) rewind cleanly; gate REPLAY-ONLY: panelEvents = isReplay ? foldAtStep(...).events : fold.events → LIVE uses the identity fold (foldAtStep never called) so the live path is provably unchanged; default to the END (scrub back); the projection-derived lineage node-STRUCTURE stays full (a prefix rewinds the in-flight overlay, not the node set — honest limitation, per-step reconstruction is later); read-only pin asserts getEvents call-count unchanged + no command call (rule #9) · pin: `apps/web/test/unit/routes/replayScrubber.test.ts` · accepted: convention (replay scrubber / pure prefix-fold) |
| 21 | 2026-06-24 | [a dedicated DS payoff/screen slice COMPOSES already-shipped panels + REPOINTS the interim route (repoint-don't-orphan; update the prior route test)](LESSONS.md#21) | a dedicated DS screen for a route an earlier slice interim-mounted = RE-HOME + COMPOSE (mirrors FV.4): a new route component takes {runId,runClient,mode?,+seams} + wires data via the shared useRunObservatory hook (terminal forces the final re-fetch) + COMPOSES already-shipped panels (FinalIdeaPanel + the generational-climb chart) — assert the composition + route wiring + read-only/replay, NOT the panel internals (panel-tested, don't duplicate); winner = kernel-marked 'selected' node via selectWinner (PD.11 bridge, zero surface, rule #6 emit-only, terminal zero-survivors honest); REPOINT the interim route (don't orphan) + update the prior route test; a read-only pin asserts startRun/stopRun/startDemoRun NOT called (rule #9) + both-directions mode-label parity (rule #7) · pin: `apps/web/test/unit/routes/S5FinalIdeaScreen.test.tsx` · accepted: convention (compose + route-repoint) |
| 20 | 2026-06-24 | [two impls in ONE shared worktree/index → scope the COMMIT with `git commit -- <paths>`, not just `git add`](LESSONS.md#20) | api+web impls sharing the track/frontend-v2 worktree share ONE index → "explicit git add <path>, never -A" stops staging the WRONG files but a bare `git commit` still captures the sibling impl's pre-staged entries + the orch's uncommitted doc hot-writes; scope the COMMIT itself (`git add <mypaths> && git commit -- <mypaths>`) → only those paths, sibling-staged + unstaged tree intact (sequence-independent) · accepted: convention (shared-worktree git hygiene) |
| 19 | 2026-06-24 | [live-telemetry panels = pure event-derived selectors over the SSE fold; health STATUS is a client-side last-event-age threshold](LESSONS.md#19) | wire live-telemetry panels (ActivityTicker/HealthIndicator/RunEnergyGauge) as PURE selectors over the useRunObservatory fold, no new state/fetch: deriveTickerEvents orders by sequence ASC (never occurredAt) + reads type/occurredAt/actor verbatim (actor=required role enum, machine-truth) + unknown-type→fallback row; toHealthSummary maps RunHealth (lastEventAgeMs NaN-guarded, null-safe) with an injected nowMs so the selector stays pure; deriveHealthStatus is a CLIENT-SIDE last-event-age threshold (the signal + exhaustion/terminal stay kernel/API, rule #2); RunEnergyGauge budget `?? 0` + the `>0` guard pin no-NaN; render a derived-but-unrendered series only when it can't widen the axis (mean≤best, no churn); read-only rule #9, replay-identical rule #7 · pin: `apps/web/test/unit/routes/observatoryTelemetry.test.ts` · accepted: convention (telemetry selectors) |
| 18 | 2026-06-24 | [a multi-pane shell re-homes tested live wiring via a SHARED hook; derive the roster from the projection (no new API); build the inspector drawer as a SLOT before content](LESSONS.md#18) | build the 3-pane centerpiece by COMPOSING reused pieces: extract the tested live wiring (store/useSyncExternalStore fold + wireRunStream SSE + the PD.20 coalesced-debounce/forced-on-terminal re-fetch + selectedCandidateId) into a SHARED useRunObservatory hook the shell consumes (NOT a duplicated effect — one tested place; the prior monolith keeps its inline copy as a KNOWN TEMPORARY dup, flagged Carry-forward not silent drift); derive the agent roster from lineage.nodes.filter(agenome)+fold (NO new API; show only what the LineageNode carries — status badge, energy Meter only if node.metrics has it, machine-truth); build the inspector drawer as a SLOT (open/close + empty placeholder) BEFORE its content (FV.5 wires node-click→body); a pass-through hook seam needs `?: T \| undefined` under exactOptionalPropertyTypes; read-only (rule #9), ZERO contract · pin: `apps/web/test/unit/routes/S2OrganismView.test.tsx` + `components/run/{AgentRoster,InspectorDrawer}.test.tsx` |
| 17 | 2026-06-24 | [S0-style list screen renders machine-truth-minimal off the summary projection; status-derived actions; screen-replacement preserves the demo (repoint, don't orphan) + updates prior tests](LESSONS.md#17) | render list/home cards machine-truth-MINIMAL off the summary projection (RunSummary {runId,status,sequenceThrough} — no title/energy/winner, so show exactly that; DS rule 5, never fabricate; rich enrichment = backend/lazy-fetch TODO); per-card actions are STATUS-DERIVED (live→Open; completed/stopped→Replay+Final; failed→Replay; configured/null→none — pure fn of status); a screen-REPLACEMENT slice (a) preserves the demo when taking over a route — repoint the dangling start affordance (/launch→interim launcher, not a redirect-to-/ loop) rather than orphaning the prior panel (RunListPanel stays reachable, no dead-code finding §96), and (b) UPDATES the prior slice's tests that pinned the old route behavior (the /+/launch repoint broke FV.1 router/app-shell assertions → retargeted; keeping the suite honest, not scope creep); read-only (rule #9), ZERO contract · pin: `apps/web/test/unit/{routes/RunsHomeScreen,components/run/RunCard}.test.tsx` |
| 16 | 2026-06-24 | [router integration: observed run/mode URL-derived; runClient app-level via context; theme on document.documentElement+localStorage; existing screen per-route until dedicated screens land](LESSONS.md#16) | route a single-mount app without rebuilding screens: observed run+mode become URL-derived (/runs/:id + /replay; route wrapper key=`${mode}:${id}` remounts per URL so state tracks the address bar — back/fwd/bookmark work); runClient stays app-level via RunClientProvider/useRunClient (THROWS outside provider, no silent null); theme class on document.documentElement (:root.hc/.light = DS scopes, dark=no class) + localStorage['doppl-theme'] + dark default on unset/invalid; mount the existing monolithic screen per-route (Dashboard gains OPTIONAL onObserveLive/onObserveReplay→navigate, internal observe-state kept as fallback so tests don't churn) + interim redirects (/launch→/, /runs/:id/final→Dashboard) until the dedicated DS screens (FV.2+) replace each route — preserves the working demo; ZERO contract surface · pin: `apps/web/test/unit/app/{router,AppShell,ThemeToggle,RunClientProvider}.test.tsx` |
| 15 | 2026-06-24 | [DS components port .jsx→TS-strict .tsx by hand; token-only; ds/index.ts = canonical import surface](LESSONS.md#15) | the DS kit ships .jsx/.d.ts DESIGN REFERENCES not prod source → hand-translate to TS-strict .tsx (never import the prototype, which carries raw-px the rules forbid); token-only var(--token) (raw-px→--space-*/--motion-*; bare numeric geometry EXEMPT per the lineage/charts precedent — the regex matches strings not geometry literals); status maps exhaustive over frozen enums (unknown→neutral); ds/index.ts named re-exports = the canonical FV.1+ import surface, shared primitives reconciled IN-PLACE + re-exported (zero import churn); a reconcile adding a positioned root for z-index (ModeBanner position+zIndex) verified vs the live mount (Dashboard.tsx:227); a DS-prototype hardcoded duration the token set lacks → ADD a named token (--motion-shimmer-ms), never reuse a semantically-different beat (rule 4); pure presentation, ZERO contract surface · pin: `apps/web/test/unit/components/ds/{core,feedback,observatory,adherence}.test.{tsx,ts}` |

<!-- Each row links to its `LESSONS.md` anchor. -->
