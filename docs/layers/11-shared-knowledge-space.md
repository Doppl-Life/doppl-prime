# Shared Knowledge Space (Stigmergy)

## Executive summary

When Doppl's agents research a problem — running a web search, fetching a URL, querying X or YouTube — each result is already written to the append-only event log. This layer turns that exhaust into a **shared substrate other agents can read and depart from**. The guiding metaphor is **stigmergy** (ant-colony pheromone trails): an agent leaves a research "trace" in the shared environment, later agents read the nearby traces and either *build on them* (converge) or *deliberately avoid them* (diverge), and useful structure emerges from the swarm without any central planner. It is explicitly **not** a "second brain" for a single persistent user — it is a pheromone map for a population of ephemeral agents under selection.

The value of this feature *is the flow*, so it is genuinely cross-cutting and no single existing layer owns it. The flow is: an agenome's research is emitted as a `tool_call.finished` event (free — it was already in the log) → a derived **ResearchNote projection** folds those events into a knowledge graph (notes + edges + a "graveyard" of culled lineages) → at generation time the loop asks an injected **kNN retriever** for the nearest (or farthest) notes to the next agenome's persona → the retrieved snippets are threaded into that agenome's prompt as untrusted DATA, and the retrieved note-id *set* is persisted on a `candidate.generation_started` marker so replay re-threads identically without re-querying → the projection folds that marker into animated "retrieved" edges → a REST endpoint serves the whole graph → the React-Flow **Knowledge-Evolution** view renders it.

The shipped MVP is honest about its scope: retrieval is **lexical** (Jaccard token overlap) and **keyless** — `ResearchNote` persists no embedding vector yet, so the cosine/pgvector path exists in code but is dormant. It self-gates to byte-identical baseline behaviour on any run that left no research notes (gen-0, recorded, replay).

## Responsibilities

- **Accountable for:** turning persisted research (`tool_call.finished`) into a **derived, rebuildable** knowledge substrate (the ResearchNote projection); offering a **pure, replay-safe kNN retriever** that scores notes against an agenome's persona and returns the k nearest (converge) or k farthest (diverge); wiring those two into the live worker as an **in-run read-during-generation seam** that persists its outcome (rule #7) and threads snippets as untrusted DATA (rule #5); recording **culled lineages' research as a graveyard** (negative knowledge / anti-survivorship-bias); serving the graph (`GET /runs/:id/knowledge`); and visualizing it (the Knowledge-Evolution graph).
- **NOT a system of record.** The ResearchNote graph is a projection — it authors nothing, writes nothing to `run_events`, and is thrown away and re-folded from the log on demand (rule #2). The *only* write this feature makes is the `candidate.generation_started` marker, appended through the normal append path.
- **NOT a fitness lever the judge can see.** Retrieved notes reach the `population_generator` request **only**; the held-out judge and critic council use a different isolation chokepoint that has no retrieval parameter, so a note can never structurally reach the judge (rule #6).
- **NOT a new persistence tier.** No pgvector, no Neo4j, no cross-run index. The substrate lives entirely as an in-memory fold over the per-run log; the embeddings/pgvector/cross-run/Neo4j slices of the design plan are deferred (see Gotchas).
- **NOT a provider caller on the read path.** `retrieveNotes` is pure (no gateway/clock/`Math.random`); the boot bridge reads the log only; replay never re-runs the retriever.

## Key components

| Component | What it does | path:line |
|-----------|--------------|-----------|
| `ResearchNote` / `ResearchEdge` / `ResearchAgenome` / `ResearchKnowledgeGraph` | The substrate types: a normalized note (tool + query + ≤280-char snippet + source URLs) + edges + per-agenome graveyard status, folded into `{notes, edges, agenomes}` | `apps/api/src/projections/research-notes.ts:24`, `:44`, `:60`, `:69` |
| `researchNotesReducer` | Pure ordered fold injected into `buildProjection`: `tool_call.finished`→note + `researched` edge; `candidate.created`→`cited` edge; `candidate.generation_started`→`retrieved` edges; `lineage.culled`→graveyard | `apps/api/src/projections/research-notes.ts:126` |
| `buildResearchNotes` | Convenience: folds a run's events into a watermark-tagged `ResearchKnowledgeGraph` | `apps/api/src/projections/research-notes.ts:242` |
| `retrieveNotes` (pure kNN) | Scores notes vs a query, returns k NEAREST (`near`/converge) or k FARTHEST (`far`/diverge); cosine when vectors present, else Jaccard lexical; ties break by id asc (deterministic) | `apps/api/src/selection/knowledge/retrieve.ts:78` |
| `createKnowledgeRetriever` (boot bridge) | Layering bridge: folds notes (`buildResearchNotes`) + runs the kNN (`retrieveNotes`) behind the loop's `RetrieveKnowledge` port; uses `agenome.systemPrompt` as the query | `apps/api/src/boot/knowledgeRetriever.ts:53` |
| `directionForBias` | Maps the FB.4 `generationBias` dial to retrieval direction: `bias > +0.2` → `far` (diverge); converge / neutral / absent → `near` | `apps/api/src/boot/knowledgeRetriever.ts:40` |
| `RetrieveKnowledge` port (+ `RetrievedKnowledge`, `RetrieveKnowledgeArgs`) | The runtime-local injected seam the loop sees; default ABSENT → byte-identical baseline | `apps/api/src/runtime/loop/generationLoop.ts:280`, `:263`, `:255` |
| `buildPopulationRequest` (KB threading) | Threads retrieved snippets as a SECOND `wrapUntrusted` user message + `KB_RETRIEVAL_FRAMING` in the system message; absent/empty → byte-identical | `apps/api/src/runtime/loop/generationLoop.ts:87`, `:64` |
| In-run retrieval seam (persist + thread) | Per agenome: call `retrieveKnowledge`, persist the note-id SET on `candidate.generation_started`, thread snippets into the population request | `apps/api/src/runtime/loop/generationLoop.ts:684` |
| `composeRuntime` KB wiring | Wires `createKnowledgeRetriever` UNCONDITIONALLY into the loop deps (self-gates to `undefined` when no notes) | `apps/api/src/boot/composeRuntime.ts:226` |
| `GET /runs/:id/knowledge` | Rebuild-on-read endpoint returning `WatermarkedProjection<ResearchKnowledgeGraph>`; 404 on unknown/empty run | `apps/api/src/routes/runs-read.ts:80` |
| `knowledgeToFlow` / `layoutKnowledge` / `knowledgeNodeTypes` / `KnowledgeGraph` / `KnowledgeView` | The Knowledge-Evolution React-Flow viz: generation columns, agenome hubs, note leaves, tool-hued cards, red graveyard, animated cyan `retrieved` edges, 4s poll | `apps/web/src/knowledge/knowledgeToFlow.ts:73`, `layout.ts:21`, `nodeTypes.tsx:15`, `KnowledgeGraph.tsx:59`, `apps/web/src/routes/KnowledgeView.tsx:54` |

## Interfaces & contracts

**The substrate types** (apps/api-internal — **not** Appendix-A frozen contracts; free to change without a schemaVersion bump):

- `ResearchNote` — `apps/api/src/projections/research-notes.ts:24`:
  ```
  { id: "research-note:{runId}:{sequence}", runId, generationId|null, agenomeId|null,
    toolName, query?, snippet (≤280 chars), sourceUrls[], sequence, eventId }
  ```
  The id is `research-note:{runId}:{sequence}` — replay-stable (`sequence` is the sole ordering key). **No vector field yet** — embeddings are deferred.
- `ResearchEdge.type` = `'researched' | 'cited' | 'retrieved'` (`:44`). Three distinct semantics (see Data & state).
- `ResearchAgenome` = `{ id, culled, score? }` (`:60`) — the graveyard status: was the lineage culled, and at what cull fitness.
- `ResearchKnowledgeGraph` = `{ notes, edges, agenomes }`, each an id-keyed record (`:69`).

**The pure retriever** — `apps/api/src/selection/knowledge/retrieve.ts:78`:
```
retrieveNotes({ query: {text, vector?}, notes: RetrievalNote[], direction: 'near'|'far', k })
  => RetrieveResult { method: 'cosine'|'lexical_jaccard', direction, notes: RetrievedNote[] }
```
Cosine fires only when the query carries a vector AND ≥1 note carries a same-dimension vector; otherwise it falls back to Jaccard over the snippets. `k <= 0` or no scorable notes → empty.

**The boot bridge** — `apps/api/src/boot/knowledgeRetriever.ts:53`:
```
createKnowledgeRetriever({ readByRun, generationBias?, k? }) => RetrieveKnowledge
```
Default k = 3 (`:31`); direction is fixed once per run from `generationBias` via `directionForBias`.

**The injected loop port** — `apps/api/src/runtime/loop/generationLoop.ts:280`:
```
RetrieveKnowledge: (args:{runId, generationId, agenome})
  => Promise<RetrievedKnowledge | undefined> | RetrievedKnowledge | undefined
RetrievedKnowledge = { noteIds[], snippets[], direction:'near'|'far', method }
```

**The REST endpoint** — `apps/api/src/routes/runs-read.ts:80`:
```
GET /runs/:id/knowledge
  200 → WatermarkedProjection<ResearchKnowledgeGraph> { runId, sequenceThrough, state }
  404 → { error:'run_not_found', runId }   (zero events)
```

**The persisted carrier (the only write):** `candidate.generation_started` — a **pre-existing** P0.1-amend op-start marker (one of the 11 observability markers) — now also carries `{ agenomeId, retrievedNoteIds[], retrievalDirection, retrievalMethod }`. These ride the generic `z.record` payload (`GENERIC_PAYLOAD_SCHEMA`), so there is **no contract / schemaVersion bump** (lesson §107). See [00-contracts-event-model.md](00-contracts-event-model.md).

## Data & state

**Where state lives.** The authoritative truth is `run_events` (layer 01). The ResearchNote graph is an in-memory fold rebuilt on read — there is **no projection-owned persistent state** (rebuild-on-read, no `dashboard_snapshots` cache).

**The three edge semantics** (`apps/api/src/projections/research-notes.ts:44`) are the heart of the model — they distinguish *who did what to a note*:

| Edge | Source → Target | Meaning | Folded from |
|------|-----------------|---------|-------------|
| `researched` | agenome → note | the agent **WROTE** this pheromone trail | `tool_call.finished` (`:131`) |
| `retrieved` | agenome → note | the agent **READ** a prior agent's trail (the stigmergy read) | `candidate.generation_started.retrievedNoteIds` (`:191`) |
| `cited` | candidate → note | a candidate's `evidenceRef` pointed at a note | `candidate.created.evidenceRefs` (`:217`) |

**The graveyard** (`:167`). `lineage.culled` carries `targetIds[]` + a `scoreSnapshot`; the reducer marks each culled agenome `{culled:true, score}` so a culled lineage's research surfaces **with its low fitness** — a map of dead ends ("3 agents tried this; it scored 0.3") that lets the swarm stop re-walking known walls. The fold is **ordering-robust**: a `lineage.culled` that folds before a `researched`/`retrieved` edge for the same agenome is never clobbered back to not-culled (`:154`, `:209`).

**What is persisted vs reconstructable.** Only `retrievedNoteIds` (a SET, not the snippet text) + `direction` + `method` ride the marker. The snippet *text* fed into the prompt is reconstructable by joining each `noteId` back to its `tool_call.finished` snippet in the same log. Replay equivalence holds regardless because the candidate **output** is already persisted and the loop never re-runs on replay — the projection just re-folds the persisted note-id set into the same `retrieved` edges.

## How it works (flow)

```
WRITE side (free — already in the log)
  agenome research ──tool_call.finished{agenomeId,generationId,query,result}──▶ run_events
        (the tool-relay path; cross-link 12)

READ-during-generation (the selection lever)        ┌── persisted carrier ──┐
  loop, per agenome about to generate:              │                       │
    deps.retrieveKnowledge({runId,generationId,agenome})                    │
        │  boot closure (knowledgeRetriever.ts:56)                          │
        ▼                                                                    ▼
    readByRun → buildResearchNotes → {id,snippet}[] ─ retrieveNotes ─▶ RetrievedKnowledge
        (agenome.systemPrompt = query; near/far from generationBias)         │
        │ ≥1 note?                                                           │
        ├── yes ─▶ append candidate.generation_started{retrievedNoteIds,…} ──┘ (rule #7)
        │      ─▶ buildPopulationRequest(..., snippets)                      (rule #5)
        │              2nd wrapUntrusted user msg + KB_RETRIEVAL_FRAMING
        └── no  ─▶ byte-identical baseline (no marker, no extra message)

PROJECTION / READ side
  researchNotesReducer folds: tool_call.finished→note+researched,
     candidate.generation_started→retrieved, lineage.culled→graveyard,
     candidate.created→cited
        ▼
  GET /runs/:id/knowledge → WatermarkedProjection<ResearchKnowledgeGraph>
        ▼
  Knowledge-Evolution React Flow (gen columns · agenome hubs · note leaves ·
     animated cyan retrieved edges · tool-hued cards · red graveyard)
```

**Step-by-step (the in-run seam — `apps/api/src/runtime/loop/generationLoop.ts:684`):**

1. Before each agenome generates, the loop calls the injected `deps.retrieveKnowledge({runId, generationId, agenome})` (absent → `undefined`, baseline).
2. The boot closure (`knowledgeRetriever.ts:56`) reads `readByRun(runId)`, folds notes via `buildResearchNotes`, maps them to `{id, snippet}` (no vector — lexical MVP), and calls `retrieveNotes` with `agenome.systemPrompt` as the query and `direction` from `directionForBias(generationBias)`. Empty log / no notes → `undefined`.
3. If `≥1` note returns, the loop appends `candidate.generation_started` with the note-id SET, direction, and method via the append path (`:690`) — the rule-#7 carrier.
4. `buildPopulationRequest(systemPrompt, problem, operators, bias, retrieval?.snippets)` (`:701`, `:87`) threads the snippets as a **second** `wrapUntrusted` user message; the trusted system message gains `KB_RETRIEVAL_FRAMING` (`:64`) naming the notes as DATA-not-instructions. Absent/empty snippets → the request is byte-identical to the baseline.
5. Generation proceeds; the candidate is persisted as usual. Retrieval debits **no energy** (`:683`).

**Replay** never re-runs the loop or the retriever — the projection re-folds the persisted `candidate.generation_started.retrievedNoteIds`, so the `retrieved` edges reconstruct with no provider/index call (rule #7).

## Dependencies

**Depends on:**
- **Layer 06 (projections)** — `buildResearchNotes` is built on the generic `buildProjection` fold + `WatermarkedProjection` watermark machinery. The reducer is a sibling of the current-state/lineage reducers.
- **Layer 05 (selection)** — `retrieveNotes` lives under `selection/knowledge/` and reuses `selection/novelty/cosine.ts` + `selection/novelty/lexical-fallback.ts` ("novelty and memory are one muscle" — the same similarity primitives score both). The graveyard's cull status + score originate from selection's `lineage.culled`.
- **Layer 12 (tool-use)** — the *only* producer of `tool_call.finished`, the WRITE side. Without tool-using agents there are no notes (the retriever self-gates to baseline).
- **Layer 01 (event-store)** — `readByRun` (read) + the append path (the single `candidate.generation_started` write).
- The FB.4 `generationBias` dial (RunConfig) — picks near vs far, once per run.

**Used by:**
- **Layer 03 (runtime kernel)** — the generation loop consumes the `RetrieveKnowledge` port and owns the persist + thread.
- **Layer 07 (routes)** — `GET /runs/:id/knowledge` serves the projection.
- **Layer 08 (frontend)** — the Knowledge-Evolution graph renders it.
- **Boot** — `composeRuntime` is the layering bridge that lets the pure loop reach `projections` + `selection` it may not import directly.

## Design decisions & rationale

- **Stigmergy, not a second brain.** The design doc (`docs/planning/shared-knowledge-space.md`) fixes the load-bearing metaphor: a swarm of ephemeral agents under selection, not one persistent human. Convergence = following the strongest pheromone trail; divergence = deliberately anti-retrieving the most-dissimilar notes. The `near`/`far` direction and the FB.4 dial are the executable form of that dial.
- **Derived projection, never a new store** (rule #2). The research is *already* in the log; folding it costs nothing and stays rebuildable. This is why the substrate adds zero authoritative state and the only write is the replay carrier.
- **Read-during-generation is a *selection lever*, so it must be persisted per call** (rule #7). Because retrieval changes what the agent generates, the retrieved set is part of the run's determinism — it rides the existing `candidate.generation_started` marker (no new contract surface, lesson §107) so replay re-threads the identical set with no re-query.
- **Pure retriever + boot bridge split** (lesson §44 caller/adapter pattern). `retrieveNotes` is a pure kNN with no IO; the boot closure does the impure log read and composes projections + selection. The loop sees only the port → clean layering, and replay is provider-free **by construction** (`retrieve.ts:11`).
- **Wire it unconditionally; let it self-gate.** `composeRuntime` always injects the retriever (`:226`); the retriever returns `undefined` when the run has no notes. So a recorded/replay/gen-0/non-tool-using run is byte-identical to the pre-feature baseline — no conditional wiring, no fixture churn.
- **Lexical-first, cosine-ready.** Shipping Jaccard with no embedding call means a keyless/recorded run retrieves with no fixture change; `retrieveNotes` auto-upgrades to cosine the moment notes carry same-dimension vectors. The honest cost is that the cosine path is currently dormant (see Gotchas).
- **The graveyard fights survivorship bias.** Indexing culled lineages' research *with* their low scores is a deliberate inversion of the usual "keep only winners" instinct — a negative-knowledge map is as useful to the swarm as the positive trails.

## Gotchas & sharp edges

- **DRIFT — the shipped MVP is LEXICAL + KEYLESS (CONFIRMED).** The design plan's slice 1 specifies "`ResearchNote` … with embeddings" and slice 2 is the pgvector migration; the shipped `ResearchNote` persists **no vector** (snippet + sourceUrls only, `research-notes.ts:24`), retrieval is Jaccard (`knowledgeRetriever.ts:20`), **pgvector is not installed**, and the cosine branch in `retrieveNotes` (`retrieve.ts:83`) is dead in practice because no note carries a vector. The code self-describes this as the honest MVP subset and auto-upgrades once notes carry vectors. **Deferred plan slices:** slice 1's embeddings half + slice 2 (pgvector migration), slice 6 (GPS-migration UMAP viz), slice 7 (cross-run living brain + replay version-pinning), slice 8 (Neo4j GDS analytics). Slice 4 (heritable bibliography — offspring inherit research pointers) is also **not in this change** (no `bibliograph`/research-pointer code under `apps/api/src`; treat as deferred). Shipped: the projection (lexical), the in-run retrieval seam (slice 3), and the graveyard (slice 5).
- **Attribution: the `retrieved` edges + graveyard live in `research-notes.ts`, NOT `lineage-graph.ts`.** `lineage-graph.ts`'s only change in this window is an optional `generationIndex?` field for per-generation render columns (`lineage-graph.ts:32`) — a separate rendering concern, not the KB feature. Do not conflate the two graphs.
- **DRIFT (adjacent, low) — the `apps/api/CLAUDE.md` cross-doc table still describes `LineageNode` as a strict 6-field shape**, but the frozen contract is now 7-field with the additive `generationIndex?` (`packages/contracts/src/projections/lineage-graph.ts:35`). The prose mirror is stale; the field is additive/optional with no schemaVersion implication. Flagged, not fixed.
- **Frontend gotcha — `cited` KB edges are invisible (CONFIRMED, low).** The API emits `cited` edges with `source = candidateId` (`research-notes.ts:228`), but `knowledgeToFlow` builds nodes only for generations/agenomes/notes — **no candidate nodes** — so every `cited` edge is dropped as dangling at `knowledgeToFlow.ts:161`, and the gold `cited` branch in `knowledgeEdgeStyle` (`:64`) is unreachable for the current node set. It is a defensive drop (React Flow breaks on a dangling edge), not a crash; `KnowledgeLegend` correctly omits a `cited` row. The `researched` and animated-cyan `retrieved` edges *do* render (both endpoints are agenome/note nodes).
- **`directionForBias` is asymmetric.** `far`/diverge fires **only** when `generationBias > +0.2`; a strong converge lean (negative bias) AND neutral/absent both map to `near` (the deliberate default + most-useful behaviour). The dead-band is ±0.2 but only the positive edge flips direction (`knowledgeRetriever.ts:40`). This is local to the retriever and distinct from the FB.4 temperature dial's mapping.
- **Under concurrent agenome generation the visible note set is timing-dependent.** Siblings generate concurrently (`mapLimit`), so which sibling's `tool_call.finished` landed first determines what a given agenome's retriever sees. Rule #7 still holds because the **outcome** (the note-id set) is persisted on the marker and replay re-folds it — the live nondeterminism is captured, never re-derived.
- **The endpoint rebuilds on every call.** `GET /runs/:id/knowledge` returns the full `WatermarkedProjection` rebuilt-on-read (MVP — no cache) and 404s a run with zero events, mirroring the other read endpoints. The frontend `KnowledgeGraph` keeps the freshest projection by `sequenceThrough` watermark (`KnowledgeGraph.tsx:54`), so an out-of-order 4s poll never regresses the view.
- **The KB summary header counts only researching agenomes.** `agents` = distinct agenomeIds that produced a note; `culled` = agenomes that are *both* culled *and* researching (`KnowledgeGraph.tsx:72`). A culled lineage that did no research has an `agenomes` entry but no hub and is excluded — so the header can never read "1 agents · 2 culled."
- **Safety invariants this layer upholds** (all verified UPHELD): **#2** — derived/rebuildable projection, the only write is the marker via the append path (`research-notes.ts:126`); **#5** — retrieved notes ride a separate `wrapUntrusted` second user message, only `KB_RETRIEVAL_FRAMING` (candidate-independent) is added to the trusted system message (`generationLoop.ts:87`); **#6** — snippets reach `population_generator` only; the judge/critic chokepoint has no retrieval param, so a note can't structurally reach the judge (`composeRuntime.ts:236`); **#7** — `retrieveNotes` is pure, the note-id set is persisted, replay re-folds with no re-retrieval (`retrieve.ts:78`); **#8** — retrieval/embedding debits no energy (`generationLoop.ts:683`).

## Connects to

- [12-tool-use-research.md](12-tool-use-research.md) — the WRITE side: tool-using agents emit `tool_call.finished{agenomeId, generationId, query, result}` via the tool-relay path; that event is the only producer of notes. Handoff: the relayed tool event → `researchNotesReducer` folds it into a note + `researched` edge.
- [06-projections-read-models.md](06-projections-read-models.md) — the substrate is a projection: `buildResearchNotes` rides the generic `buildProjection` fold + `WatermarkedProjection`. Handoff: `researchNotesReducer` injected into `buildProjection`; the `generationIndex?` field on `LineageNode` (a sibling rendering concern, not the KB).
- [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md) — `retrieveNotes` lives under `selection/knowledge/` and reuses the novelty cosine/lexical primitives; the graveyard's cull status + `scoreSnapshot` originate from selection's `lineage.culled`. Handoff: `lineage.culled{targetIds, scoreSnapshot}` → graveyard agenomes.
- [03-runtime-kernel.md](03-runtime-kernel.md) — the generation loop owns the in-run seam: call the injected `RetrieveKnowledge` port, persist the note-id set on `candidate.generation_started`, thread snippets via `buildPopulationRequest`. Handoff: `deps.retrieveKnowledge` (← `composeRuntime`) and the rule-#7 marker append.
- [07-backend-api-rest-sse.md](07-backend-api-rest-sse.md) — `GET /runs/:id/knowledge` rebuilds the projection on read and serves the watermarked graph (404 on empty). Handoff: `buildResearchNotes(readByRun(id))`.
- [08-frontend-dashboard.md](08-frontend-dashboard.md) — the Knowledge-Evolution React-Flow graph (`apps/web/src/knowledge/*` + `KnowledgeView`) renders generation columns / agenome hubs / note leaves with animated cyan `retrieved` stigmergy edges, tool-hued cards, and red graveyard treatment; polled every 4s. Handoff: `runClient.getKnowledge` ↔ the endpoint.
- [00-contracts-event-model.md](00-contracts-event-model.md) — `candidate.generation_started` is a pre-existing op-start marker whose new payload fields ride the generic `z.record` payload (no schemaVersion bump, lesson §107).
- [10-cross-cutting-safety.md](10-cross-cutting-safety.md) — the nine safety rules; this feature exercises #2 (derived), #5 (untrusted notes), #6 (notes never reach the judge), #7 (persisted note-id set + pure retriever), #8 (no energy debit).
