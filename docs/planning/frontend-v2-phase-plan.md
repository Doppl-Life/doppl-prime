# Frontend v2 — Phases FB (backend controls) + FV (app shell + DS screens) — PLAN DRAFT

> **Status: DRAFT for user review.** On approval this folds into `IMPLEMENTATION_PLAN.md` as two new phases (track `frontend-v2`, tasks `FB.N` backend + `FV.N` web — mirrors the `PD.N` convention). Nothing here is built yet.
>
> **One-line goal:** refactor `apps/web` from the single scrolling Dashboard into a real multi-screen application — Runs Home · Launcher · Organism View · Final Idea — matching the Doppl design system. The presentation rebuild (FV) reuses the *existing* tested data layer (runClient, SSE, reducer, React-Flow lineage); a backend phase (FB) first adds the three new run controls the mockup introduces (mutagen operators, diverge/converge dial, per-run/local model selection) — built to the safety invariants, not as cosmetic knobs.

---

## Binding references (both are authoritative)

1. **`/docs/doppl-design-system`** — the DS kit. Read `readme.md` + `SKILL.md` first; `doppl-design` is a user-invocable skill. Provides: dark "bioluminescent observatory" tokens, **15 React components**, clickable HTML prototypes of **S0 Runs Home / S1 Run Launcher / S2 Organism View / S5 Final Idea**, and the canonical fixture `run_7f3a`.
2. **The user's richer 3-pane mockup** (shared 2026-06-24) — the layout the user explicitly likes: **left** seed form + "THE DIAL" run controls + MUTAGEN-SKILL operators · **center** living graph with every node labelled by its idea title · **right** deep INSPECTOR (judge axes + rationale, novelty/grounding meters, TRACE). Header: local-model selector + Providers/Proof-board/Analyze/Insights/Export.

**The five DS rules (non-negotiable, enforced every slice):**
1. Status = shape + icon + label + color (never color alone) — use `StatusBadge`; quantities use `Meter` (length is truth, number shown).
2. LIVE vs REPLAY unmistakable — `ModeBanner` at top z-layer; live = cyan breathing, replay = amber hatched static.
3. Dark observatory, calm chrome — one accent ("living cyan"); only living/important things glow; no gradient decoration, no emoji.
4. Motion is meaningful, never decorative — named tokens; always honor `prefers-reduced-motion`.
5. Machine truth is verbatim — snake_case ids/status in JetBrains Mono; **scores normalized 0–1**; tell the truth about degraded data.

---

## Reuse inventory — what already works (do NOT rebuild)

The Phase-6/7/D work left a tested data + graph layer. Frontend-v2 **keeps all of it** and rebuilds the shell/screens/skin on top:

| Layer | File(s) | Disposition |
|---|---|---|
| REST client (9 GET projections + 2 commands + demo helpers) | `data/runClient.ts` | **reuse as-is** |
| SSE stream + event fold + reducer + run store | `data/sseStream.ts`, `state/{runStore,reducer,resync}.ts` | **reuse as-is** |
| React-Flow + Dagre lineage graph | `lineage/{LineageGraph,layout,lineageToFlow,nodeTypes}.tsx` | **reuse**; add node-click `onSelect`, idea-title labels |
| Panel logic (candidate, critic gauntlet, subtype, final idea, energy) | `panels/*`, `charts/*` | **reuse logic, re-skin** to DS components |
| DS tokens (full set) + StatusBadge + ModeBanner | `styles/tokens/*`, `components/core/StatusBadge`, `components/feedback/ModeBanner` | **already ported** — reconcile against DS source |

**What's missing (the actual frontend-v2 work):** a router (no `react-router-dom` today — single `<Dashboard>` mount); the other ~9 DS components ported to production `.tsx`; the four DS *screens* as real routes; node-click → inspector drawer wiring (today `onSelect` is a no-op); ActivityTicker + agent roster in production; the 3-pane Organism layout.

---

## Backend reconciliation — wire-to-existing vs needs-new

**Wire-to-existing-backend (data already exists — pure presentation):**
- Run list / open / replay / final idea — `listRuns · getRun · getReplay · getLineage · getCandidate`
- Start (operator prompt `startDemoRun`, full config `startRun`) / stop (`stopRun`)
- Live SSE → lineage growth, health, energy, fitness-over-time, critic gauntlet, subtype checks, final idea
- Node-click inspector — lineage projection + `getCandidate` (just needs wiring)
- Caps with hard-max — `getCapMaxima`; model routes (read-only) — `listModelRoutes`

**Needs-new-backend / contract — DECISION 1 = FULL-FEATURE (user, 2026-06-24).** These become a real backend phase **FB** (below), built BEFORE the FV.3 launcher wires to them. Each is bounded by the safety invariants:
- **Mutagen-skill operators** (breakthrough / first-principles / polymath / breakout / blindside / subtraction / constraint) — modeled as **generation-time ideation strategies**: when an agenome generates, the selected operator(s) shape the generation prompt as **rule-#5 isolated DATA** (never instructions). New `RunConfig` surface; caps/energy stay kernel-enforced (rule #1/#8) — an operator can't bypass a cap.
- **Diverge/converge dial** — a **generation-time bias only**: it leans what agenomes *produce* (novelty-seeking ↔ grounding-seeking). ⚠️ **It does NOT touch the held-out judge, its rubric, or the scoring policy (safety rule #6 — the floor the organism cannot lift).** The judge rubric + scoring policy stay byte-identical regardless of the dial; an FB invariant test asserts this. (The chosen option's preview said exactly this: "gen-HINT, not a judge/scoring change.")
- **Local-model (ollama) selection** — a new **provider adapter behind the ModelGateway** (rule #9) + a per-run, allowlist-clamped model-route override. Keys/secrets stay server-side (rule #4); replay reconstructs from the persisted route with no provider calls (rule #7).
- **Header actions** (Providers / Proof-board / Analyze / Insights / Export) — Export ≈ the existing dump-replay script; the rest are **deferred** (net-new surfaces, not in FB/FV scope unless separately requested).
- **Judge-axes label/scale mismatch** — mockup shows Novelty/Grounding/**Falsifiability/Cost-efficiency/Relevance** on **−5..+5**; the frozen contract's judge produces grounding/novelty/**feasibility/falsification_survival/subtype_check_pass** on 0–5 (UI 0–1). **Plan default (settled): render the contract's real axes at 0–1** (DS readme score-scale note). Inventing Cost-efficiency/Relevance would fabricate machine-truth the judge never produced (rule #5/#6).

---

## Phase FB — backend extensions for frontend-v2 (runs BEFORE FV.3)

> Two clusters: **new run controls** (FB.0–FB.5) + **deep telemetry capture** (FB.6–FB.8). Touches the **frozen contract** (`packages/contracts`) → a schemaVersion amendment under the **announce-before-merge protocol** (`docs/runbooks/cross-track-contract-coordination.md`). Safety-invariant slices (FB.4) are never bundled with feature work. All of FB is deterministic → `/tdd`, integration against a real Postgres event store. **The redaction scrub (rule #4) runs over every new persisted field; replay reads persisted telemetry, never re-fetches (rule #7); every payload stays under the 1 MiB ceiling.**

**Cluster A — new run controls:**
- **FB.0 — contract amendment.** Extend `RunConfig` with `generationOperators?` (allowlisted enum of the 7 mutagen skills), `generationBias?` (bounded scalar, the diverge/converge hint — a **generation** input, recorded as such), `modelRouteOverride?` (per-role, allowlist-clamped). Add an `ollama` provider id + capability flags. Also extend the telemetry surfaces (FB.6–8 fields below) in the same amendment. schemaVersion bump. *TDD: schema + boot config-validation; the dial value is a recorded generation input, the ScoringPolicy/FinalJudgeRubric schemas UNCHANGED (assert).*
- **FB.1 — ollama gateway adapter.** New provider adapter behind the ModelGateway (rule #9): structured-output + embedding capability, validate/repair/reject path, no SDK import into domain/runtime (rule #9), keys server-only (rule #4). Allowlist the provider. *TDD: adapter I/O validation + the no-leak boundary.*
- **FB.2 — per-run model-route override.** `RunConfig.modelRouteOverride` clamped to an allowlist of {role → permitted models}; kernel/gateway honor it; replay reconstructs from the persisted route (rule #7 — no provider calls). *TDD: override resolution + clamp + replay-determinism.*
- **FB.3 — mutagen-operators in generation.** Selected operator(s) shape the generation prompt as rule-#5 isolated DATA (sentinel-delimited, never interpolated as instructions); recorded as a generation input; caps/energy untouched (rule #1/#8). *TDD: operator→prompt-assembly deterministic; injection-isolation; an operator cannot raise a cap.*
- **FB.4 — diverge/converge generation bias (SAFETY-INVARIANT slice, never bundled).** The dial biases the generation step (population_generator persona/prompt leans novelty ↔ grounding). **Explicitly NOT the judge/scoring/rubric.** *TDD: bias→generation-input deterministic; **invariant test: the held-out judge rubric + scoring policy are byte-identical for dial=diverge vs dial=converge** (rule #6 anchor unmoved).*
- **FB.5 — `/phase-exit FB`** + announce-before-merge → merge to cody. Security-reviewer INVARIANT on FB.3/FB.4/FB.6.

**Cluster B — deep telemetry (the "see its reasoning / tool calls / judge rationale" depth; user-requested 2026-06-24):**
- **FB.6 — raw reasoning/response capture (SECRET-SURFACE slice, security-reviewer INVARIANT).** Persist each agenome's raw model response (+ provider-returned reasoning where present) as a new event / provenance field correlated to `candidate.created`. **The validated structured candidate stays authoritative (rule #5 unchanged)** — this is an explainability side-record, never re-parsed into domain state. **The redaction scrub runs over it BEFORE append (rule #4)**; bounded by the 1 MiB ceiling (truncate-with-marker on overflow, never silently). Replay reads it, no provider call (rule #7). *TDD: capture→scrub→persist; ceiling truncation; replay-determinism; no-secret assertion.*
- **FB.7 — tool-call detail.** Enrich `tool_call.started/finished` payloads with the actual `query` + (redacted) `results` instead of just `toolName`. Scrub + ceiling as above. *TDD: detail capture + redaction + replay.*
- **FB.8 — judge per-axis rationale.** `JudgeResult` gains `axisRationales` (record axis→string); the held-out-judge prompt emits a one-line rationale per axis. **Safe re rule #6** — it *explains* the floor, never lets an agent move it (the rubric/weights/immutability anchor are untouched; assert). *TDD: judge output gains rationale, schema-validated; rubric immutability unchanged.*

**FB → FV edge:** FV.0/FV.1/FV.2 are backend-independent (can run in parallel with FB). **FV.3 (Launcher) depends on FB.0–FB.4**; **FV.5 (inspector) surfaces FB.6/FB.7/FB.8** (reasoning transcript, tool-call detail, judge rationale); FV.6 surfaces operator/bias/model as machine-truth in the roster.

---

## Slice decomposition — Phase FV (TDD-sliced; each tagged backend-exists vs needs-new)

> Posture: **most of frontend-v2 is deterministic-testable** (render, routing, selection, clamp, fold-derivations) → `/tdd`. Visual/projector-legibility + motion are design-fixture / `/design-review` (gstack `/qa`, `/design-review`), not unit assertions. Safety-touching slices (the dial) are never bundled with feature work.

- **FV.0 — DS component port.** Port the remaining DS components from `/docs/doppl-design-system/components` into `apps/web/src/components/ds/` as production `.tsx`: Button, Meter, SystemState shells (Empty/Loading/Error/Degraded), CandidateCard, AgenomeCard, ActivityTicker, HealthIndicator, RunEnergyGauge. Reconcile the already-ported StatusBadge/ModeBanner against DS source. *TDD: render + status-encoding invariants (shape+icon+label, 0–1 meters, reduced-motion fallback). Backend: none.*
- **FV.1 — App shell + router.** Add `react-router-dom`; routes `/` (S0) · `/launch` (S1) · `/runs/:id` (S2) · `/runs/:id/final` (S5) · `/runs/:id/replay` (S2 replay). Global chrome: `◆ Doppl` wordmark, ModeBanner slot, theme toggle (dark/hc/light, localStorage). *TDD: routing + nav. Backend: none.*
- **FV.2 — S0 Runs Home.** `listRuns` → run cards (status badge + sequence); actions Open live / Replay / Final idea; New Run CTA → `/launch`; empty/loading/error states. *TDD: list render + action routing (inject runClient). **Backend: EXISTS.*** *(the user's "run history page where you can go replay it")*
- **FV.3 — S1 Run Launcher.** Dedicated screen: prompt source (prepared `getProblemSets` or freeform seed), subtype toggles, caps clamped to `getCapMaxima`, **+ the new FB controls: mutagen-operator picker, diverge/converge dial, per-run model selection (incl. ollama)**. Start → navigate to `/runs/:id`. *TDD: form validation + clamp + start command. **Backend: NEEDS-NEW — depends on FB.0–FB.4.***
- **FV.4 — S2 Organism View shell (the 3-pane centerpiece).** Left rail (controls + roster) · center (reused `LineageGraph`, live) · right (inspector drawer). Re-home the tested Dashboard SSE/lineage/health/energy wiring (incl. the PD.20 live re-fetch) into the 3-pane shell. *TDD: layout + live-update wiring. **Backend: EXISTS.***
- **FV.5 — Node-click inspector drawer (S3/S4) + deep telemetry.** Wire `LineageGraph` node `onSelect` → right drawer: agenome inspector (persona weights, system prompt, tools, energy "failed attempts not debited", parents, candidate produced, **+ FB.6 raw reasoning/response transcript, + FB.7 tool-call query/results timeline**) or candidate inspector (idea, transfer mapping, fitness breakdown 0–1, subtype checks, the critic gauntlet with written critiques, **+ FB.8 judge per-axis rationale**). Reuse CandidateInspector/CriticGauntletPanel logic. *TDD: node→detail selection + render (`getCandidate` injected). **Backend: EXISTS for the structured fields; FB.6–8 for the deep telemetry.*** *(the user's "click a node and see the details / its reasoning, tool calls, and the judge's rationale")*
- **FV.6 — Live observatory telemetry.** ActivityTicker (kernel event feed off the SSE fold), agent roster (per-agenome status from lineage), RunEnergyGauge, HealthIndicator, fitness climb. *TDD: ticker ordering + roster derivation. **Backend: EXISTS.*** *(the user's "see what each agenome/agent's process was")*
- **FV.7 — S5 Final Idea / payoff.** Winner card, generational climb (gen-0 → winner Δ), the gauntlet + judge it survived, transfer check live/replay label, evidence links. Reuse FinalIdeaPanel + the PD.11 `finalIdeaRef`→`selected` bridge. *TDD: winner selection + climb. **Backend: EXISTS.***
- **FV.8 — Replay scrubber (S6) + mode polish.** Replay entry S0→S2 in REPLAY mode (amber/hatched/static); step scrubber over persisted events (`getReplay`/`getEvents`). *TDD: scrubber over fold. **Backend: EXISTS** (replay calls no providers — rule #7).*
- **FV.9 — `/phase-exit FV` + polish.** Arch-drift + reachability fan-out; projector-legibility + a11y + reduced-motion pass (`/design-review`, `/qa`); merge to cody.

## Decisions (resolved)

1. **(LOAD-BEARING, RESOLVED — user 2026-06-24) Mockup's extra concepts → FULL-FEATURE.** Mutagen operators, diverge/converge dial, ollama selector are built as real backend surface in **Phase FB** (before FV.3), bounded by rules #1/#4/#5/#6/#9 as specified above.
2. *(default)* **Judge axes** → contract's real 5 axes at 0–1, not the mockup's relabeled −5..+5. Honors rule #5/#6.
3. *(default)* **Rebuild strategy** → *evolve* (keep the tested data layer + graph + panel logic, rebuild shell/screens/skin), not greenfield.
4. *(default)* **Build line** → fresh track `frontend-v2`, worktree `../Capstone-frontend-v2` on `track/frontend-v2`, branched off `cody`.

---

## Sequencing + team to build it (on approval)

Two code areas now (backend FB + web FV) → a team with **both** a backend implementer and a web implementer, one orchestrator, this lead. Track `frontend-v2`, worktree off cody.

- **FB** (backend implementer) and **FV.0 / FV.1 / FV.2** (web implementer) run **in parallel** — they don't depend on each other.
- **FV.3** waits on FB.0–FB.4 (the launcher wires the new controls); FV.4–FV.9 follow.
- Contract amendment (FB.0) uses the **announce-before-merge protocol**.
- Each slice TDD-sliced + wired to real data + reviewed against the DS five rules; `security-reviewer` INVARIANT on FB.3/FB.4; `/design-review` at the phase-exit gate for projector legibility.

**Rough size:** FB = ~9 backend slices (contract amendment + gateway adapter + 3 control features + 3 telemetry captures + exit); FV = ~10 web slices. Notably bigger than Phase D — a multi-session, multi-cycle effort across two code areas.
