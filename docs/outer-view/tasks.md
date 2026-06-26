# Outer Bloom View Tasks

Working branch: `dalton-outer-view`

Goal: build the production outer Doppl view inspired by Michael's experiment spike while staying compatible with the merged kernel runtime. The outer view shows chosen case studies, problem recoveries, and Doppls/solutions as a bloom of durable outer artifacts. Inner-run mechanics such as generated candidates, agenomes, mutagens, energy allocation, and per-generation selection belong in the inner view unless surfaced as summarized proof.

Current UX priority: optimize the desktop/laptop bloom workspace first. Mobile should remain usable, but it is not the primary design target for the outer view right now.

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
- [x] Add `/bloom` web route.
- [x] Render first radial bloom scaffold.
- [x] Use outer terminology in UI: case study, problem recovery, Doppl.
- [x] Avoid people's names and implementation handoff language in app copy.
- [x] Verify local route at `http://localhost:5173/bloom`.
- [x] Push branch to `origin/dalton-outer-view`.

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

- [ ] Stream live outer-run updates while a case study blooms.
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

1. Tighten the graph toward the experiment-spike radial bloom language.
2. Add projection watermark/source metadata to `/bloom` and UI proof board.
3. Draft/prepare first-class outer artifact event shapes for when the kernel supports them.
4. Add knowledge/evidence overlay design using `GET /runs/:id/knowledge`.
5. Improve inspector proof sections with source sequence, replay status, judge version, and artifact links.
6. Decide GitHub Pages + hosted API deployment shape.
