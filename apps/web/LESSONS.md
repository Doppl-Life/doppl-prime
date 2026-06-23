# LESSONS.md — Doppl (the React dashboard)

> Full prose for every lesson logged during work in `apps/web/`. The compact index lives in `apps/web/CLAUDE.md` "Lessons logged" table.
>
> **Lesson numbers are stable IDs.** New lessons get the next sequential number. Numbers may be referenced from code comments, commit messages, and cross-references between lessons. **Don't reorder; don't reuse a deleted number's slot.**
>
> **Lessons start at §1.** Each code area has its own lesson sequence — lessons don't carry across code areas.

---

## Lesson format

```markdown
## <a id="N"></a>N. <Short topic> — <one-line rule>

**Date:** YYYY-MM-DD.
**Source slice:** <slice-id or commit hash>.

<2-5 paragraphs explaining: what was discovered, why it matters, how to
apply the rule, what edge cases are still open. Cite file:line references
where applicable.>

**Rule:** <one-sentence summary, same as the heading subtitle>.
```

---

## <a id="1"></a>1. The dashboard data seam validates every server payload before view state, orders SSE by sequence ALONE, and injects its transport

**Date:** 2026-06-21.
**Source slice:** P7.1 (`demo-003`; commit hash recorded at round close); `apps/web/src/data/{contracts,errors,runClient,sseStream}.ts`.

The dashboard is **read-only over projections** (safety rules #2/#9) and the data seam is where untrusted server bytes become typed view state — so the discipline lives here:

- **Validate every payload before view state.** Every REST read and every SSE event is parsed through the Zod schema (re-exported from `@doppl/contracts` via a single `contracts.ts` seam — never redefine a shape) BEFORE it reaches view state; a validation failure is a typed `PayloadValidationError`, never a raw throw or corrupt state, and the run stays inspectable via the other projections.
- **Gate the transport before the parser.** A non-2xx response is a typed `TransportError` checked via `res.ok` BEFORE parsing — otherwise a `404` body like `[]` false-accepts as valid data (the [medium] caught + fixed in-slice). Transport failure and schema failure are distinct typed errors.
- **SSE is ordered by `sequence` ALONE + non-authoritative.** Apply an event iff `sequence > lastApplied` (a monotonic watermark); anything `≤` the watermark — a duplicate OR a late lower sequence — is dropped; `occurredAt` is never consulted. `lastEventId == lastApplied` so a reconnect resumes from the watermark; dropping the stream loses nothing (a REST resync reaches the same view). Gap-triggered auto-resync is the run-store's job (P7.2), not the stream's.
- **Inject the transport.** `createRunClient({fetch})` / `createSseStream({eventSourceFactory})` default to the browser globals in prod and take fakes in tests — the client is network-free + deterministic, driven by fixtures + `@doppl/contracts` `CANONICAL_FIXTURES`.
- **No backend coupling, no secret, opaque ids encoded.** The seam imports no `apps/api` internals (rule #9), fetches/renders no provider key (rule #4), and percent-encodes opaque id path segments (never raw-concatenates — ids are untrusted bytes).

**Rule:** In the dashboard data seam, Zod-validate every server payload before view state (typed `PayloadValidationError`; gate non-2xx to a typed `TransportError` before parsing); order/dedupe SSE by `sequence` alone (monotonic watermark, `occurredAt` never consulted) and treat it as non-authoritative (resync from `lastEventId`); inject the transport (fetch/EventSource doubles) for network-free deterministic tests; import no `apps/api` internals, ship no secret, percent-encode opaque ids.

## <a id="2"></a>2. The client run-store folds validated events keyed by sequence (idempotent); resync reaches a fresh-fold; mode is carried not folded; the store is a pub-sub AND the SSE sink (IoC)

**Date:** 2026-06-21.
**Source slice:** P7.2 (`demo-006`; commit hash recorded at round close); `apps/web/src/state/{reducer,resync,runStore}.ts`.

The client run-store is the state layer over the §1 data seam, and its discipline:

- **Fold validated events keyed by `sequence`, idempotently.** The reducer applies an event iff `sequence > lastApplied` (a monotonic watermark) — so re-applying a seen sequence, or a seed-then-deltas overlap, never double-counts. The fold is the source of truth: initial load folds `GET /runs/:id/events`; "a fresh full load" = folding all events; **resync** fetches events after `lastEventId` and reaches **the same state a fresh fold would** (SSE non-authoritative — drop-and-resync is equivalent to an uninterrupted stream). Polling fallback applies new events without losing applied state.
- **Retain failure events; don't fold the mode.** The 7 failure event types are **retained + surfaced** (partial evidence stays visible), never dropped. `mode` (live|replay) is **carried on the store, not folded into the reducer** — live and replay events fold **identically** (the reducer takes no mode param), so the same log produces the same state regardless of source.
- **The store is a pub-sub AND the SSE sink (inversion of control).** `createRunStore({runId, runClient})` exposes `getState`/`getMode`/`subscribe`/`applyEvent`/`resync`/`poll`. It does **NOT** construct the SSE stream — it *provides the `onEvent` sink* (`createSseStream({onEvent: store.applyEvent, onError: () => store.poll()})`), and the connector is wired at integration/P7.14. This decouples the store from stream construction → testable in isolation with injected doubles.
- **Guard the resync cursor.** `assertValidCursor` rejects a non-numeric/negative `sinceSequence` BEFORE any fetch (defense-in-depth on the one new input).
- **Defer ambiguous derivations to their consumer.** The §12 in-flight node sub-state was deferred to P7.7 (where it's rendered + tested) because it has no P7.2 consumer and the start↔completion marker pairing is genuinely ambiguous (`judge.review_started` has no paired completion) — build it where it's consumed and the pairing can resolve, not speculatively.

**Rule:** The client run-store folds validated events keyed by `sequence` (idempotent monotonic watermark — re-apply/seed-overlap safe); resync after `lastEventId` reaches a fresh-fold state (SSE non-authoritative); retain failure events; carry `mode` on the store, never fold it (identical live/replay fold); make the store a pub-sub AND the SSE `onEvent` sink (IoC — wire the stream at integration); guard the resync cursor; and defer a consumer-less / pairing-ambiguous derivation to the slice that renders it.

## <a id="3"></a>3. Build the UI FROM the design-system prototype: COPY tokens + PORT components TS-strict; the status-map is exhaustive over the FROZEN enums (contract is authority, prototype is the design ref)

**Date:** 2026-06-21.
**Source slice:** P7.3 (`demo-008`; commit hash recorded at round close); `apps/web/src/styles/tokens/`, `apps/web/src/components/core/{StatusBadge.tsx, status-map.ts}`.

The dashboard UI is built FROM the committed `docs/doppl-design-system/` prototype, and the consumption discipline (from its `SKILL.md`):

- **COPY tokens, PORT components — never import the `.jsx`.** Copy `tokens/*.css` (+ the woff2 fonts) into `apps/web/src/styles/tokens/`, barrel them, import once at the app root (live app-wide, incl. the `.hc` high-contrast block + projector-legible sizes). PORT each `.jsx` component to **TS-strict** (implement the prototype's prop interface verbatim) — do NOT import the prototype's `.jsx` (it's a reference; its adherence linter forbids internal-path imports).
- **Adherence: `var()` tokens only, no raw hex/px** (pinned by a structural test over the component source). The production port may be **MORE adherent than the prototype reference** — the prototype's own `StatusBadge.jsx` used raw-px strings (`padding:"3px 8px"`), and the port fixes them to `--space-*` tokens (snapping off-grid 3px → the 4px grid; 1px delta, imperceptible; projector floor preserved). Fix the reference's imperfections in the port; record them as prototype-fidelity notes.
- **The status-map is EXHAUSTIVE over the FROZEN domain enums** — the **contract is the authority** for which statuses exist, the prototype is the **design reference** for how they look. A test iterates `Object.values(<enum>.enum)` for all six domains so a new enum value fails loudly. **Reconcile drift frozen-wins:** omit a prototype-only state not in the frozen enum (agenome `'mutated'` — mutation is a reproduction mode, not an agenome status); ADD a frozen-only state the prototype missed (candidate `'culled'`); ADD a whole domain the prototype lacked (`generation` 8-state, glyphs derived from the prototype's visual vocabulary); unknown/unmapped → a **distinct neutral indicator** (never throw/blank).
- **Status is shape + icon + label + color, never color alone** (colorblind-safe); the glyph is `aria-hidden`, the status is carried by the text label / `title` so it's programmatically determinable.

**Rule:** Build the dashboard UI FROM the design-system prototype — COPY its CSS tokens (consume via `var()`, no raw hex/px; the port may exceed the reference's own adherence) + PORT its components to TS-strict (never import the `.jsx`); make the status-map exhaustive over the FROZEN domain enums (contract = authority, prototype = design ref), reconciling drift frozen-wins (omit prototype-only, add frozen-only/missing-domain, unknown→neutral); encode status as shape+icon+label+color (never color alone), glyph `aria-hidden`, status in label/`title`.

## <a id="4"></a>4. A run-control's terminal/disabled state is DERIVED FROM STORE STATE (never optimistically guessed); the UI issues the idempotent contract command and lets the API+kernel own dedup/terminal

**Date:** 2026-06-21.
**Source slice:** P7.6 (`demo-015`; commit hash recorded at round close); `apps/web/src/components/run/{StopControl.tsx, runControl.ts}`. Generalizes the P7.5 run-config cap-max convention to the **read/command** side.

A run-control (start, stop, …) is a **read-via-store / write-via-contract-command** component (safety rule #2 — the dashboard mutates authoritative state ONLY via the contract's idempotent commands; the API + kernel are the authoritative guard, never re-implemented client-side):

- **Terminal/disabled state is DERIVED FROM STORE STATE, never optimistically guessed.** The run entity's latest **run-level `RunEventType`** is the truth (`ViewState.entities[runId].status` — run-level events carry only `runId`, so they resolve to the run entity): terminal ⇔ status ∈ the closed run-terminal set `{run.completed, run.failed, run.stopped}` (verified against the frozen registry; `run.cancelled` is a `RunStatus`/status-map value, **NOT** a `RunEventType` → out of scope). A pure classifier (`isRunTerminal`) + a `deriveControlState({status, inFlight, errored})` (precedence **terminal > in-flight > errored > idle**) keeps the component declarative.
- **NEVER flip terminal on the click.** An in-flight command shows a **local "…ing" disabled state** (a pure local command-status, cleared on settle) — the control only flips terminal when the **authoritative event folds into the store** (`run.stopped/completed/failed`). There is no `run.stopping` event type, so the in-flight state is local-only, never a run-status guess.
- **The command is idempotent + retry-safe.** Issue the contract command (`runClient.stopRun`) directly; repeated clicks / a click after terminal are no-ops (idempotent + disabled-when-terminal — don't re-implement the dedup, the API owns it). A command failure surfaces an **inline accessible error** (`role="alert"` + `aria-describedby`) and stays retry-safe.
- **Non-destructive:** the control reads the store but never mutates it — `failures[]`/`entities` are untouched after the command (asserted by **ref-equality**), preserving partial evidence (REQ-F-012/REQ-O-002). Subscribe via `useSyncExternalStore(store.subscribe, store.getState)`; terminal status renders via the shared `StatusBadge` (shape+label+icon, rule #4).

**Rule:** A run-control derives its terminal/disabled state from store state (the latest run-level `RunEventType` ∈ the closed run-terminal set), NEVER optimistically — the only authoritative terminal is the folded `run.stopped/completed/failed` event; an in-flight command is a local "…ing" status, never a run-status guess; issue the idempotent contract command directly (API+kernel own dedup/terminal, not re-implemented), surface failures accessibly + retry-safe, and never mutate the store (non-destructive, ref-equality pinned).

## <a id="5"></a>5. The React-Flow lineage renders the storage-agnostic projection via a PURE mapping (6→5 node types) + a deterministic Dagre layout; the in-flight sub-state is a pure marker-pairing fold (resolving the P7.2 deferral); visuals are PORTED, not pinned

**Date:** 2026-06-21.
**Source slice:** P7.7 (`demo-017`; commit hash recorded at round close); `apps/web/src/lineage/{lineageToFlow,layout,inFlight,nodeTypes,LineageGraph}.{ts,tsx}`. The §12 lineage centerpiece.

The lineage graph splits cleanly into a **TDD'd deterministic core** + a **ported visual layer**:
- **Pure `lineageToFlow(projection)`** maps the storage-agnostic `LineageGraphProjection` (§10) → React Flow `{nodes, edges}` with **no physical-store assumption**: the closed **6 `LineageNodeType` collapse to the 5 rendered custom types** — critic+check → one **critic/check** type; **selected-winner = a `candidate` whose `status==='selected'`** (mirrors the producer P6.3, LESSONS §30, not a separate type); **generation = a minimal backbone tier node** (a 6th registered RF type, so its `spawned` edges still resolve). An **edge with a missing endpoint is DROPPED** (React Flow breaks on a dangling edge — defensive mirror of the producer). Each node carries the accessible status spec + its `dataRef` as the link target panels consume.
- **Deterministic layout** (`@dagrejs/dagre` LR, network-simplex — no RNG/wall-clock): the **same projection → the same positions** each render (pinned by equality on two runs); incremental update as `sequenceThrough` advances (a stale watermark never shown over a newer view).
- **In-flight sub-state = a PURE fold** over the run-event stream (resolves the derivation DEFERRED from P7.2, LESSONS §2): an operation-start marker **without its paired completion** marks the node working, **cleared on completion**, surfacing a live activity feed (start→finish). It's a **pure `deriveInFlight(events)` in `lineage/`, NOT folded into the store** (keeps the P7.2 fold idempotent + mode-agnostic). **Replay reproduces the identical liveness** (sequence sole ordering, no wall-clock — pinned by an occurredAt-inverted fold). Node-bridge = node `dataRef ∈ workingEntityIds`; pairing on the most-specific shared entity id — the **`dataRef↔event-entity-id` correlation is the integration assumption confirmed at P7.14** against the real producer + live events; `judge.review_started` has no sv2 completion (`judge.reviewed` is sv3) so a judge node stays in-flight in sv2 → folds into the sv3 demo→cody reconcile.
- **Visuals PORTED, not pinned:** the node-type components + edge styling are ported TS-strict from the prototype `ui_kits/organism-view` (no `.jsx` import, LESSONS §3); a **`src/lineage/**` adherence test** (var() tokens, no raw hex/px — Dagre layout geometry EXEMPT as non-styling numerics) pins the token conversion; pixels (braids/winner bloom) are deferred to the P7.15 Playwright smoke, NOT unit-pinned (RF mounted in happy-dom with ResizeObserver + matchMedia stubs + `<ReactFlowProvider>`, light component assertions). `@xyflow/react` v12 (React-19).

**Rule:** Render the lineage from the storage-agnostic projection via a PURE `lineageToFlow` (6→5 node types: critic+check merge, selected-winner = candidate+`status:selected` per LESSONS §30, generation = backbone; drop dangling edges) + a deterministic Dagre-LR layout (same projection → same positions); the in-flight sub-state is a PURE marker-pairing fold in `lineage/` (NOT the store — resolves the P7.2 deferral, replay-equivalent), with the `dataRef↔entity-id` bridge confirmed at integration (P7.14); PORT the visuals from the prototype (TS-strict, no `.jsx`), pin token-adherence (layout geometry exempt) but defer pixels to the Playwright smoke.

## <a id="6"></a>6. A dashboard panel derives its data from a PURE selector over the typed events (the lean run-store holds status, not metric values) — reading persisted scores VERBATIM (never recompute), ordering by first-seen `sequence`, encoding beyond color, partial-data-safe

**Date:** 2026-06-21.
**Source slice:** P7.8 (`demo-019`; commit hash recorded at round close); `apps/web/src/charts/{chartData,chartTheme,FitnessOverTime,GenerationComparison}.{ts,tsx}`. The events-derived-series pattern (P7.9 energy reuses it).

A metric/score panel (charts, energy, …) does NOT read from the lean P7.2 run-store `ViewState` — that holds per-entity **status**, not metric **values** (LESSONS §2). Instead it derives from the **typed events**:
- **Pure selector over the events.** `deriveFitnessSeries(events)` / `deriveGenerationComparison(events)` fold the `fitness.scored`/`novelty.scored` events (from `runClient.getEvents`/`getReplay`) into the rendered series — a pure, testable function (zero/partial-data-safe: 0 events → empty series, 1 generation → renders, never throws). The live update wires to the run-store stream at P7.14; the **store stays lean** (NOT extended to retain score values).
- **Read the persisted score VERBATIM — never recompute.** The selector reads `FitnessScore.total`/`NoveltyScore.score` exactly as persisted (validated via the frozen schema; a mismatched payload is skipped) — the dashboard **never re-derives fitness/novelty** (the scoring/held-out-judge is authoritative, rule #6-adjacent). The score contracts are added to the `data/contracts.ts` re-export seam (consumed read-only — never `@doppl/contracts` directly).
- **Order by first-seen `sequence`, NOT by id.** Generation/series ordering comes from the **envelope `sequence`** (sole ordering key → replay-equivalent), never a `generationId` string-sort (**ids are opaque**); grouping uses `RunEventEnvelope.generationId` (the score payloads carry none); an event lacking the grouping id is excluded defensively.
- **Encode beyond color + token-adherent.** Each series carries **pattern (dash) + marker (glyph) + text label** in addition to a `var()` color token (colorblind-safe, projector-legible — rule #4 / §12); a `src/<panel>/` adherence test pins `var()` tokens (chart/layout **geometry numerics exempt** as non-styling). Hand-rolled SVG for simple charts (no charting-lib dep) keeps full token/pattern control.

**Rule:** Derive a metric panel's data from a PURE selector over the typed `*.scored`/metric events (the lean run-store holds status not values, LESSONS §2) — read the persisted score VERBATIM via the frozen schema (never recompute — scoring is authoritative), order by first-seen `sequence` (opaque-id-safe, replay-equivalent) grouping on the envelope id, encode pattern+marker+label beyond color (rule #4), and stay partial-data-safe; add consumed contracts to the `data/contracts.ts` seam, pin token-adherence (geometry exempt).

## <a id="7"></a>7. An `EvidenceRef` / trace pointer renders IN-TIER ONLY — never an external href

**Date:** 2026-06-21. **Source slice:** P7.10 (`demo-022`) + reused P7.11/P7.12/P7.13; `apps/web/src/panels/evidenceRef.tsx`.

An `EvidenceRef` (eventId/uri/label/langfuseObservationId) and Langfuse trace ids (traceId/observationId) render as **in-tier reference text + `data-*` attrs** the shell resolves within the Postgres tier — the dashboard **NEVER constructs an external `<a href>`** (no `http(s)` link, no external Langfuse URL). §9/§4 (evidence resolves within the authoritative tier) + rule #9 (no external link/secret in the client). Pinned by an asserts-no-external-href test. Reused by every evidence panel (critic/check/candidate/final-idea) via the single `EvidenceRefLink`.

**Rule:** Render evidence/trace pointers as in-tier references (text + `data-*`), never an external href — one shared `EvidenceRefLink`; pin "no `<a href>`/no `http(s)`".

## <a id="8"></a>8. An evidence panel DISPLAYS emit-only evidence — it NEVER re-derives the decision (verdict/winner) from it

**Date:** 2026-06-21. **Source slice:** P7.11 (`demo-023`) + P7.12/P7.13; critic-gauntlet / subtype-check / final-idea panels.

The dashboard shows critic reviews, check results, scores — all **emit-only evidence** (rule #6 anti-reward-hacking) — but **never re-derives the decision** from them: critics/checks are evidence, the **kernel/judge is authoritative**. So a selector returns each record VERBATIM (e.g. exactly the 7 `CriticReview` fields — no added winner/verdict); a check status renders VERBATIM (`'failed'` stays failed despite a high score — never re-judged from output/score); the final-idea panel shows the **kernel/judge's `status:'selected'` winner** and ignores a higher-metric non-selected candidate (never re-ranks). Pinned by emit-only-verbatim + no-re-selection tests.

**Rule:** Display emit-only evidence verbatim; the UI NEVER re-derives a verdict/winner/decision from critiques/scores/checks (the kernel/judge is authoritative — anti-reward-hacking on the display side). Pin: selector returns exact fields + status verbatim + winner = the selected node (not the UI's pick).

## <a id="9"></a>9. The shell wires the deferred SSE-store IoC + accumulates the panels' raw-events FoldState + composes via link targets

**Date:** 2026-06-21. **Source slice:** P7.14 (`demo-026`); `apps/web/src/routes/{Dashboard,dashboardWiring}.tsx`.

The dashboard shell is the composition+wiring layer: `wireRunStream` does `store.resync()` (on mount) then `createSseStream({onEvent: store.applyEvent, onError: () => store.poll()})` — the **P7.2 deferred IoC** (LESSONS §2; the store is the single ViewState fold sink, the shell never re-folds ViewState). The panels need the raw `RunEventEnvelope[]` which the lean store doesn't retain → the shell holds a **separate events-list FoldState** (sequence-keyed dedup, seeded by `getEvents` + live-appended). It composes the panel set via the **dataRef/candidateId link targets** (link-not-embed). The **unfrozen `GET /health`** gets a **web-local `RunHealth` Zod schema** (MVP — can't add to frozen contracts unilaterally; LESSONS §34 "promote at P7.14"). Live-producer confirms (dataRef bridge, run.configured, RunHealth promotion) are **merge-time**, not shell-time.

**Rule:** The shell wires the deferred SSE-store IoC (resync-on-mount + onEvent→applyEvent + onError→poll), holds the panels' raw-events FoldState (the store stays lean), composes via link targets; a web-local schema is the MVP boundary for an unfrozen endpoint; live-producer confirms defer to the merge.

## <a id="10"></a>10. The e2e smoke mocks the data-client via route-interception + catches what unit tests (injecting stable doubles) miss

**Date:** 2026-06-21. **Source slice:** P7.15 (`demo-027`); `apps/web/test/e2e/dashboard-smoke.spec.ts`.

The §16 happy-path smoke drives the mounted shell with a **mocked data-client via Playwright `page.route`** (REST fixtures + a synthetic `text/event-stream` SSE) — deterministic (locator waits, NO sleeps), no live backend; the spec IS the deliverable (run if browsers install, else doc as CI). It **caught a real bug the unit tests missed**: an **inline non-injected default** (`eventSourceFactory = (url) => new EventSource(url)`) made a new function each render → the wiring effect's deps churned → a re-fetch loop that cancelled state before commit (the unit test passed only because it INJECTS stable doubles). Fix: a **module-const default**. The smoke earned its keep — e2e validates the live wiring unit doubles can't.

**Rule:** Write the e2e smoke as a route-intercepted, deterministic, mocked-data-client spec (the spec is the deliverable). Module-stabilize effect-dep defaults (a non-injected inline default churns the deps) — the smoke catches the live-wiring bugs stable-double unit tests can't.

## <a id="11"></a>11. The final-idea proof panel labels the transfer-evidence rung from the run MODE — zero-surface presentation, not a re-judgement

**Date:** 2026-06-23. **Source slice:** PD.7 (`phase-d-012`); `apps/web/src/panels/{FinalIdeaPanel,finalIdeaData}.tsx`.

The §12 final-idea panel must "distinguish the transfer evidence rung — live allowlisted (non-executing) vs replay-backed." The frozen `CheckResult` carries **no live/replay discriminator** (confirmed at `packages/contracts/.../check-result.ts`), so a per-check field would be **new contract surface — forbidden** (PD's zero-new-surface). The zero-surface source is the **run `mode`** (`'live'|'replay'`, already carried on the run-store, never folded — LESSONS §2): a `live` run's allowlisted check IS the live non-executing check; a `replay` run's evidence IS replay-backed. So the rung label is a pure `evidenceRungLabel(mode)` — a **presentation of the run mode, not a re-judgement** (the held-out judge/scoring stay immutable, rule #6 emit-only — same posture as §8). The terminal **zero-survivors** branch reads the existing run-level `RunEventType` (classified by the existing `isRunTerminal`, single terminal-truth source — §4): a terminal run with no kernel/judge-selected winner reflects the terminal state, **never fabricates** an idea (distinct from the in-progress affordance). New panel props are **optional** (default = today's behavior) so the existing tests stay green. The winner's `evidenceRefs` render in-tier via the shared `EvidenceRefLink` (§7 — the reuse on the final-idea surface).

**Rule:** Derive a "live vs replay-backed" evidence label from the run MODE, never a new event/contract field (when the frozen contract has no discriminator, mode is the only zero-surface source) — it's a presentation of mode, not a re-judgement (rule #6). Reflect terminal zero-survivors from the existing run-level `RunEventType` (never fabricate a winner). Keep new panel props optional so existing tests don't churn. Pin: `apps/web/test/unit/panels/FinalIdeaPanel.test.tsx` (rung-label live/replay + terminal-zero-survivors + energy-success-only).
