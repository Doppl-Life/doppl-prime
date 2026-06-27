# Agarden Outer View Tasks

Working branch: `dalton-outer-view`

User-facing name: **Agarden**. Keep legacy `/bloom` API/internal identifiers only where they preserve compatibility with existing projection code.

Goal: build the production outer Doppl view inspired by Michael's experiment spike while staying compatible with the merged kernel runtime. The outer view shows chosen case studies, problem recoveries, and Doppls/solutions as a garden of durable outer artifacts. Inner-run mechanics such as generated candidates, agenomes, mutagens, energy allocation, and per-generation selection belong in the inner view unless surfaced as summarized proof.

Top priority: make the bloom view an operator surface that can start a real outer run and show it growing in real time. Static browsing remains important because it gives users an immediate useful map, but the app's main value is live bloom kickoff, observation, and replay.

Current UX priority: optimize the desktop/laptop bloom workspace first. Mobile should remain usable, but it is not the primary design target for the outer view right now. The high-contrast visual treatment is the default product look, not an optional alternate theme.

## Design Principles From NotebookLM + Experiment Spike

- Preserve the radial bloom feel from `doppl-prime-michael-experiment-spike/experiment-spike/`: a living map of outer artifacts, not a generic dashboard table.
- Treat Postgres `run_events` and derived projections as the runtime truth. The bloom should carry `sequenceThrough`/watermark metadata and never invent lineage outside projection rules.
- Keep outer semantics first: case study -> problem recovery -> Doppl/solution -> possible reseeded case-study island. Inner terms such as candidate, agenome, mutagen, and reproduction belong only in proof summaries or links to the inner observatory.
- Prefer a dedicated outer-artifact projection over relabeling the inner lineage graph forever. The current adapter is a bridge until the kernel emits first-class outer artifact events.
- Surface the proof that makes a branch trustworthy: selected lineage, judge strength, novelty, grounding/evidence, human/agora ratings, retrieved/cited research trails, and dead-end/graveyard signals.
- Keep safety and replay posture visible but quiet: sequence ordering, replay-derived state, failed/stale runs, and provider/tool failures should be inspectable without crowding the bloom.
- Use the shared-knowledge/stigmergy model when available: research written by one branch, retrieved by another, cited by artifacts, and culled as negative knowledge.

## Current Baseline

- [x] Create `dalton-outer-view` from `origin/main`.
- [x] Add `GET /bloom` API projection.
- [x] Add `/agarden` web route, with `/bloom` retained as a compatibility redirect.
- [x] Render first radial bloom scaffold.
- [x] Use outer terminology in UI: case study, problem recovery, Doppl.
- [x] Avoid people's names and implementation handoff language in app copy.
- [x] Verify local route at `http://localhost:5173/agarden`.
- [x] Push branch to `origin/dalton-outer-view`.

## Reference App: `michael/experiment-spike`

Canonical reference: `origin/michael:experiment-spike/README.md` and
`origin/michael:experiment-spike/index.html`.

The experiment spike is not only a visualization. It is an outer-growth operator surface with these
production-relevant behaviors:

- A left sidebar can **plant a seed** from either a typed case/postulation or an aGarden case-study file.
- A selected node can be grown one stage at a time:
  - `case_study -> problem_recovery` with the converge/grounding dial.
  - `problem_recovery -> doppl` with the diverge/novelty dial.
  - `doppl` leaves can be reseeded into fresh `case_study` islands.
- Run controls expose:
  - direction/dial: diverge vs converge
  - generated count
  - keep count
  - mutagen/operator skills
- Campaign controls expose:
  - depth
  - max nodes
  - BFS vs DFS traversal
  - auto/converge/diverge dial schedule
  - reseed leaves
  - start from selected seed vs every seed
- A live console streams run progress and regret/proof summaries while the graph grows.
- The graph updates immediately after each fold, so the user watches the bloom unfold rather than waiting
  for a finished batch.
- The spike writes durable outer nodes and stock into aGarden, while current production main writes
  authoritative inner runtime events to Postgres `run_events`.

Production implication: our bloom view needs to become an **operator + observability surface**. It should
start from experiment-spike's outer semantics, but route execution through the merged kernel's server-side
contracts and event store instead of browser-local IndexedDB/model-provider code.

## Phase 0.5: Run Kickoff And Live-Growth Architecture

Current reality:

- The production kernel already exposes `POST /runs`, `POST /runs/:id/stop`, `GET /runs/:id/stream`, and
  `GET /bloom`.
- `POST /runs` accepts a `RunConfig`, validates caps/model overrides, appends `run.configured`, and boots
  the in-process worker through `onRunConfigured`.
- `RunConfig` already has the experiment-spike equivalents for:
  - seed text: `seed`
  - generated/keep-ish bounds: `caps.maxPopulation`, `caps.maxGenerations`, `caps.maxSpawnDepth`
  - budget: `caps.energyBudget`, `caps.maxToolCalls`, `caps.wallClockTimeoutMs`
  - mutagen skills: `generationOperators`
  - dial: `generationBias`
  - model routing: `modelRouteOverride`
- `GET /runs/:id/stream` streams authoritative per-run events using SSE and resumable sequence cursors.
- `GET /bloom` currently mixes imported outer artifacts with an adapter over inner `candidate.created`
  events. This lets us show live inner-run outputs as Doppl leaves, but it does not yet express real
  first-class `problem_recovery` artifacts.

Target shape:

1. The bloom page opens on the best available existing bloom, currently **When The Crashes Don't Come**,
   so the map is immediately meaningful before the operator starts anything new.
2. The left sidebar becomes a two-mode rail:
   - **Browse**: current library/search/filter/sort behavior.
   - **Grow**: experiment-spike-inspired seed/run controls for starting a new bloom run.
3. Uploading or selecting a case-study file should populate seed/title/synopsis/context fields where
   possible, so users do not have to paste the same content into multiple boxes.
4. Starting a run calls `POST /runs` with a production `RunConfig` derived from the panel.
5. The page opens `GET /runs/:runId/stream` immediately after `POST /runs` returns.
6. The graph updates incrementally from streamed events and/or periodic `/bloom` refreshes until the run
   reaches a terminal status.
7. Stop requests call `POST /runs/:id/stop` and the UI shows the draining/stopping state until the event log
   terminalizes.
8. First implementation should support a single selected case-study run; campaign/depth/reseed can layer on
   once the one-run live path is solid.

Recommended sequencing:

- [ ] **R0.5-A: Inventory current launch surfaces.**
  - Map `RunsHomeScreen`, `RunConfigPanel`, `startDemoRun`, and `startRun` to the bloom view.
  - Decide what can be reused as-is and what should be extracted into shared launch components.
  - Confirm how the API's cap maxima should be fetched before rendering the bloom launch panel.
- [x] **R0.5-B: Define `StartBloomRequest` as a web-local view model, not a new frozen contract.**
  - Implemented as `BloomGrowForm` in `apps/web/src/routes/outerBloomRunConfig.ts`.
  - It intentionally maps to the existing frozen `RunConfig` contract at submit time; no new API payload
    or browser-owned outer run model was introduced.
  - Fields:
    - title/name
    - seed/context text
    - synopsis
    - optional uploaded case-study filename/body
    - generation mode: recover problem, grow Doppls, campaign
    - direction/dial
    - population count
    - spawn depth
    - mutagen operators
    - max generations/depth
    - max runtime/energy/tool calls
  - Conversion is deterministic and unit-tested. Optional model route override remains a follow-up.
- [x] **R0.5-C: Build the compact bloom launch panel.**
  - Place it behind a left-sidebar **Grow** tab next to the existing **Browse** tab.
  - Keep the default page state on **Browse** with the current `when-the-crashes-dont-come-575845a4`
    island selected and fit in the graph.
  - Use experiment-spike semantics, not all of its local-provider controls.
  - Include:
    - case-study selector/upload/manual paste
    - concise title/context/synopsis inputs
    - dial segmented control
    - population / spawn-depth / generation controls mapped to caps
    - mutagen chips from `GenerationOperator`
    - start button
  - Keep this panel collapsible or left-rail sized so it does not consume the radial map.
- [x] **R0.5-D: Add case-study file ingestion.**
  - Support markdown/text upload in the browser.
  - Parse frontmatter when present.
  - Extract reasonable defaults:
    - title from frontmatter title or first heading
    - synopsis from frontmatter/`## Synopsis`/first paragraph
    - seed/context from full markdown body
  - Never upload secrets or file handles; the browser sends only the derived run config.
- [x] **R0.5-E: Start run from bloom.**
  - Add `startBloomRun` UI flow using existing `runClient.startRun`.
  - Use an idempotency key per submit.
  - On `201/200`, store active run id in local view state and show it in the live summary.
  - Follow-up: focus the new run's island once `/bloom` exposes it.
  - Show immediate "configured/starting" state while waiting for events.
- [x] **R0.5-F: Live event subscription.**
  - Added a web SSE client for `GET /runs/:id/stream` after bloom launch.
  - Follow-up: resume with `Last-Event-ID`/`lastEventId` if disconnected.
  - Translate streamed events into:
    - live summary rows
    - proof-board counters
    - active progress state
    - optimistic graph updates where safe
  - Current slice refreshes `/bloom` on streamed events until first-class outer events exist.
  - Added a short live polling backstop while a launched run is streaming, so the bloom catches projection
    updates even if an SSE frame is missed or the projection updates just after an event.
- [~] **R0.5-G: Live graph growth.**
  - The bloom now follows the active run: when `/bloom` exposes new nodes for the streamed run, the
    selection moves to the newest meaningful outer artifact (selected Doppl, Doppl, problem recovery,
    then case-study root).
  - Animate new nodes from streamed/projection changes.
  - Distinguish:
    - configured/starting
    - generating
    - scoring/judging
    - completed
    - failed/stopped
  - Keep inner event names out of the default UI; show them only in a technical run console/proof drawer.
- [ ] **R0.5-H: Stop and recovery behavior.**
  - Wire `POST /runs/:id/stop`.
  - Show stop-requested/draining until the SSE/projection reports `run.stopped` or another terminal state.
  - If the browser reloads mid-run, recover active run state from `GET /runs` and `/bloom`.
- [~] **R0.5-I: Tests.**
  - Unit-tested bloom request -> `RunConfig` mapping.
  - Unit-tested case-study file parsing.
  - Unit-test SSE reducer behavior over representative events.
  - Component-tested `POST /runs` from bloom flow using a fake `RunClient`, no provider spend.
  - Follow-up: integration-test through API inject/fake gateway.
  - Browser-test live startup using a recorded/demo gateway so the graph changes without real provider spend.

Important boundary:

- The first live version should **not** try to reproduce experiment-spike's browser-local model provider
  chooser. Production provider keys stay server-side/env-only.
- The first live version should **not** implement full campaign traversal in the browser. Campaign semantics
  need a server-side orchestrator or first-class outer-artifact events to be replay-safe.
- The bloom UI can use experiment-spike labels like "Generate", "Keep", "Dial", "Campaign", and "Reseed",
  but those must map to kernel-enforced caps/config. The browser never becomes the cap authority.

## Phase 0.6: Full Kernel-To-Outer Bloom Wiring

What is true today:

- `Run Bloom` now posts a real production `RunConfig` to `POST /runs`.
- The API appends `run.configured`, starts the worker through `createStartRun`, and emits normal append-only
  kernel events as generations run.
- The bloom page streams `GET /runs/:runId/stream` and refreshes `/bloom`, so new run output can become
  visible without a page reload.
- `/bloom` currently uses two sources:
  - imported durable outer artifacts in `outer_bloom_artifacts`
  - a temporary adapter that projects inner `candidate.created` events into outer-looking Doppl nodes
- That adapter is useful proof, but it is not the full outer process. It synthesizes one problem recovery
  and treats inner candidates as Doppls. It does not yet express multiple chosen problem recoveries,
  multiple selected Doppls per problem recovery, reseeded case-study islands, or a campaign's traversal
  decisions as durable replayable outer state.

Target production model:

- The outer view should kick off an **outer bloom campaign**, not merely one inner run.
- A campaign has a stable `campaignId`, a root case-study artifact, bounded run controls, and an event log
  that can replay the whole bloom.
- The campaign orchestrator launches one or more existing kernel runs as children:
  - case study -> problem recovery run(s), usually convergent/grounded
  - selected problem recovery -> Doppl run(s), usually divergent/novel
  - selected Doppl leaf -> optional reseeded case-study island
- Each child kernel run still owns inner mechanics: agenomes, mutagens, candidates, fitness, energy,
  generation loops, and final winner selection.
- The outer orchestrator promotes selected child-run outputs into first-class outer artifacts:
  - `case_study`
  - `problem_recovery`
  - `doppl`
- Promoted artifacts must carry durable parent-child links, source run IDs, source event sequences, selection
  proof, and enough summary text for the bloom and inspector.
- The UI should never expose "candidate" as the default outer vocabulary. Candidate/agenome details belong
  behind an "open inner run" link or proof drawer.

Recommended implementation tasks:

### Localhost Integrated Vertical Slice Checklist

This is the concrete task list for the current integration goal: from `http://localhost:5173/agarden`,
launch a case-study run, watch the inner organism run at `/runs/:runId`, and watch the Agarden map grow as
inner runs finish and produce promoted outer artifacts.

- [ ] **L0: Keep the task tracker current.**
  - Record implementation decisions in this file as they land.
  - Keep the branch-only rule explicit: work on `dalton-outer-view`, never `main`.
  - Reconciliation doc: `docs/outer-view/agarden-kernel-reconciliation.md`.
  - Orchestration architecture doc: `docs/outer-view/inner-outer-orchestration-plan.md`.
  - Contract finding: the inner kernel currently produces `CandidateIdea` winners, not a first-class
    `ProblemRecovery` event/object. The outer campaign stage and MarkScript compiler currently compile
    selected candidate winners into `problem_recovery` or `doppl` Agarden nodes. The next correctness step
    is explicit stage framing for child runs.
- [x] **L1: Add API-local outer campaign persistence.**
  - Add durable tables for campaigns, campaign artifacts, artifact links, child runs, and promotion decisions.
  - Keep these API-local until the inner/outer contract is proven; do not change frozen run event contracts yet.
  - Make the schema replay-friendly and idempotent enough for localhost restarts.
- [x] **L2: Add campaign start endpoint.**
  - Add `POST /outer-campaigns`.
  - Accept the current Agarden grow payload plus the already-built `RunConfig`.
  - Persist the root `case_study` artifact first.
  - Launch the first child inner run through the existing run worker path.
  - Return `{ campaignId, rootArtifactId, activeRunIds }`.
- [x] **L2.5: Extract shared inner-run start command.**
  - Shared API-internal command now owns `RunConfig` validation/defaulting, cap max enforcement,
    model-route override enforcement, `run.configured` append, and the worker trigger.
  - `POST /runs` and `POST /outer-campaigns` both call it; `/runs` still owns route-local idempotency and
    active-run guarding.
- [x] **L3: Show campaign roots in `/bloom`.**
  - Make `/bloom` read campaign artifacts as first-class outer nodes.
  - Continue showing imported aGarden artifacts and legacy live-run adapter as fallbacks.
  - Include source run IDs so "open inner run" works for promoted nodes.
- [~] **L4: Promote first child-run winner into a `problem_recovery`.**
  - Compile the winner through the MarkScript node contract before persisting it as an outer artifact.
  - Do not persist raw `CandidateIdea` text as an Agarden node; it is source material, not the artifact.
  - [x] Watch/read terminal inner run state opportunistically during `/bloom` projection.
  - [x] Select the top final idea from the inner projection (`run.completed.finalIdeaRef`, fallback best scored survivor).
  - [x] Persist a promoted `problem_recovery` child of the root case study when a child run completes.
  - [x] Store source run/candidate/sequence proof.
  - [ ] Add API tests and a dedicated campaign worker/stream so this is not only projection-time sync.
- [ ] **L5: Launch the next child run from promoted problem recovery.**
  - Build a second `RunConfig` with Doppl/divergent instructions.
  - Persist child-run relationship.
  - Start the inner run once the first promotion lands.
- [ ] **L6: Promote Doppl winner(s).**
  - Compile each promoted winner through the MarkScript `doppl` shape.
  - Persist Doppl children under the selected problem recovery.
  - Make the outer map follow the newest promoted artifact.
- [ ] **L7: Wire live campaign refresh.**
  - Add campaign polling or SSE aggregate stream.
  - Show child-run status and promotion events in the Agarden live panel.
  - Recover the active campaign after refresh.
- [ ] **L8: Stop/delete/replay behavior.**
  - Stop current child run/campaign cleanly.
  - Support deleting test campaign nodes/subtrees.
  - Ensure a browser refresh reconstructs the map from Postgres.
- [ ] **L9: No-spend verification.**
  - Add API tests with fake child runs/projections.
  - Add web tests for campaign launch and map appearance.
  - Smoke locally with recorded/fake gateway before trying live model runs.

- [ ] **R0.6-A: Contract inventory and compatibility decision.**
  - Inventory current frozen contracts: `RunConfig`, `RunEventType`, high-traffic payload map, projection
    reducers, and `outer_bloom_artifacts`.
  - Decide whether first-class outer artifacts should be emitted as new frozen `RunEventType` members now,
    or first shipped as API-local campaign tables while contract changes are coordinated.
  - Preferred near-term path: add API-local `outer_campaigns` / `outer_artifacts` persistence first, then
    graduate stable shapes into contracts once the other inner-view work is settled.

- [ ] **R0.6-B: Define first-class outer persistence.**
  - Add durable tables or event payloads for:
    - `outer_campaign`
    - `outer_artifact`
    - `outer_artifact_link`
    - `outer_campaign_child_run`
    - optional `outer_promotion_decision`
  - Required artifact fields:
    - id
    - campaignId
    - stage: `case_study | problem_recovery | doppl`
    - title/label
    - summary/body markdown
    - parentArtifactId
    - sourceRunId
    - sourceCandidateId or source output reference, when applicable
    - sourceSequenceThrough
    - status: pending/running/promoted/rejected/failed/selected
    - judge/fitness/novelty/grounding proof snapshots
    - created/updated timestamps

- [ ] **R0.6-C: Implement server-side campaign start.**
  - Add a route such as `POST /outer-campaigns` or `POST /bloom/runs`.
  - Accept the current `BloomGrowForm`-equivalent payload and map it to one or more existing `RunConfig`
    child runs.
  - Persist the campaign and root case-study artifact before launching child runs.
  - Return `{ campaignId, rootArtifactId, activeRunIds }`.
  - Keep provider keys server-side and keep cap enforcement delegated to existing `POST /runs` validation.

- [ ] **R0.6-D: Implement stage-specific child run planning.**
  - For `case_study -> problem_recovery`, generate one or more child `RunConfig`s with convergent/grounded
    bias and seed text that asks the kernel to recover the hidden/important problem.
  - For `problem_recovery -> doppl`, generate child `RunConfig`s with divergent/novel bias and seed text
    that asks the kernel to produce solutions/findings against the selected recovery.
  - For `doppl -> reseeded case_study`, generate a new case-study artifact and optional child run only when
    explicit campaign settings allow reseeding.
  - Preserve experiment-spike controls:
    - Generate
    - Keep
    - Depth
    - Max nodes
    - BFS/DFS
    - Auto/converge/diverge schedule
    - Reseed leaves
  - Do not implement traversal in browser-only state; it must be replayable.

- [~] **R0.6-E: Promote child-run winners into outer artifacts.**
  - [x] Add a MarkScript compiler/adapter from inner kernel winner projection to Agarden node markdown:
    - case studies: frontmatter + `## Context` + `## Synopsis`
    - problem recoveries: frontmatter + `## Trace` + `## Discovery` + `## Growth — Problem recovery` + `## Path`
    - Doppls: frontmatter + `## Trace` + `## Discovery` + `## Growth — Doppl` + `## Path`
  - [x] Treat MarkScript as the display/export contract for Agarden artifacts; the inner candidate/final idea is
    only the source projection.
  - [x] Watch child run terminal events (`run.completed`, `run.failed`, `run.stopped`, `run.cancelled`).
  - [x] Read current-state projection for the child run.
  - [~] Select the top outputs according to the outer stage's `keep` policy.
    - Current slice promotes the single selected/final winner.
  - [x] Persist promoted `problem_recovery` or `doppl` artifacts with parent links.
  - [x] Store source run/candidate/event sequence pointers so every bloom node can be audited.
  - Record rejected/non-promoted output counts for proof board summaries without cluttering the outer graph.

- [ ] **R0.6-F: Add campaign worker/orchestrator loop.**
  - Trigger next-stage child runs when promotion creates growable artifacts and campaign depth/node caps allow.
  - Enforce campaign caps independently from per-run caps:
    - max outer nodes
    - max child runs
    - max total energy/tool calls, when available
    - max wall-clock time
  - Support stop/kill for a campaign and all active child runs.
  - Make the loop idempotent: if a process restarts, it can resume from persisted campaign/artifact state.

- [ ] **R0.6-G: Upgrade `/bloom` projection to campaign-first.**
  - Read promoted outer artifacts as the primary source of truth.
  - Keep imported `outer_bloom_artifacts` and the inner-run adapter only as fallbacks/demo sources.
  - Include projection metadata:
    - campaign IDs
    - source run IDs
    - sequenceThrough/watermark
    - freshness/staleness
    - active child run IDs
  - Preserve existing imported "When The Crashes Don't Come" map while live campaign artifacts are added.

- [ ] **R0.6-H: Add aggregate streaming for live outer growth.**
  - Provide a campaign stream such as `GET /outer-campaigns/:campaignId/stream`, or teach the bloom page to
    subscribe to all active child run streams for a campaign.
  - Emit/derive events for:
    - campaign configured
    - child run started
    - artifact promoted
    - next-stage queued
    - campaign completed/failed/stopped
  - Keep the current `/bloom` polling backstop until the aggregate stream is proven reliable.

- [ ] **R0.6-I: Wire the bloom UI to campaigns.**
  - `Run Bloom` should create a campaign, not just one run, once the new endpoint exists.
  - The map should follow newly promoted outer artifacts.
  - The live panel should show campaign progress and child-run progress without exposing inner candidate
    mechanics by default.
  - Double-clicking a promoted node should still open the inner run/proof source when present.

- [ ] **R0.6-J: Tests and no-spend verification.**
  - Add API tests with fake gateway/event store for:
    - campaign start
    - child run planning
    - promotion from fake child run winner
    - cap enforcement
    - campaign stop/resume behavior
  - Add projection tests for:
    - case study -> multiple problem recoveries
    - problem recovery -> multiple Doppls
    - Doppl -> reseeded case-study island
    - imported + campaign-backed artifacts coexisting
  - Add web tests for:
    - Run Bloom creates a campaign
    - streamed artifact promotion appears in graph
    - no "candidate" language leaks into default outer UI
  - Use recorded/fake model gateways for CI and local smoke tests to avoid provider spend.

## Phase 1: Data Contract And Source Of Truth

- [x] Project existing inner runtime outputs into an outer shape.
- [x] Create explicit path: `case_study -> problem_recovery -> doppl`.
- [x] Hide inner "candidate" language behind the adapter boundary.
- [ ] Add projection watermark/source metadata to `/bloom`:
  - `sequenceThrough`
  - source run IDs
  - projection freshness/staleness
- [ ] Identify first-class outer artifact events once the kernel emits them.
- [ ] Draft first-class outer artifact event candidates:
  - `artifact.case_study.created`
  - `artifact.problem_recovery.created`
  - `artifact.doppl.created`
  - `artifact.linked`
  - `artifact.reseeded`
- [ ] Replace synthetic problem-recovery adapter with real problem-recovery nodes.
- [ ] Preserve durable parent-child IDs across runs and reloads.
- [ ] Decide whether the long-term outer source of truth is Postgres, aGarden, or a reconciled projection of both.
- [ ] Document reconciliation rules:
  - Postgres runtime events
  - aGarden markdown nodes
  - ratings/agora overlays
  - stale/missing/deleted artifacts
- [ ] Add tests for multiple case-study islands.
- [ ] Add tests for `case_study -> problem_recovery -> doppl -> reseeded case_study` forest loops.

## Phase 2: Michael-Inspired Bloom Graph

- [x] Move from static SVG scaffold toward a richer bloom layout.
- [ ] Recreate the experiment-spike radial bloom language more faithfully:
  - central case-study root
  - branching/lobed children
  - curved parent-child paths
  - organic spacing without label collisions
  - selected branch as a luminous path
- [ ] Use island clustering around case studies.
- [ ] Use stage colors consistently:
  - case study: slate
  - problem recovery: violet
  - Doppl: leaf green
- [x] Encode novelty as node halos.
- [ ] Encode grounding as node halos once grounding is present in the outer projection.
- [x] Encode judge strength as node radius or ring weight.
- [ ] Encode human/agora strength as node radius or ring weight once ratings are in the outer projection.
- [ ] Add retrieved/cited research path styling once knowledge data is in the outer projection.
- [ ] Add culled/dead-end visual language for failed or low-fitness branches without exposing inner candidates.
- [x] Highlight the selected node's ancestry path.
- [x] Dim unrelated islands when a node is selected.
- [x] Add zoom, pan, and fit controls.
- [ ] Improve label rules:
  - no overlapping labels
  - selected node shows full label
  - dense views prioritize stage/path labels
- [ ] Add hover affordances and tooltips.
- [ ] Add empty state that explains outer growth without sounding prototype-y.
- [ ] Add large-graph performance checks.

## Phase 3: Inspector And Artifact Reading

- [x] Upgrade inspector into a real artifact reader.
- [x] Show selected node details:
  - stage badge
  - title
  - synopsis/summary
  - parent
  - children count
  - run/source links
- [x] Show scores:
  - judge score
  - human/agora score
  - novelty
  - grounding
  - rating count
- [ ] Render markdown artifact sections clearly.
- [ ] Collapse noisy proof sections by default.
- [ ] Add "why this exists" proof section:
  - source run
  - source event sequence
  - selected/final status
  - judge policy version
  - replay status
- [x] Show trace/path lineage for a selected node.
- [x] Add "Open inner run" only where an inner run exists.
- [ ] Add "Open artifact" when aGarden-backed artifact exists.
- [ ] Add copy-link/copy-markdown actions.
- [ ] Add inspector states for missing/stale/partial artifacts.

## Phase 4: Library, Filters, And Navigation

- [x] Replace simple islands rail with a richer library.
- [x] List case-study islands with child counts and status.
- [x] Add stage filters:
  - all
  - case studies
  - problem recoveries
  - Doppls
  - selected/final Doppls
- [x] Add initial signal filters:
  - scored
  - unscored
  - high judge score
  - selected
- [ ] Add human/agora filters once ratings are in the outer projection:
  - high human score
  - disagreement
- [x] Add search by title/body text.
- [x] Add initial sorting:
  - lineage order
  - strongest first
  - selected first
- [ ] Add source-of-truth sorting once metadata is available:
  - newest
  - strongest human score
  - most divergent judge/human
  - largest island
- [x] Keep selected library row synchronized with graph selection.
- [ ] Add keyboard navigation for graph/list selection.

## Phase 5: Proof Board And Run Health

- [x] Add proof board panel inspired by the spike.
- [ ] Show projection watermark and latest event sequence.
- [ ] Show outer-run history per island.
- [x] Show generation/proof summary:
  - generated count
  - kept count
  - rejected count
  - selected count
  - run status
- [ ] Show judge-vs-human comparison.
- [ ] Show whether Doppl improved against baseline/control once baseline lane exists.
- [ ] Show stale/error states for interrupted runs.
- [ ] Add link from proof board rows to the corresponding inner run.
- [ ] Add run health indicators:
  - active
  - completed
  - failed
  - stopped
  - waiting for rating
- [ ] Show tool/research health if present:
  - research notes written
  - notes retrieved
  - tool failures
  - grounding unavailable

## Phase 6: Live Growth Experience

- [~] Stream live outer-run updates while a case study blooms.
- [x] Add Start Bloom panel modeled after experiment-spike's seed/run controls.
- [x] Let uploaded case-study markdown populate seed/title/synopsis/context automatically.
- [x] Map experiment-spike controls to production `RunConfig`:
  - Direction/dial -> `generationBias`
  - Operators/mutagens -> `generationOperators`
  - Population count -> `caps.maxPopulation`
  - Spawn depth -> `caps.maxSpawnDepth`
  - Depth -> `caps.maxGenerations`
  - Energy/tool/runtime -> `caps.energyBudget`, `caps.maxToolCalls`, `caps.wallClockTimeoutMs`
  - Stop -> `POST /runs/:id/stop`
- [x] Add an SSE client for `GET /runs/:id/stream`.
- [ ] Add run console/progress panel inspired by experiment-spike.
- [ ] Refresh `/bloom` in response to live run events until first-class outer artifact events exist.
- [ ] Animate newly created problem recoveries and Doppls entering the graph.
- [ ] Show active run console/progress without overwhelming the graph.
- [ ] Add a clear "stop" affordance for long growth operations.
- [ ] Make growth events replayable from persisted events.
- [ ] Support replay scrub of the outer bloom once outer artifact events exist.
- [ ] Avoid exposing inner candidate mechanics in the outer UI; summarize them as proof only.
- [ ] Add loading states that distinguish:
  - loading projection
  - run in progress
  - no artifacts yet
  - API unavailable

## Phase 7: Campaigns And Reseeding

- [ ] Design production-safe campaign controls.
- [ ] Decide where campaign orchestration lives:
  - preferred: server-side campaign orchestrator that issues bounded runs and appends replayable campaign events
  - temporary: UI starts one run at a time, no deep campaign
  - avoid: browser-only campaign state that cannot replay from Postgres
- [ ] Support bounded growth:
  - depth
  - max nodes
  - max runtime
  - max cost/energy
- [ ] Support traversal options if useful:
  - breadth-first
  - depth-first
- [ ] Support auto schedule:
  - converge for problem recovery
  - diverge for Doppls
- [ ] Support reseeding a Doppl leaf as a new case-study island.
- [ ] Define first-class reseed event/projection rule:
  - `doppl` leaf -> new `case_study`
  - parent link preserved across islands
  - aGarden-compatible `prev_id` semantics
- [ ] Make campaign runs auditable through the proof board.
- [ ] Add guardrails so campaigns cannot accidentally spend unbounded model budget.

## Phase 8: Agora, Ratings, And Human/Judge Comparison

- [ ] Overlay human/agora ratings onto graph nodes.
- [ ] Show judge score vs human score in inspector.
- [ ] Add disagreement filters:
  - judge high, humans low
  - humans high, judge low
  - polarizing human ratings
- [ ] Add rating-count confidence indicator.
- [ ] Link to calibrator/agora pages where appropriate.
- [ ] Decide whether outer view reads ratings from:
  - Postgres
  - aGarden ratings ledger
  - calibrator ratings API
  - reconciled projection
- [ ] Avoid letting ratings UI clutter the outer graph.
- [ ] Show judge/human disagreement as an optional analysis mode, not the default bloom mode.

## Phase 8.5: Knowledge And Evidence Overlay

- [ ] Consume `GET /runs/:id/knowledge` or a bloom-integrated knowledge projection.
- [ ] Show research-written trails as subtle peripheral evidence marks.
- [ ] Show retrieved trails as "branch learned from prior branch" links.
- [ ] Show cited notes in inspector proof, even if they are not graph nodes.
- [ ] Show culled-lineage research as negative knowledge/dead ends.
- [ ] Avoid making the outer bloom a second inner knowledge graph; use knowledge as proof/evidence overlay.

## Phase 9: Analysis Tools

- [ ] Add selected-node similarity panel.
- [ ] Add cluster/tint mode for thematic grouping.
- [ ] Add doppelganger/near-duplicate detection.
- [ ] Add "strongest Doppls" view.
- [ ] Add "weakest/prune candidates" view, using outer terminology.
- [ ] Add "what should grow next?" suggestions grounded in actual graph state.
- [ ] Keep analysis local/read-only until the backend has authoritative support.

## Phase 10: Production UX And Accessibility

- [ ] Remove remaining prototype-y visual tells.
- [ ] Keep high information density without crowding.
- [ ] Make graph usable on laptop, tablet, and mobile.
- [ ] Add responsive inspector behavior.
- [ ] Ensure no text overlaps in dense graphs.
- [ ] Ensure color is not the only signal for stage/status.
- [ ] Add keyboard and screen-reader basics for list/inspector controls.
- [ ] Add clear error states for failed API calls.
- [ ] Keep all user-facing copy production-neutral.

## Phase 11: Public Preview URL

Desired eventual URL shape: `https://doppl-life.github.io/doppl-prime/...`

Important constraint: a GitHub Pages static app cannot directly host the Postgres-backed API. The outer view needs an API source for `/bloom`, so there are two viable production shapes:

### Option A: GitHub Pages Frontend + Hosted API

- [ ] Build the web app for GitHub Pages under `/doppl-prime/`.
- [ ] Configure frontend API base to a hosted API URL.
- [ ] Host the API separately on Railway or another backend host.
- [ ] Ensure CORS is configured for `https://doppl-life.github.io`.
- [ ] Ensure API secrets stay server-side only.
- [ ] Add a route such as `https://doppl-life.github.io/doppl-prime/bloom`.
- [ ] Keep calibrator routing unaffected.

Pros: matches requested GitHub Pages URL.

Tradeoff: requires a separate API host and CORS configuration.

### Option B: Railway Full App Preview

- [ ] Deploy API and web together or as two Railway services.
- [ ] Add Railway Postgres.
- [ ] Set environment variables for API only.
- [ ] Seed demo or connect to production run database.
- [ ] Use a Railway URL for teammates while the GitHub Pages path is prepared.

Pros: fastest to make a real API-backed preview.

Tradeoff: URL is not `doppl-life.github.io`.

### Option C: Static Demo Snapshot On GitHub Pages

- [ ] Generate a static bloom JSON snapshot.
- [ ] Serve the outer view from GitHub Pages using that snapshot.
- [ ] Mark the page as read-only/demo data.

Pros: easiest way to show at GitHub Pages quickly.

Tradeoff: not live, not production source-of-truth.

Recommended path: Option A for production, Option B for short-term teammate demos if a live API is needed quickly.

## Near-Term Next Work

1. Implement Phase 0.6-A/B: decide the first-class outer artifact persistence shape and add the migration.
2. Implement Phase 0.6-C/D: create campaign start and stage-specific child-run planning.
3. Implement Phase 0.6-E/F: promote child-run winners into durable outer artifacts and continue bounded
   campaigns.
4. Upgrade `/bloom` to campaign-first projection with imported/demo fallback.
5. Add aggregate campaign streaming so the outer map grows from real promoted artifacts in real time.
6. Tighten the graph toward the experiment-spike radial bloom language after the campaign data path is real.
7. Add projection watermark/source metadata to `/bloom` and UI proof board.
8. Decide GitHub Pages + hosted API deployment shape once the live campaign path is proven locally.
