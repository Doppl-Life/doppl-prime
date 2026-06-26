# Shared Knowledge Space — design + build plan (the agenome "hive memory")

> **Status:** DESIGN LOCKED (2026-06-25, with the user/Michael). **Build deferred** until after the
> evolution CLIMB work (Wave 1 + Wave 2 — see `docs/sessions/` and the scratchpad `climb-plan.md`). This doc
> is the executable spec for the session that carries it out.

## Core philosophy — STIGMERGY, not a "second brain"

A "second brain" (Obsidian / Tana / Mem / Garry Tan's G-Brain) is built for **one persistent human**. We have
a **swarm of ephemeral agents under selection**. The right prior art is **stigmergy** — ant-colony pheromone
trails: agents leave traces in a shared environment, other agents read + reinforce them, and **structure
emerges**. The knowledge space is the pheromone map; convergence = following trails, divergence =
deliberately avoiding them. This is the load-bearing metaphor for the whole design.

## What's already true (so we don't re-invent it)

- **The research is ALREADY persisted.** Every `tool_call.finished` event is in the append-only `run_events`
  log forever, carrying `agenomeId`; the candidate it fed + that candidate's fitness are one join away. So
  the knowledge space is a **derived PROJECTION over the log**, NOT a new system of record (rule #2).
- **Embeddings already exist** (OpenAI `text-embedding-3-small` via the `embedding` gateway role) but are
  stored as **`jsonb` in Postgres** (`event-store/schema.ts`), and novelty similarity is **brute-forced in
  app code** (`selection/novelty/cosine.ts`). pgvector is anticipated-but-deferred (§9, schema comment).
- **Neo4j is NOT running.** The only Neo4j artifact is `projections/lineage-export.ts` — a PURE, read-only
  transform into a Neo4j-*importable* shape, with no driver and no instance. Neo4j is a GRAPH db, not our
  vector store.

## Storage decision (with push-back, resolved)

**pgvector NOW; Neo4j LATER (as a derived graph projection), not the primary store.**

- **Vectors (hot path: in-run retrieval + novelty)** → **light up pgvector** in our existing Postgres.
  Lowest friction (embeddings already there as jsonb → migrate to a `vector` column + HNSW index), one
  extension not a second database to run/sync, replay-aligned, hybrid SQL+vector filters, and **the same
  index upgrades novelty** from brute-force cosine to a real ANN index ("novelty and memory are one muscle").
- **Graph (cold path: traversal + algorithms + dev viz)** → a **derived graph projection**. Neo4j's real
  edge over pgvector is deep multi-hop traversal + **GDS graph algorithms** (PageRank = "canonical" research,
  **community detection = a convergence/divergence detector**, centrality) + the built-in Browser/Bloom
  explorer. These are ANALYTICAL/periodic, NOT in the generation hot path, so they can be deferred and even
  done in Postgres (recursive CTEs / Apache AGE) to stay single-store. Honor the original "use Neo4j" intent
  HERE — the lineage/knowledge graph viz+analytics — not as the vector DB.
- **The product visuals are CUSTOM regardless of store** (React Flow lineage + a bespoke 2D canvas for the
  GPS-migration). Neo4j Browser/Bloom is a DEV/DEBUG explorer, not the demo UI. The GPS-migration is a VECTOR
  op (UMAP the embeddings → 2D) + a custom front-end — it rides on the embeddings (Postgres), not Neo4j.

## The agreed features (all GREEN-LIT by the user)

1. **In-run retrieval** (must-have) — agents query the KB during a run.
2. **Read-during-generation** (yes) — agents query the KB at generation time → it becomes a **selection
   lever** (it changes their ideas). ⇒ every retrieval MUST be persisted per-call (like tool results) so
   replay re-threads it and never re-queries (rule #7, lesson §44 caller/adapter split).
3. **Evergrowing cross-run brain** (the dream) — the index persists + compounds across runs. This is the
   HARD replay fork: replaying an old run must pin the KB-version-as-of-that-run. Phase it LAST.
4. **Heritable bibliography** (loved) — on reproduction, offspring inherit POINTERS into the research graph
   (the parents' bookmarks), not just persona weights → good research lineages compound. Research becomes a
   gene.
5. **The graveyard / negative knowledge** (loved) — a culled agenome's research is a MAP OF DEAD ENDS
   ("3 agents tried crowd-control→ER, scored 0.3"). Index culled lineages' research WITH their low scores so
   the swarm stops re-walking known walls (anti-survivorship-bias).
6. **GPS-migration viz** (loved) — UMAP the research+idea index to 2D, give each agenome a position, and
   watch the swarm MIGRATE across idea-space over generations (cluster=converge, scatter=diverge). A second
   graph / "timelapse of a brain thinking", alongside the lineage tree.

## The mechanism (ingest → normalize → link → interconnect → traverse), mapped to our pipeline

- **ingest** = `tool_call.finished` (already emitted — free).
- **normalize** = a fold extracting `{claim, source, url, embedding}` → a `ResearchNote` (one new projection;
  embed via the existing `embedding` role; persist the vector for replay, never re-embed — rule #7).
- **link to lineage/agenome/params/idea** = **the edges write themselves from the log**: `agenomeId` →
  the agenome's `personaWeights`/params → the `candidate.created` it produced → its `fitness.scored`. Plus
  the explicit "this candidate cited this note" edge from the candidate's `evidenceRefs`.
- **interconnect ideas↔research** = pgvector similarity edges (cosine kNN) + the explicit citation edges.
- **traverse** = nearest-neighbor query (CONVERGE: follow the trail) or farthest (DIVERGE: anti-retrieve).
  The diverge/converge dial (FB.4 generationBias already exists) selects the query direction.

## Safety constraints (load-bearing — the executing session MUST preserve)

- **Rule #2:** the KB is a DERIVED, rebuildable projection; `run_events` stays the sole system of record. The
  pgvector index/graph are read-side, rebuildable from the log.
- **Rule #7 (the sharp one):** anything an agent READS during generation is part of the run's determinism →
  PERSIST every retrieval result as an event at run time (like tool results), so replay re-threads the
  identical set with NO provider/index call. Persist embeddings (never re-embed). The cross-run brain must
  version-pin the KB-as-of-that-run for replay.
- **Rule #5:** research fed into a generation prompt is untrusted DATA → `wrapUntrusted`, never interpolated
  into the instruction string (the existing isolation chokepoint).
- **Rule #8:** building/reading the KB is not a productive spend (no energy debit); a retrieval failure
  debits nothing.

## Build slices (sequenced — for the executing session)

1. **`ResearchNote` projection** — pure fold over `tool_call.finished` (+ `candidate.created` evidenceRefs)
   → normalized notes with embeddings + lineage edges. Replay-safe. (Postgres, no new infra.)
2. **pgvector migration** — enable the extension; migrate `novelty.scored.vector` jsonb → a `vector` column +
   HNSW index; repoint `selection/novelty/cosine.ts` to the index. **Double win: upgrades novelty too.**
3. **In-run retrieval seam** — an agent queries the KB at generation time (kNN over `ResearchNote`),
   PERSISTS the retrieved set per call (rule #7), threads it as `wrapUntrusted` DATA into the
   `population_generator` request (rule #5). The diverge/converge dial picks near vs far.
4. **Heritable bibliography** — thread parent research-pointers through reproduction (fusion/mutation) so
   offspring inherit bookmarks (record in `ReproductionEvent.mutationSummary`, open record → no contract bump).
5. **The graveyard** — index culled lineages' research with their fitness so a "what NOT to do" query exists.
6. **GPS-migration viz** — UMAP the index → 2D coords (persisted projection) + a bespoke `apps/web` canvas /
   timelapse; agenome positions over generations.
7. **Cross-run living brain** (LAST, hard) — persist the index across runs + the replay version-pin design.
8. **Neo4j graph-analytics projection** (optional, later) — GDS community-detection (convergence) + PageRank
   (canon), fed from the log; the dev graph explorer. Resurrects `lineage-export.ts` as a real handoff.

## Open questions for the executing session

- Exact RAG format feeding the generation prompt (how many notes, how summarized) — keep it rule-#5-clean.
- The convergence/divergence dial mechanics over the retrieval direction (reuse FB.4 generationBias?).
- The cross-run replay version-pinning scheme (slice 7) — the one genuinely hard correctness problem.
- Whether novelty moves fully OUT of scalar fitness into the cull/diversity role here (ties to the climb
  work's novelty decision — see `climb-plan.md`: fitness = per-gen quality, novelty = diverge/cull pressure).
