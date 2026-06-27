# Projections & Read Models

## Executive summary

This layer is the system's **read side**. Doppl's single source of truth is an append-only event log in Postgres (`run_events`); nothing in the UI or API reads that raw log directly. Instead, this layer **folds** the ordered stream of events for a run into convenient, queryable shapes — "what is the current state of every entity," "the lineage graph React Flow draws," "a replay summary," "a run-health snapshot," "the list of all runs," and — newest — "the shared-knowledge graph the agents' own research folds into." Think of it as replaying a recording: start from an empty state and apply each event in order to arrive at "where things stand now."

The crucial property is that **every read model here is derived and rebuildable, never authoritative** (safety rule #2). If a projection is lost or wrong, you throw it away and re-fold the log — the truth is untouched. Each fold is a **pure function**: no model calls, no embeddings, no web requests, no randomness, no clock. That purity is what makes **replay** trustworthy (safety rule #7): re-folding the persisted log produces a result byte-for-byte equal to the projection captured when the run actually executed. The layer also computes the demo's "winner" — but it only *marks* the candidate the kernel already decided, it never *invents* a winner.

The newest fold is the **`research-notes` projection** — the substrate for the *Shared Knowledge Space* ("stigmergy") feature. Agents that do their own research already leave `tool_call.finished` events in the log; `researchNotesReducer` folds those into a graph of normalized notes, three kinds of edges (who *wrote* a trail, who *cited* it, who *read* it), and a "graveyard" marking which research came from culled (low-fitness) lineages. **This doc owns the projection mechanics only** — the end-to-end feature (the in-run retriever, the prompt threading, the React Flow viz) is documented in [11-shared-knowledge-space.md](11-shared-knowledge-space.md).

## Responsibilities

- **Folds the authoritative event log into read models.** A generic ordered-fold core (`buildProjection`) plus injected reducers produce current-state, lineage graph, replay summary, run-health, and run-list. — `apps/api/src/projections/projection-builder.ts:65`
- **Guards fold integrity.** Asserts strict, gap-free, monotonic `(runId, sequence)` ordering and rejects future schema versions, cross-run contamination, and empty input — surfacing a typed `ProjectionError` rather than silently producing a partial projection. — `apps/api/src/projections/projection-builder.ts:80`
- **Provides the watermark / staleness primitive** so a cached projection knows when it is out of date. — `apps/api/src/projections/watermark.ts:20`
- **Marks (never invents) the run winner** by reading the kernel's `run.completed.finalIdeaRef` and setting that candidate's status to `'selected'`. — `apps/api/src/projections/reducers/winner.ts:33`
- **Exposes a storage-agnostic lineage shape** plus a neutral Neo4j export of it, and buckets nodes into per-generation render columns by parsing the generation ordinal out of the `…-gen<N>` id scheme. — `apps/api/src/projections/lineage-graph.ts:26`, `:32`, `apps/api/src/projections/lineage-export.ts:54`
- **Folds the agents' research into a Shared-Knowledge graph.** `researchNotesReducer` folds `tool_call.finished` / `candidate.created` / `candidate.generation_started` / `lineage.culled` into `{ notes, edges, agenomes }` — the stigmergy substrate behind `GET /runs/:id/knowledge`. Pure, replay-stable, authors nothing. — `apps/api/src/projections/research-notes.ts:126`

It is explicitly **NOT**:
- **Not authoritative.** It writes nothing to `run_events`; it never mutates state. It is read-only and disposable.
- **Not a provider caller.** No model gateway, embeddings, retrieval, web, RNG, or clock is reachable from this layer (verified by import-ban tests). It reads persisted outcomes back verbatim.
- **Not the winner-decider.** The kernel's `terminalClassifier` decides the winner; this layer only surfaces it.
- **Not the live worker / API transport.** It is consumed by routes (layer 07) but contains no Fastify or SSE code.

## Key components

| Component | What it does | Where |
|-----------|--------------|-------|
| `buildProjection` | Generic pure ordered fold; reducer-injected; emits a watermark-tagged result | `apps/api/src/projections/projection-builder.ts:65` |
| `canonicalize` | Sorted-key, Date→ISO canonical JSON used for state-equivalence comparisons | `apps/api/src/projections/projection-builder.ts:126` |
| `currentStateReducer` / `buildCurrentState` | Composes the 5 per-concern reducers into the current-state fold | `apps/api/src/projections/current-state.ts:40` |
| `lifecycle` / `entities` / `lineage` / `winner` reducers | Per-concern folds (status, high-traffic entity rows, genealogy+cull, winner mark) | `apps/api/src/projections/reducers/` |
| `buildLineageGraph` | Pure transform of current-state → frozen `LineageGraphProjection` (React Flow) | `apps/api/src/projections/lineage-graph.ts:26` |
| `generationIndexOf` / `genIndexField` | Parse the zero-based gen ordinal from the `${runId}-gen${N}` id → `LineageNode.generationIndex` (per-generation render columns) | `apps/api/src/projections/lineage-graph.ts:32`, `:39` |
| `researchNotesReducer` / `buildResearchNotes` | Pure ordered fold of research events → `ResearchKnowledgeGraph` `{notes, edges, agenomes}` (the Shared-Knowledge substrate) | `apps/api/src/projections/research-notes.ts:126`, `:242` |
| `buildReplaySummary` | Seed-to-summary digest re-folded from the persisted log (rule #7 surface) | `apps/api/src/projections/replay-summary.ts:41` |
| `buildRunHealth` | Read-only health signal: in-flight ops, candidates, clamped caps-consumed | `apps/api/src/projections/run-health.ts:90` |
| `isStale` / `latestSequence` | Pure staleness predicate + the one-line DB watermark fetch | `apps/api/src/projections/watermark.ts:20` |
| `listRunIds` | Distinct `run_id` across `run_events` (backs `GET /runs`) | `apps/api/src/projections/run-list.ts:13` |
| `lineageToExport` | Storage-agnostic Neo4j-importable export of the lineage projection | `apps/api/src/projections/lineage-export.ts:54` |

## Interfaces & contracts

**Inputs.** Everything folds over `RunEventRow[]` — the event-store's row shape, re-exported here so consumers do not reach into the event-store (`apps/api/src/projections/projection-builder.ts:21`). Rows must arrive in ascending `sequence` order for a single run (exactly what `readByRun` returns).

**The fold core (the reusable primitive):**

```ts
buildProjection<S>(
  events: readonly RunEventRow[],
  reducer: ProjectionReducer<S>,   // (state, event) => state — pure, injected
  initialState: S,
): WatermarkedProjection<S>          // { runId, sequenceThrough, state }
```
— `apps/api/src/projections/projection-builder.ts:46`, `:65`

**Frozen contract types it produces or carries (from `packages/contracts`):**
- `WatermarkedProjection<S>` extends the frozen 2-field `ProjectionWatermark` `{ runId, sequenceThrough }` (`apps/api/src/projections/projection-builder.ts:53`). This is the executable form of the §9 watermark invariant — a **demo-track-local** contract, NOT a §2.5 cross-track seam (see the `ProjectionWatermark` row in `apps/api/CLAUDE.md`).
- `LineageGraphProjection` (+ `LineageNode`, closed-6 `LineageNodeType`, `LineageEdge`) — the strict, **storage-agnostic** graph shape `buildLineageGraph` outputs and `safeParse`-conforms to. `LineageNode` is now a strict **7-field** object: the new `generationIndex?` (zero-based gen ordinal, `int().nonnegative().optional()`) is **additive + optional**, a derived projection field with **no `schemaVersion` implication** (old projections without it still parse) — `packages/contracts/src/projections/lineage-graph.ts:35`.
- High-traffic entity rows are stored **verbatim** as their frozen models (`CandidateIdea`, `CriticReview`, `CheckResult`, `NoveltyScore`, `FitnessScore`, `JudgeResult`), validated already at the append boundary (P0.10), so the reducers never recompute them — `apps/api/src/projections/reducers/entities.ts:21`.

**Internal read shapes (apps/api-internal, NOT Appendix-A contracts):** `CurrentState`, `RunRow`/`GenerationRow`/`AgenomeRow`/`LineageEdgeRow` (`apps/api/src/projections/reducers/state.ts:49`), `ReplaySummary`/`ReplayDigest` (`apps/api/src/projections/replay-summary.ts:17`), `RunHealth`/`CapsConsumed` (`apps/api/src/projections/run-health.ts:33`), and the Shared-Knowledge graph `ResearchKnowledgeGraph` (+ `ResearchNote`, `ResearchEdge`, `ResearchEdgeType`, `ResearchAgenome`) (`apps/api/src/projections/research-notes.ts:24`, `:44`, `:60`, `:69`). These are free to change without a contract bump — none is a frozen Appendix-A model.

**Errors:** `ProjectionError` with a closed reason union — `empty | mixed_run | schema_version_unsupported | sequence_gap | sequence_non_monotonic` — thrown, never swallowed (`apps/api/src/projections/projection-builder.ts:23`, `:35`).

## Data & state

There is **no projection-owned persistent state on the load-bearing path** — every read endpoint *rebuilds on read* from `readByRun` (LESSON §57). The important structures are in-memory results of a fold:

`CurrentState` (`apps/api/src/projections/reducers/state.ts:49`) — ten id-keyed record maps:

```
runs · generations · agenomes · candidateIdeas · criticReviews
checkResults · noveltyScores · fitnessScores · judgeResults · lineageEdges
```

Keying **by id + SET** (never append/increment) is what makes a re-fold idempotent: re-applying an event writes the same key to the same value (`apps/api/src/projections/reducers/state.ts:14`).

`ResearchKnowledgeGraph` (`apps/api/src/projections/research-notes.ts:69`) — three id-keyed record maps, all id-keyed-and-SET like `CurrentState`:

```
notes · edges · agenomes
```

- **`ResearchNote`** (`:24`) — `id = research-note:{runId}:{sequence}` (the per-run `sequence` is the sole ordering key, so the id is **replay-stable**), `runId`, `generationId`, `agenomeId`, `toolName`, `query?`, `snippet` (whitespace-collapsed, capped at `RESEARCH_SNIPPET_MAX = 280` chars — the full result text stays in the log, rule #2), `sourceUrls[]`, `sequence`, `eventId`. **No vector field** — embeddings are deferred (see Gotchas).
- **`ResearchEdge`** (`:46`) — `{ id, source, target, type }` where `ResearchEdgeType` (`:44`) is the closed `'researched' | 'cited' | 'retrieved'`. `source` is an `agenomeId` for `researched`/`retrieved`, a `candidateId` for `cited`; `target` is always a `ResearchNote` id. Edge ids are kind-prefixed (`researched:`/`cited:`/`retrieved:`) so they never collide.
- **`ResearchAgenome`** (`:60`) — `{ id, culled, score? }` — the **graveyard** record: `culled:true` (+ the cull `score` from `lineage.culled.scoreSnapshot`) marks research that came from a killed lineage, surfacing dead-ends *with* their low fitness (anti-survivorship-bias).

**Where state actually lives:**
- The authoritative truth is the `run_events` table (layer 01) — this layer only reads it.
- A `dashboard_snapshots` table exists in the schema as an **optional, rebuildable, watermark-carrying cache** (`apps/api/src/event-store/schema.ts:160`). **UNVERIFIED / DRIFT-adjacent:** I found no production code that writes to or reads from `dashboard_snapshots`; the cache + watermark-staleness path is built (`isStale`/`latestSequence` are unit- and integration-tested) but **not wired** — routes always rebuild fresh. This matches §9's "(optional)" labeling and LESSON §57's "dashboard_snapshots cache + watermark-staleness deferred."

## Dependencies

**Depends on (inward):**
- `packages/contracts` — frozen models, `CURRENT_SCHEMA_VERSION`, `ProjectionWatermark`, `LineageGraphProjection`, and the entity schemas it folds verbatim.
- `event-store` (layer 01) — the `RunEventRow` shape and `readByRun` (via the replay reader), plus the `runEvents`/`dashboardSnapshots` Drizzle schema (a **read-only cross-layer import** for `listRunIds`/`latestSequence` — editing the event-store file is avoided; reading its schema is fine, LESSON §57).
- Drizzle / `node-postgres` — only inside the two thin DB helpers (`run-list.ts`, `watermark.ts`); the folds themselves touch no DB.

**Used by (outward):**
- **Routes (layer 07)** — `runs-read.ts` calls `buildCurrentState`/`buildLineageGraph`/`buildReplaySummary`/`buildResearchNotes`/`listRunIds`; `run-health.ts` calls `buildRunHealth`; `runs.ts` reads run status via `buildCurrentState` (`apps/api/src/routes/runs-read.ts:4`, `:8`, `apps/api/src/routes/run-health.ts:3`). `GET /runs/:id/knowledge` serves `buildResearchNotes` rebuilt-on-read (`apps/api/src/routes/runs-read.ts:80`).
- **Frontend (layer 08)** consumes the JSON these projections serialize (lineage graph for React Flow, replay summary, health).
- The **runtime kernel** does **not** depend on this layer (the layering rule forbids `runtime → projections`); the kernel's own log-derivations — `terminalClassifier`, `crashForward` — live in layer 03 and re-implement their reads to avoid the dependency. `listRunIds` is shared into the kernel only via **dependency injection** (the kernel receives it as a function), never an import (`apps/api/src/runtime/worker/runWorker.ts:54`).

## How it works (flow)

The whole layer is one pattern: **fold the ordered log, then transform**.

```
run_events ──readByRun──▶ RunEventRow[] (asc sequence)
                              │
                  buildProjection (guards ordering, schemaVersion)
                              │  reducer injected
        ┌─────────────────────┼─────────────────────────┐
        ▼                     ▼                          ▼
 currentStateReducer    (reused by)                 (reused by)
   = lifecycle          buildReplaySummary          buildRunHealth
   + entities                │                          │
   + lineage          ReplaySummary{state,digest}   RunHealth
   + winner                  │
        │                    └── canonicalize(replay) === canonicalize(captured)  (rule #7)
        ▼
 WatermarkedProjection<CurrentState>
        │
   buildLineageGraph (pure transform, no re-fold)
        ▼
 LineageGraphProjection ──▶ React Flow ──lineageToExport──▶ Neo4j spike
```

**Step-by-step (current-state fold):**

1. `buildProjection` takes the first event's `runId`/`sequence` as the baseline (`projection-builder.ts:70`).
2. For each event it gates: `schemaVersion ≤ CURRENT_SCHEMA_VERSION` (`:82`), same `runId` (`:89`), strictly `prev+1` monotonic — any gap or non-advance throws (`:96`). It **never silently re-sorts or skips** (LESSON §31's validate-not-sort discipline).
3. It runs the injected reducer and advances `prevSequence` (`:111`).
4. `currentStateReducer` runs all 5 per-concern reducers per event, each a no-op for types it does not handle (`current-state.ts:40`). The **winner reducer is appended LAST** so the candidate row is already materialized when `run.completed` folds (`current-state.ts:34`).
5. The result carries `sequenceThrough` = the highest folded sequence — the watermark.

**The reducers (each a narrow fold):**
- **lifecycle** (`reducers/lifecycle.ts:96`) — run/generation/agenome status via two frozen transition maps; materializes reproduction children as `'seeded'` (`:78`); moves agenomes to `reproduced`/`failed`/`culled`.
- **entities** (`reducers/entities.ts:21`) — stores high-traffic payloads verbatim by id; `novelty.scored` reads the persisted vector back unchanged (never re-embeds, rule #7, `:75`); terminal transitions for `candidate_invalidated`/`candidate.rejected`.
- **lineage** (`reducers/lineage.ts:22`) — reproduction → one edge per parent→child; `lineage.culled` → status transition on candidates or agenomes.
- **winner** (`reducers/winner.ts:33`) — `run.completed.finalIdeaRef` → that candidate's status becomes `'selected'`.

**Lineage graph** (`lineage-graph.ts:26`) is a *transform of current-state*, not a re-fold: it emits one node per entity (the held-out judge renders as a `score` node — there is no `judge` node type, LESSON §54), then structural edges (guarded — emitted only when **both** endpoints exist, because React Flow breaks on a dangling edge, `:120`) and reproduction edges. Edge ids are **kind-prefixed** (`struct:` vs `repro:`) so they never collide — React Flow also breaks on duplicate edge ids (`:118`). Each node also gets a `generationIndex?`: `generationIndexOf` (`:32`) parses the `…-gen<N>` suffix off the generation id; candidate/critic/check/score nodes inherit their candidate's column via `genIndexByCandidate` (`:60`). Unparseable id → field omitted (the renderer falls back), so the parse is pure and never throws.

**Research-notes fold** (`research-notes.ts:126`) is a fourth concrete projection injected into the *same* `buildProjection` core — a separate fold from current-state, not a transform of it. For each event type it builds part of the `ResearchKnowledgeGraph`:
- `tool_call.finished` (`:131`) → a normalized `ResearchNote` (tool + normalized query + ≤280-char snippet + extracted source URLs) **plus** a `researched` edge `agenome →(wrote)→ note`, and records the researching agenome (default not-culled).
- `candidate.created` (`:217`) → for each `evidenceRef` whose `eventId` matches a note's source event, a `cited` edge `candidate →(cited)→ note`.
- `candidate.generation_started` (`:191`) → the **stigmergy READ**: the loop persists the retrieved-note-id *set* on this op-marker (rule #7), and the fold turns each into a `retrieved` edge `agenome →(read)→ note` — distinct from the `researched` *write* edge.
- `lineage.culled` (`:167`) → the **graveyard**: marks each culled `agenomeId` and carries its cull `score` from `scoreSnapshot`. The merge is ordering-robust — whether the cull folds before or after the agenome's notes, a single record survives and a `researched`/`retrieved` branch never clobbers an existing `culled:true`.

Every other event type is a no-op. `buildResearchNotes` (`:242`) wraps this reducer in `buildProjection`, so the result carries the same `(runId, sequenceThrough)` watermark as every other projection.

## Design decisions & rationale

- **Projection = generic fold + injected reducer** (not a hand-rolled per-projection loop). One audited core enforces ordering/schema gates once; concrete projections inject behavior (LESSON §51, §53). — `projection-builder.ts:65`, `current-state.ts:30`
- **Validate-not-sort.** A corrupted log throws a typed error rather than being silently repaired — masking a producer bug would corrupt the read silently (ARCHITECTURE.md §9 replay-reader paragraph; LESSON §31). — `projection-builder.ts:96`
- **Canonical serialization mirrors `JSON.stringify`'s `toJSON`** (Date→ISO at `:131`) so two equal states serialize byte-identically and a stray `Date` cannot collapse to `{}` and create a false equivalence (LESSON §31). — `projection-builder.ts:126`
- **Winner is projection-DERIVED, kernel-DECIDED.** No `candidate.selected` event exists in the MVP; the kernel records the winner only as `run.completed.finalIdeaRef` (the top scored, non-culled survivor). One reducer marks it (ARCHITECTURE.md §10 "Selected-winner derivation"; LESSON §68, §92). When an authoritative P5 `candidate.selected` later lands it supersedes by `candidateId` join — zero new contract surface (`CandidateStatus` already has `'selected'`). — `reducers/winner.ts:7`
- **Secondary projection = pure transform, never a re-fold** (lineage-graph, lineage-export, replay-summary all carry the watermark through). A frozen-model producer pins conformance via `safeParse`, not a new snapshot (LESSON §54, §30). — `lineage-graph.ts:11`, `lineage-export.ts:6`
- **Health omits 2 of 6 caps deliberately** — `maxSpawnDepth` (a per-lineage tree property, not a running total) and `wallClockTimeoutMs` (live-clock derived, out of band of a log-fold) are not reconstructible as a monotonic "consumed" counter, so they surface at integration when the live worker reports them (`run-health.ts:24`).
- **The knowledge space is a PROJECTION, never a new system of record.** The agents' research is *already* in the append-only log (`tool_call.finished`); folding it into a `ResearchKnowledgeGraph` adds zero authoritative state (rule #2). Note ids are derived from `{runId}:{sequence}` so they are byte-stable across a re-fold, and the snippet is a *lean* excerpt — the full grounded result text is never copied out of the log (`research-notes.ts:8-21`). — `research-notes.ts:126`
- **Three edge semantics make stigmergy legible.** A `researched` edge is an agent *writing* a pheromone trail; a `retrieved` edge is a later agent *reading* (and departing from) a prior trail — the literal stigmergy signal; a `cited` edge is a candidate *grounding a claim* in a note. Keeping them as distinct edge types (rather than one undifferentiated link) is what lets the viz show "who learned from whom." — `research-notes.ts:44`
- **The graveyard fights survivorship bias.** Surfacing culled lineages' research *with* their low fitness (`ResearchAgenome.culled` + `score`) turns dead-ends into negative knowledge — a map of walls the swarm already hit — instead of silently dropping them. — `research-notes.ts:60`

## Safety & invariants

This layer is a primary mechanical enforcer of two of the nine rules:

**Safety rule #2 — projections are DERIVED & rebuildable, never authoritative; the winner is kernel-decided, projection-marked not projection-invented.**
- *Mechanism:* No module in `apps/api/src/projections/` writes to `run_events` or mutates any authoritative state — the only DB calls are reads (`selectDistinct` in `run-list.ts:14`, `max(sequence)` in `watermark.ts:33`). Routes rebuild on read. Any cached projection (`dashboard_snapshots`) carries the `(runId, sequenceThrough)` watermark and is discarded/rebuilt when newer events exist — `isStale(watermark, latestSequence)` is the pure predicate (`watermark.ts:20`).
- *Winner mechanism:* `winnerReducer` only ever **reads** `run.completed.finalIdeaRef` and SETs an existing candidate to `'selected'`. No `finalIdeaRef` → no-op; a ref to a non-materialized candidate → defensive no-op — it can never fabricate a winner (`reducers/winner.ts:33`, pinned by `winner.test.ts` `test_no_finalIdeaRef_marks_no_winner` / `test_finalIdeaRef_to_absent_candidate_is_noop`).
- *Research-notes mechanism:* `researchNotesReducer` is the same shape of guarantee — `ResearchNote`s, all three edge types, and the graveyard `ResearchAgenome`s are **derived from log events only** and write nothing back. The only authoritative write the feature makes is the runtime appending the retrieved-note-id set onto `candidate.generation_started` (via the append path, layer 03 — *not* a projection edit); this layer merely *re-reads* it (`research-notes.ts:191`).

**Safety rule #7 — replay state-equivalence; replay calls no providers.**
- *Mechanism (structural, not runtime-guarded):* `replay-reader.ts` and `replay-summary.ts` import **no** provider/gateway/embedding/web/RNG symbol — replay is pure by construction. An import-ban test (`replay-summary.test.ts` `test_replay_imports_no_provider`) greps both files for forbidden imports AND for `Math.random(` / `fetch(` calls.
- *State-equivalence:* `canonicalize(buildReplaySummary(log).state) === canonicalize(buildCurrentState(log).state)`, asserted unit (`replay-summary.test.ts:81`) and integration against real Postgres (`test/integration/projections/replay-summary.test.ts:76`).
- *Read-back, never recompute:* persisted RNG outcomes (reproduction mode in the edge), novelty vectors, and retrieval results are read verbatim from their events, never re-sampled/re-embedded/re-called (`reducers/entities.ts:75`; `replay-summary.test.ts` `test_replay_reads_persisted_*`). The `retrieved` edges follow the same rule: the *outcome* of an in-run kNN retrieval (the note-id set) is persisted on `candidate.generation_started`, and the projection re-folds that set on replay — it **never re-runs the retriever or calls an index** (`research-notes.ts:191`). `research-notes.ts` imports only `@doppl/contracts` + the local `projection-builder` (no provider/embedding seam in scope), so re-retrieval is structurally impossible, not flag-guarded.
- An older-`schemaVersion` fixture (`test/fixtures/replay/older-schema-run`) replays through the `≤ current` gate, proving backward compatibility.

## Gotchas & sharp edges

- **`degraded` and `repairing` have NO event-fold transition (LESSON §62).** These are kernel-*internal* state-machine statuses with no event type that carries them — the fold has nothing to key on, so inventing a transition would fabricate a log signal that never fires. This is the **converse** of the winner case (where there *is* an authoritative `finalIdeaRef` to key on, so a transition is correct, LESSON §92). Pinned exhaustively over the closed `RunEventType` registry: `current-state.test.ts` `test_degraded_repairing_have_no_event_transition` (`:345`).
- **Child generation-id is derived by string convention, not from the log.** `deriveChildGenerationId` parses the `…-gen<N>` pattern to home a reproduced child at gen N+1; a non-conventional id (e.g. a test fixture) falls back gracefully rather than throwing — a projection never crashes on a stray payload (unlike the live successor-threading derivation, which fails loud) (`reducers/lifecycle.ts:62`).
- **Two distinct `createReplayReader`/`ReplayReader` exist.** This layer's `projections/replay-reader.ts` is a thin `read(runId)` wrapper over `readByRun`; the event-store's `event-store/replay-reader.ts` is the validate-not-sort `replayEvents`/`replayRun` integrity reader. They are different surfaces — do not confuse them. **UNVERIFIED:** I did not find a production consumer of `projections/replay-reader.ts`'s `createReplayReader` (routes call `buildReplaySummary(events)` directly after `readByRun`); it appears to be a defined-but-thin seam.
- **Health pairing is count-based and can over-count.** `operations-in-flight = max(0, count(*_started) − count(completion))`; a failed/aborted op (start with no completion) stays counted. Accepted for the rough operator signal (`run-health.ts:11`, LESSON §58).
- **Attribution: the stigmergy graph lives ENTIRELY in `research-notes.ts`, NOT `lineage-graph.ts`.** A natural assumption is that the lineage graph grew the `retrieved` edges and the graveyard — it did **not**. `lineage-graph.ts`'s *only* change this window is the `generationIndex` render-column field (`:32`–`:64`), a separate per-generation-layout concern. The `ResearchKnowledgeGraph` — notes, all three edge types, and the graveyard — is a wholly separate projection in `research-notes.ts` served by `GET /runs/:id/knowledge`. Keep the two read models distinct; they share only the `buildProjection` core.
- **The `research-notes` projection is the substrate; the feature is bigger.** This layer folds the graph and serves it read-only. The in-run *retriever* (the pure kNN that picks which notes an agent reads), the prompt threading (snippets as untrusted sentinel-wrapped DATA, rule #5), and the React Flow viz are all *outside* this layer — see [11-shared-knowledge-space.md](11-shared-knowledge-space.md).
- **DRIFT (MVP subset deferred — acknowledged in code):** `ResearchNote` persists **no vector** — only `snippet` + `sourceUrls`. The planned embeddings/pgvector slices are not built; pgvector is not installed and the shipped retrieval is the **lexical (Jaccard) MVP**. The projection's own docstring frames embeddings as a "later slice" (`research-notes.ts:15`), and the boot retriever documents the cosine path as a dormant follow-up that auto-engages only once notes carry same-dimension vectors (`apps/api/src/boot/knowledgeRetriever.ts:20`). Honest MVP subset, not a correctness gap — but the projection cannot store an embedding today.
- **DRIFT (harmless, documented in §9 itself):** the §4 flow diagram labels replay ordering "ordered by run_id, sequence"; the code orders by `sequence` alone within a `WHERE run_id = $1` scope — functionally equivalent, the diagram notation is loose (ARCHITECTURE.md §9 "§4 diagram note").
- **DRIFT (stale prose mirror, low sev):** the `apps/api/CLAUDE.md` cross-doc table (`LineageGraphProjection` row, `apps/api/CLAUDE.md:161`) still describes `LineageNode` as "strict **6-field** {id, type, label, status?, metrics?, dataRef}", but the frozen contract is now strict **7-field** with `generationIndex?` added (`packages/contracts/src/projections/lineage-graph.ts:35`; the field-set snapshot was updated to `toHaveLength(7)`). The prose row is stale; `generationIndex` is additive/optional with no `schemaVersion` implication. (Flagged, not fixed — this doc does not edit `CLAUDE.md`.)
- **DRIFT (cache deferred):** §9's canonical table lists `dashboard_snapshots` as a rebuildable projection, but no production code populates it — the watermark/staleness machinery is built and tested but unwired (rebuild-on-read instead). Not a correctness gap; the staleness invariant has no cache to apply to yet.

## Connects to

- [00-contracts-event-model.md](00-contracts-event-model.md) — the frozen models folded verbatim (`CandidateIdea`, `FitnessScore`, …), `CURRENT_SCHEMA_VERSION`, `ProjectionWatermark`, and `LineageGraphProjection`. Handoff: this layer's schema gate (`projection-builder.ts:82`) and its verbatim entity rows.
- [01-persistence-event-store.md](01-persistence-event-store.md) — the source of truth. Handoff: `readByRun` → `RunEventRow[]`; the `runEvents`/`dashboardSnapshots` Drizzle schema this layer read-imports; and the event-store's own validate-not-sort `replayEvents` (distinct from this layer's replay summary).
- [03-runtime-kernel.md](03-runtime-kernel.md) — the kernel decides the winner (`terminalClassifier` → `run.completed.finalIdeaRef`) that `winnerReducer` marks, and consumes `listRunIds` via DI. Handoff: `finalIdeaRef` (kernel writes) → `'selected'` (this layer marks).
- [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md) — produces the `fitness.scored`/`novelty.scored`/`lineage.culled`/reproduction events the entity & lineage reducers fold. A future authoritative `candidate.selected` (P5) would supersede the derived winner mark.
- [07-backend-api-rest-sse.md](07-backend-api-rest-sse.md) — the primary consumer: routes rebuild these projections on read and serialize them. Handoff: `buildCurrentState`/`buildLineageGraph`/`buildReplaySummary`/`buildResearchNotes`/`buildRunHealth`/`listRunIds`. `GET /runs/:id/knowledge` (`runs-read.ts:80`) is the endpoint that serves `buildResearchNotes` rebuilt-on-read (404 on an unknown/empty run, mirroring the other read endpoints).
- [08-frontend-dashboard.md](08-frontend-dashboard.md) — renders the lineage graph (React Flow, now bucketed into per-generation columns by `LineageNode.generationIndex`), replay summary, health, and the Knowledge-Evolution graph (consumes `GET /runs/:id/knowledge`).
- [10-cross-cutting-safety.md](10-cross-cutting-safety.md) — the nine safety rules; this layer is a primary enforcer of #2 (derived/rebuildable) and #7 (replay purity/state-equivalence).
- [11-shared-knowledge-space.md](11-shared-knowledge-space.md) — the full Shared-Knowledge / stigmergy feature end-to-end (the in-run retriever, prompt threading, viz). This layer owns only the `research-notes` projection mechanics; 11 owns the rest. Handoff: `buildResearchNotes` → `ResearchKnowledgeGraph`; the `candidate.generation_started.retrievedNoteIds` set this layer re-folds into `retrieved` edges (the rule-#7 replay carrier).
