# /tdd brief — novelty_embed_cosine_persisted_vectors

## Feature
Compute candidate **novelty** in the selection track: embed a candidate summary via the ModelGateway
`embedding` role (port-only), compute **app-level cosine / nearest-neighbour** distance against the
prior-candidate comparison set, build the frozen `NoveltyScore` (with the **authoritative-once-computed
vector + embeddingModelId + dimension** persisted into the `novelty.scored` payload), and emit the
`novelty.scoring_started` → `novelty.scored` pair through an injected emit seam. The cosine/score math
is pure over persisted vectors so **replay recomputes only deterministic math and never re-embeds**
(KEY SAFETY RULE #7).

## Use case + traceability
- **Task ID:** P5.2
- **Architecture sections it implements:** `ARCHITECTURE.md §8` (novelty: embed + cosine/nearest-neighbour
  against prior candidates, app-level cosine day-one), `§9` (embeddings authoritative-once-computed —
  vector+modelId+dimension persisted in the `novelty.scored` payload; replay reads the stored vector,
  recomputes only cosine).
- **Related context:**
  - **P5.1 is satisfied by P0.8** — `NoveltyScore` is already frozen + barrel-exported + snapshot-covered;
    this slice **consumes** it, does not redefine it.
  - Gateway seam: the **recorded/fake gateway stub** (P2.9, `apps/api/src/model-gateway/stub/fake-gateway.ts`)
    exposes an `embedding` role fixture returning a deterministic 8-dim vector
    (`STUB_EMBEDDING_MODEL_ID='stub-embedding'`, `STUB_EMBEDDING_DIMENSION=8`). Drive tests with
    `createFakeGateway({mode:'valid'})`. Selection sees ONLY the `ModelGateway` port (LESSONS §20).
  - Event emission: the merged **`EventStore.append`** (P1.3, `apps/api/src/event-store/append.ts`,
    `AppendInput = RunEventEnvelope.omit({sequence,occurredAt})`) is the **real** emit seam — but the
    runtime *caller* (the generation `scoring` state) is gated on kernel **P3**, so caller wiring is an
    explicit deferral (Step 7.5).
  - Payload-map: `novelty.scored → NoveltyScore` is in `HIGH_TRAFFIC_PAYLOAD_MAP` (P0.10); the append
    path's `validateEventPayload('novelty.scored', payload)` validates the emitted payload against the
    frozen `NoveltyScore`.
  - `novelty.scoring_started` is a P0.1-amend operation-start marker — **generic payload, no energy
    debit** (rule #8), envelope-level correlation.
  - Carry-forward: treat `runId`/`candidateId` as **opaque untrusted bytes** — pass them as envelope
    fields only; never concatenate into SQL / channel names / keys (the append writer already
    parameterizes).

## Acceptance criteria (what "done" means)
- [ ] `embed(summary, deps)` issues a `ModelGatewayRequest{ role:'embedding', prompt:summary, schema:<local embedding-response schema> }`
      through the injected `ModelGateway` port and returns `{vector, embeddingModelId, dimension}` from an
      **accepted** response — selection imports only the port + `@doppl/contracts`, never a provider SDK
      (rule #9 / forbidden-pattern #2).
- [ ] A **non-accepted** gateway response (`accepted:false` / `validationResult:'rejected'`) surfaces a
      defined failure signal (typed result or thrown error) that P5.3 will wrap with retry/fallback —
      `embed` itself does not retry or fall back (that is P5.3).
- [ ] `cosineSimilarity(a, b)` is a pure function: identical vectors → 1, orthogonal → 0; **dimension
      mismatch rejects**; a **zero-norm vector** yields a defined similarity of 0 (no `NaN` / divide-by-zero).
- [ ] Novelty `score` = **1 − max cosine similarity** over the comparison set (nearest-neighbour
      distance); an **empty comparison set → score = 1.0** (first candidate is maximally novel); the
      result is **order-independent** over a fixed comparison set.
- [ ] `scoreNovelty(input, deps)` builds a `NoveltyScore` that **parses against the frozen contract** —
      `vector`+`embeddingModelId`+`dimension` populated from the embedding (authoritative-once-computed,
      §9), `comparisonSet` = the comparison candidateIds, `method='cosine'`, `score`, `explanation`
      enumerating the nearest neighbour + count.
- [ ] `scoreNovelty` emits, in order, exactly **one** `novelty.scoring_started` (generic payload) **then
      exactly one** `novelty.scored` (the `NoveltyScore` payload), via the injected emit seam, each with
      `actor:'selection_controller'`, `schemaVersion=CURRENT_SCHEMA_VERSION`, and the candidate's
      `runId`/`generationId`/`candidateId`.
- [ ] The emitted `novelty.scored` payload passes `validateEventPayload('novelty.scored', payload)`
      (frozen-seam conformance; bind to `CANONICAL_FIXTURES.validNoveltyScore` shape).
- [ ] **REPLAY (rule #7):** a recompute path that is handed the **persisted** vector + comparison
      vectors recomputes the cosine score **without invoking the gateway** (assert the injected gateway's
      `call` count is 0 on that path) — embeddings are never re-requested.
- [ ] Neither emitted event is `energy.spent` / carries an energy payload (marker = generic, scored =
      NoveltyScore) — rule #8 no-debit is structural.
- [ ] All unit tests in `apps/api/test/unit/selection/novelty/{cosine,embed,score-novelty}.test.ts` pass.
- [ ] `/preflight` clean.

## Wiring / entry point (Step 7.5)
**none — caller wiring lands in the P3 runtime generation-loop integration.** The production caller is the
runtime kernel's generation **`scoring`** state (§8 "novelty is computed within the generation scoring
state"), which does not exist until kernel **P3** merges. This slice lands the computation + emission
behind the exported **`scoreNovelty(...)`** function and a **`NoveltyEmitter` seam** whose I/O type IS the
frozen contract (`(envelope: Omit<RunEventEnvelope,'sequence'|'occurredAt'>) => Promise<{sequence:number}>`,
LESSONS §20). **First consumer (named):** the P3 generation `scoring` step, which supplies the real
emitter = `EventStore.append` (apps/api/src/event-store) at the runtime composition root, and an
integration test against the real Postgres event store rides that wiring slice. Reachability now is via
the unit suite + the injected fake emitter/gateway; the seam is consume-ready, not orphaned.

## Files expected to touch
**New:**
- `apps/api/src/selection/novelty/cosine.ts` — `cosineSimilarity(a,b)` + `noveltyFromSimilarities(sims)` /
  `noveltyScoreOf(vector, comparisonVectors)` (pure; no gateway, no IO).
- `apps/api/src/selection/novelty/embed.ts` — `embed(summary, {gateway})`: the ONLY gateway-touching
  novelty function; local embedding-response Zod schema; returns `{vector, embeddingModelId, dimension}`
  or a defined failure.
- `apps/api/src/selection/novelty/score-novelty.ts` — `scoreNovelty(input, deps)`: orchestrates
  marker-emit → embed → cosine → build+validate `NoveltyScore` → scored-emit; defines the `NoveltyEmitter`
  seam type + the deps (`gateway`, `emit`, `newId`).
- `apps/api/src/selection/index.ts` — area barrel re-exporting the public selection surface (if not present).
- `apps/api/test/unit/selection/novelty/cosine.test.ts`
- `apps/api/test/unit/selection/novelty/embed.test.ts`
- `apps/api/test/unit/selection/novelty/score-novelty.test.ts`

**Modified:**
- (none expected — greenfield `selection/` area. If the vitest unit-config globs need a `selection`
  include, flag at Step 2.5.)

If implementation needs files beyond this list, **flag at Step 2.5** before going GREEN.

## RED test outline (Step 2)

### `apps/api/test/unit/selection/novelty/cosine.test.ts`
1. **`cosine_identical_is_1`** — Asserts `cosineSimilarity(v,v) === 1` (within epsilon). Why: §8 cosine.
2. **`cosine_orthogonal_is_0`** — Asserts `cosineSimilarity([1,0],[0,1]) === 0`. Why: §8.
3. **`cosine_zero_vector_is_0_not_nan`** — Asserts a zero-norm vector → similarity `0`, never `NaN`. Why:
   deterministic boundary (replay-faithful).
4. **`cosine_dimension_mismatch_rejects`** — Asserts unequal-length vectors throw/reject. Why: data
   integrity (one run shares one embedding model → one dimension).
5. **`novelty_is_one_minus_max_similarity`** — Asserts `score = 1 − max(sims)` over the comparison set
   (Q1 default). Why: §8 nearest-neighbour anti-collapse.
6. **`novelty_empty_comparison_is_1`** — Asserts empty comparison set → `score = 1.0`. Why: first-candidate
   boundary (no fabricated neighbour).
7. **`novelty_order_independent`** — Asserts the score is identical under any permutation of the comparison
   set. Why: P5.2 bullet — order-independent over a fixed set.

### `apps/api/test/unit/selection/novelty/embed.test.ts`
8. **`embed_calls_embedding_role_with_summary`** — Asserts `embed` issues a request with `role:'embedding'`
   and `prompt === summary` to the injected `createFakeGateway({mode:'valid'})`. Why: §8 + port-only (rule #9).
9. **`embed_returns_vector_modelid_dimension`** — Asserts `embed` returns the stub's `{vector(8), 'stub-embedding', 8}`
   from the accepted response. Why: §9 authoritative-once-computed provenance.
10. **`embed_non_accepted_is_defined_failure`** — Asserts a `reject`-mode gateway response yields the
    defined failure signal (not a silent zero, not a throw-with-secret). Why: the degrade-path seam P5.3
    builds on.

### `apps/api/test/unit/selection/novelty/score-novelty.test.ts`
11. **`emits_scoring_started_then_scored_in_order`** — Asserts exactly two emitted events, ordered
    `novelty.scoring_started` (generic payload) then `novelty.scored`. Why: §4/§12 marker pairing (P0.1-amend).
12. **`emits_exactly_one_scored_per_candidate`** — Asserts exactly one `novelty.scored`. Why: §8 single
    authoritative novelty per candidate.
13. **`scored_payload_validates_against_NoveltyScore`** — Asserts `validateEventPayload('novelty.scored', payload).ok`
    and `NoveltyScore.parse(payload)` succeeds (vector/embeddingModelId/dimension/comparisonSet/method/score/explanation).
    Why: §4 payload-map + §9 + frozen-seam conformance.
14. **`emitted_envelopes_actor_is_selection_controller`** — Asserts both envelopes carry
    `actor:'selection_controller'` + `schemaVersion === CURRENT_SCHEMA_VERSION` + the candidate ids. Why: §4 actor union.
15. **`records_comparisonSet_and_method`** — Asserts `NoveltyScore.comparisonSet` = comparison candidateIds,
    `method === 'cosine'`. Why: §8 auditable comparison.
16. **`REPLAY_recompute_uses_persisted_vector_no_gateway`** — Asserts the recompute path (persisted vector +
    comparison vectors) returns the same score with the injected gateway `call` count **0**. Why: **rule #7**
    — replay never re-embeds (the safety pin of this slice).
17. **`neither_event_is_energy_spent`** — Asserts the two emitted types are exactly `novelty.scoring_started`
    + `novelty.scored` (no `energy.spent`). Why: rule #8 markers debit no energy.

## Cross-doc invariant impact (implementer flags at Step 9; orchestrator writes the docs)
- **Model field changes:** **none.** Consumes frozen `NoveltyScore` (P0.8), `ModelGatewayRequest`/`Response`
  (P0.12), `RunEventEnvelope`/`RunEventType`/`Actor` (P0.1), `HIGH_TRAFFIC_PAYLOAD_MAP`/`validateEventPayload`
  (P0.10), `CURRENT_SCHEMA_VERSION` (P0.1-amend).
- **Orchestrator doc rows to write hot (Step 9 routing):** none anticipated (no new contract model). If a
  reusable selection-emit-seam convention or the novelty-formula decision surfaces, flag it → I route a
  LESSONS index row / a `§8` arch-note hot.
- **§2.5-seam (shared-contract) model touched?** `NoveltyScore` is a §2.5-seam frozen model, but this slice
  **consumes** it (no shape change) → the existing `packages/contracts` field-set snapshot already covers it;
  **no new schema-snapshot test required.** Seam-conformance is pinned by test 13 (`validateEventPayload` +
  `NoveltyScore.parse`) rather than a re-snapshot.

## Things to flag at Step 2.5
1. **Novelty aggregation formula.** (a) `1 − max similarity` (nearest-neighbour distance), (b) `1 − mean
   similarity`, (c) mean pairwise distance. My default vote: **(a) `1 − max similarity`** — the standard
   anti-collapse "distance to nearest neighbour" measure and the most defensible reading of §8
   "cosine/nearest-neighbour against prior candidates"; empty set → 1.0. If you prefer (b)/(c) say so —
   downstream P5.6 fitness consumes this value, so we pin it once here.
2. **Embedding-response schema ownership.** The embedding output shape (`{vector, embeddingModelId,
   dimension}`) is **not** an Appendix-A contract — it's the gateway's structured-output for the
   `embedding` role. My default vote: **selection defines a local internal Zod schema and passes it as the
   request `schema`**, then parses `response.output` with it (LESSONS §23 consumer discipline). The fake ignores
   the request schema in `valid` mode (uses the role fixture), so this is forward-compat for the real
   P2.6 adapter, not test-load-bearing.
3. **Emit seam shape + caller deferral.** My default vote: **inject a `NoveltyEmitter` seam** whose I/O is
   the frozen envelope (`Omit<RunEventEnvelope,'sequence'|'occurredAt'>`), real impl = `EventStore.append`,
   recording fake in unit tests; the generation-`scoring` caller + the real-Postgres emission integration
   test are deferred to the P3 wiring slice (Step 7.5). Alternative: `scoreNovelty` returns the envelopes
   and the caller appends. I prefer the injected seam — emission ordering (started→scored) belongs inside
   selection. Push back if you'd rather keep `scoreNovelty` pure-return.
4. **`NoveltyScore.id` + dimension provenance.** My default vote: **inject a `newId()` factory via deps**
   (keep `scoreNovelty` free of `Math.random`/uuid so it's byte-deterministic/replayable, mirroring the
   stub's discipline + LESSONS §24); set `dimension = vector.length` AND assert it equals the gateway-reported
   dimension (mismatch → treat as an embed failure, defers to P5.3). Alternative: caller supplies the id.
5. **Vitest unit-config include.** If the frozen vitest unit config doesn't already glob
   `test/unit/selection/**`, the implementer adds the include (test-config only, no source change) — flag
   it here if it bites so I'm not surprised at Step 9.

## Dependencies + sequencing
- **Depends on:** P0.8 (`NoveltyScore` ✓), P0.10 (payload-map/`validateEventPayload` ✓), P0.11/P0.12
  (gateway contracts ✓), P0.1+amend (envelope/event-type/actor/`CURRENT_SCHEMA_VERSION` ✓), P2.9 (fake
  gateway stub ✓), P1.3 (`EventStore.append` present — caller wiring deferred). P5.1 ✓ via P0.
- **Blocks:** P5.3 (novelty degrade path — wraps `embed`'s failure boundary + extends `score-novelty`),
  P5.6 (fitness scorer references the consumed `novelty.scored`), P5.9 (parent-distance reuses the
  persisted novelty vectors).

## Estimated commit count
**1 — SOLO.** This slice carries the **rule-#7 replay-determinism pin** (test 16: recompute reads the
persisted vector, never re-embeds). Per root `CLAUDE.md` TDD posture + the brief-template pitfall,
replay-determinism / safety-invariant slices are authored standalone and **never bundled** — so P5.3
(degrade) and P5.4 (energy-efficiency) do NOT ride this commit; they follow as their own slices (and may
bundle with each other where safe once this seam is in).

## Lessons-logged candidates anticipated
- **Convention candidate** — "selection emits through a frozen-contract `NoveltyEmitter` seam (I/O =
  `RunEventEnvelope` minus server-assigned fields); real impl = merged `EventStore.append`, recording fake
  for unit tests; caller deferred with first-consumer named" (LESSONS §20 applied to the selection track).
- **Convention candidate** — "`embed` is the SOLE gateway-touching novelty function; `cosine`/`score` are
  pure over persisted vectors, making the rule-#7 replay pin structural (recompute path proves 0 gateway
  calls)."
- **Architecture-doc note candidate** — `§8`: pin the novelty aggregation formula (`1 − max cosine sim`;
  empty set → 1.0) once Q1 resolves, so P5.6 + reproduction depend on a defined value.
- **Future TODO — operational** — the real-Postgres emission integration test + the generation-`scoring`
  caller wiring land in the P3 runtime integration slice (named in Step 7.5).

## How to invoke
1. **Read this brief end-to-end** — especially "Things to flag at Step 2.5" (5 design questions with
   default votes).
2. **Run `/tdd novelty_embed_cosine_persisted_vectors`** in the implementer session.
3. **Step 0 (Restate)** — confirm against the Feature line.
4. **Step 1 (Identify files)** — confirm against "Files expected to touch."
5. **Step 2.5 (test review pause)** — send the test-design write-up (one `Asserts: <invariant> (§anchor)`
   line per test + the coverage map: each acceptance bullet → its covering test) with your votes on the 5
   questions. Wait for `APPROVED.` / `TWEAK:` / `ADD:`.
6. **Step 9 (summarize)** — categorized flags + ship-ask.
