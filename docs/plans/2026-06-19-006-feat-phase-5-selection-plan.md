---
title: "feat: Phase 5 — Selection, scoring & reproduction"
type: feat
status: active
created: 2026-06-19
owner: melissa
depth: standard
spec_anchors:
  - ARCHITECTURE.md §8
  - IMPLEMENTATION_PLAN.md Phase 5 (P5.1–P5.11)
depends_on:
  - docs/plans/2026-06-19-001-feat-scaffold-and-phase-0-contract-freeze-plan.md
  - docs/plans/2026-06-19-002-feat-phase-1-persistence-and-event-store-plan.md
  - docs/plans/2026-06-19-003-feat-phase-2-model-gateway-plan.md
  - docs/plans/2026-06-19-004-feat-phase-3-runtime-kernel-plan.md
  - docs/plans/2026-06-19-005-feat-phase-4-verifier-council-plan.md
---

## Summary

Phase 5 of `IMPLEMENTATION_PLAN.md` — **the selection track**. Wires Phase 3's `runGeneration.deps.scoreHook` + `reproduceHook` injection points with real implementations: gateway-routed novelty embedding + app-level cosine with persisted authoritative vectors, a never-block degrade path with deterministic lexical fallback, a success-only energy-efficiency component, held-out-judge acceptance integration, a policy-versioned fitness scorer that decomposes every contribution and stays fully explainable from persisted events, weak-lineage culling with explainable parent selection, bounded mutation with persisted RNG outcomes, two-level fusion (agenome crossover + output synthesis via the `fusion_synthesis` gateway role) with distant-lineage anti-collapse preference, the `<2-parent` mutation-only fallback, and heuristic allocation that produces the gen N+1 successor population.

Phase 0 already froze the named contracts (P5.1 — `ScoringPolicy`, `FitnessScore`, `NoveltyScore`, `ReproductionEvent`). Phase 1 froze the event-store append boundary and the `novelty.scored` / `fitness.scored` / `lineage.culled` / `agenome.mutated` / `agenome.fused` / `agenome.reproduced` / `novelty_scoring_degraded` / `reproduction_aborted_insufficient_parents` event types. Phase 2 froze the `embedding` + `fusion_synthesis` model roles, the `RecordedGateway`, and Langfuse fallback. Phase 3 froze the kernel + RNG + hook slots. Phase 4 populated the `critic.reviewed` + `check.completed` evidence stream this phase reads from. This PR builds the runtime wiring on top.

## Problem Frame

Phase 3 calls `runGeneration.deps.scoreHook(candidates)` and `runGeneration.deps.reproduceHook(agenomes, candidates) → { nextAgenomes? }` at the appropriate points in the generation state machine. Until those hooks do real work:

- Candidates are produced and reviewed (Phase 4) but never **scored**. Selection has nothing to rank.
- No `lineage.culled`, `novelty.scored`, `fitness.scored`, `agenome.fused`, or `agenome.mutated` events are emitted. The dashboard (Phase 7) will have nothing useful to render.
- The next generation's agenome population is the **same** as the current generation's. There is no evolution. The "agent-evolution runtime" is a bounded-loop simulator without selection pressure.

Phase 5 closes those gaps with a single requirement set: **every selection / reproduction decision must be fully explainable and reconstructable from the persisted event log alone**. Replay recomputes only deterministic math (cosine over persisted vectors, weighted sums); it never re-embeds, never re-samples the RNG, and never re-calls the gateway.

---

## Scope

### In scope

- **Novelty embedding + cosine + persistence** (P5.2) — gateway-routed `text-embedding-3-large` (decision D1), app-level cosine against the per-generation comparison set, `NoveltyScore` persisted into the `novelty.scored` event payload with `vector + embeddingModelId + dimension`.
- **Novelty degrade path** (P5.3) — retry → character-3-gram Jaccard lexical fallback (decision D2) → `novelty_scoring_degraded` event. Never blocks the generation scoring state. `NoveltyScore.method` records the actual method used.
- **Energy-efficiency component** (P5.4) — derives only from `energy.spent` events for the candidate's agenome. `provider_call_failed` contributes nothing to the denominator. Replay-reconstructable.
- **Judge acceptance + critic-scores integration** (P5.5) — reads the persisted `check.completed{checkType: "final_judge"}` (Phase 4 U6) and the `critic.reviewed` evidence. Selection never mutates the judge or the rotating critic outputs.
- **Policy-versioned fitness scorer** (P5.6) — `ScoringPolicy v1` with concrete weights pinned (decision D3): `critic=1`, `subtype_check=1`, `novelty=1`, `judge_acceptance=1`, `energy_efficiency=0.1`. `FitnessScore.total` is a pure deterministic function of `components + policyVersion`. `explanation` enumerates every component, its raw value, its weight, and its weighted contribution.
- **Weak-lineage culling + explainable parent selection** (P5.7) — agenome → `eligible_parent` once one of its candidates reaches a `selected` fitness score. `lineage.culled` events carry the criterion. Deterministic tie-breaks via the persisted RNG seed.
- **Bounded mutation with persisted RNG outcomes** (P5.8) — mutation changes `personaWeights` vector + `spawnBudget` hint within explicit bounds. Concrete RNG outcomes persisted in `ReproductionEvent.mutationSummary` so replay reconstructs the mutated child without re-sampling. No trait can raise a cap.
- **Two-level fusion** (P5.9) — agenome-level crossover (splice traits + `personaWeights`) AND output-level synthesis (gateway under `fusion_synthesis` role). Distant-lineage anti-collapse: prefer parent pairs maximizing cosine distance over persisted embedding vectors. `agenome.fused` carries `crossoverPoints` + provider metadata.
- **Degenerate `<2-parent` fallback** (P5.10) — `mutation_only` from the single survivor; `reproduction_aborted_insufficient_parents` event when zero eligible parents.
- **Heuristic allocation** (P5.11) — multiplicative `fitness × novelty × energy_efficiency` ranking → top-K parents → reproduction. Allocation is a hint clamped by remaining `maxPopulation`; never raises a cap.
- **`makeScoreHook` + `makeReproduceHook` factories** — closures bind to Phase 3's hook signatures.
- **Phase 5 public surface harness** at `@doppl/api`.

### Deferred to Follow-Up Work

- Learned bandit / RL allocation. Per spec §8 — explicitly out of scope for MVP.
- A learned value model that predicts fitness from candidate text without the verifier track. Explicit non-goal.
- A separate selection CLI for offline rescoring with a new `ScoringPolicy.version`. Useful for Phase D rehearsal tuning; not load-bearing for Phase 6.
- Per-trait mutation magnitudes informed by gradient signals. The MVP mutation is uniform random within bounds.

### Out of scope

- REST / SSE endpoints, projections — Phase 6.
- React Flow lineage dashboard — Phase 7.
- Any change to frozen Phase 0/1 contracts.
- Production agenome trait set beyond `personaWeights` + `spawnBudget`. Phase 5 ships the mutation shape; the trait set is the Phase 3 seeded one.

---

## Key Technical Decisions

### D1. Novelty embedding is `text-embedding-3-large` (3072 dim)

Pinned as the v1 embedding model. Persisted on every `NoveltyScore.embeddingModelId`. Comparison sets in MVP runs stay small (5–20 candidates / generation) so the larger dimension doesn't materially impact replay storage. Replay reads the persisted vector and never re-embeds — the cost is paid once at score time.

OpenAI direct (not OpenRouter) per the Phase 2 embedding adapter that's already wired. `OPENAI_API_KEY` env var continues to gate live tests; CI runs against the `RecordedGateway` recordings only.

### D2. Lexical fallback is character 3-gram Jaccard

Tokenize each candidate summary into a `Set<string>` of 3-character windows (case-folded). Distance = `1 - |A ∩ B| / |A ∪ B|`. Deterministic, replay-safe, no dep. `NoveltyScore.method = "lexical_char3gram_jaccard"` so the dashboard can flag any candidate scored under this fallback as `estimated`.

3-gram windows are robust to small typos and morphological variation in the candidate summaries (which are model-generated and noisy). The cost vs token-Jaccard is a constant factor and irrelevant at MVP scale.

### D3. `ScoringPolicy v1` pins concrete weights now

Equal weights for the four primary signals + `0.1` energy-efficiency tiebreak:

| Component | Weight |
|---|---|
| `critic` (averaged over 5 mandates) | 1.0 |
| `subtype_check` (averaged over the 5 subtype adapters) | 1.0 |
| `novelty` | 1.0 |
| `judge_acceptance` (Phase 4 U6) | 1.0 |
| `energy_efficiency` | 0.1 |

`policyVersion = "v1"`. Phase 7 dashboard will surface `policyVersion` so generations under different policies stay comparable. v2/v3 weight tuning happens after rehearsal; a policy bump forces a re-score, never a contract change.

### D4. Component aggregation is mean over closed sets

For each candidate:
- `critic` component = arithmetic mean of `CriticReview.confidence` across the 5 mandates' accepted reviews. Rejected mandates count as `0` (preserves the safety pin from Phase 4 — a rejected critic doesn't get to silently pass through).
- `subtype_check` component = `(passed_count + 0.5 * skipped_count) / 5` over the 5 adapters for the candidate's subtype. Skipped counts half so a candidate isn't penalized when its `prior_art` corpus has no match — that's not the candidate's fault.
- `novelty` component = `NoveltyScore.score` (cosine distance, range `[0, 2]`; mapped to `[0, 1]` via `score / 2`).
- `judge_acceptance` component = `final_judge` total / 25 (5 axes × 5 max).
- `energy_efficiency` component = `1 / (1 + total_successful_energy_doppl_units)`. Diminishing returns; bounded to `(0, 1]`.

Each component is normalized to `[0, 1]` so the weighted sum is dimensionally consistent.

### D5. Parent selection: top-K with deterministic seeded tie-break

`top-K` over `fitness.total × novelty × energy_efficiency` ranking (multiplicative; matches §8). `K` = `maxPopulation / 2` (rounded down, min 2). Ties resolved deterministically: `(total, novelty, candidateId)` lexicographic, then RNG.choose if still tied. The full ranking is persisted into the `agenome.fused` / `agenome.mutated` event's `explanation` field so replay reconstructs it.

### D6. Fusion vs mutation_only is allocation-driven, not random

For the gen N+1 successor budget:
- Top-K parents are selected (D5).
- If `≥ 2` distinct top-K parents → `floor(2/3)` of budget goes to fusion pairs, `ceil(1/3)` to single-parent mutation_only. Within fusion, parent pairs are chosen by **distant-lineage preference**: maximize cosine distance over persisted embedding vectors.
- If `1` top-K parent → all budget goes to `mutation_only` (degenerate path P5.10).
- If `0` → empty successor; zero-survivors `generation.completed{survivors:0}` path.

This is deterministic and replay-reconstructable.

### D7. Hooks return shape

- `makeScoreHook` closure matches Phase 3's `(candidates: PersistedCandidate[]) => Promise<void>`. Emits `novelty.scored` + `fitness.scored` per candidate.
- `makeReproduceHook` closure matches `(agenomes, candidates) => Promise<{ nextAgenomes?: Agenome[] }>`. Returns the gen N+1 agenome list which Phase 3's loop passes back as the next generation's input.

Both hooks query the persisted event log (via `replayReader`) for the critic / check / judge evidence they need — they do NOT receive that evidence as in-process state. This keeps the score/reproduce path replay-symmetric: a replay-only execution reconstructs the same scoring inputs by reading the same events.

---

## High-Level Technical Design

```
            ┌──────────────────────────────────────────────────┐
            │   runGeneration (Phase 3)                        │
            │   …→ scoring → reproducing → completed           │
            └────────┬──────────────────────┬──────────────────┘
                     │                      │
                     ▼                      ▼
        ┌───────────────────────┐  ┌───────────────────────────┐
        │  makeScoreHook(deps)  │  │  makeReproduceHook(deps)  │
        └─────────┬─────────────┘  └────────────┬──────────────┘
                  │                              │
       ┌──────────┴──────────┐                   ▼
       ▼                     ▼          ┌────────────────────┐
┌──────────────┐    ┌─────────────────┐  │  cull weak lineages │
│ scoreNovelty │    │ scoreFitness    │  │  ↓                  │
│  ↓ embed     │    │  ↓ aggregate    │  │  pick top-K parents │
│  ↓ cosine    │    │  ↓ apply policy │  │  ↓                  │
│  ↓ (degrade) │    │  ↓ persist      │  │  reproduce:         │
│ → novelty.   │    │ → fitness.scored│  │   - top-K ≥ 2:      │
│   scored     │    └─────────────────┘  │     2/3 fuse        │
└──────────────┘                          │     1/3 mutate_only│
       │                                   │   - top-K = 1:     │
       │ persisted                         │     all mutate_only│
       ▼                                   │   - top-K = 0:     │
  (replayReader path)                     │     empty successor│
                                           │  ↓                  │
                                           │ emit agenome.fused  │
                                           │      agenome.mutated│
                                           │      agenome.       │
                                           │      reproduced     │
                                           │  ↓                  │
                                           │ → nextAgenomes      │
                                           └────────────────────┘
```

> *This sketch illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

---

## Output Structure

```
apps/api/src/
  selection/
    novelty/
      embed.ts                       ← gateway-routed (role=embedding)
      cosine.ts                      ← pure deterministic math
      lexical-fallback.ts            ← character-3-gram Jaccard
      score-novelty.ts               ← orchestrator + degrade path
      __tests__/
        cosine.test.ts
        lexical-fallback.test.ts
        score-novelty.test.ts        ← unit + integration
    components/
      energy-efficiency.ts
      critic-scores.ts               ← reads critic.reviewed
      subtype-checks.ts              ← reads check.completed (non-judge)
      judge-acceptance.ts            ← reads check.completed{checkType:final_judge}
      __tests__/
        components.test.ts
    fitness/
      policy.ts                      ← v1 weights + helper functions
      score-fitness.ts               ← decomposed scorer
      __tests__/
        policy.test.ts
        score-fitness.test.ts
    cull.ts
    parent-selection.ts
    reproduction/
      rng.ts                         ← seeded helper for mutation/fusion
      mutate.ts
      crossover.ts                   ← agenome-level splice
      output-synthesis.ts            ← gateway fusion_synthesis call
      parent-distance.ts             ← cosine over persisted vectors
      fuse.ts                        ← orchestrates crossover + output_synthesis
      degenerate.ts                  ← <2-parent fallback
      reproduce.ts                   ← top-level reproduction orchestrator
      __tests__/
        mutate.test.ts
        crossover.test.ts
        parent-distance.test.ts
        fuse.test.ts
        reproduce.test.ts
    allocation.ts
    successor.ts
    run-scoring.ts                   ← makeScoreHook factory
    run-reproduction.ts              ← makeReproduceHook factory
    index.ts                         ← Phase 5 public barrel
    __tests__/
      run-scoring.integration.test.ts
      run-reproduction.integration.test.ts
  __tests__/
    selection-surface.test.ts        ← Phase 5 surface harness
```

---

## Implementation Units

### U1. Novelty: embed + cosine + happy-path score

**Goal:** Embed candidate summaries via the gateway under `role: "embedding"`, compute app-level cosine distance against the per-generation comparison set, persist a `NoveltyScore` into a `novelty.scored` event. Happy path only — the degrade edge is U2.

**Requirements:** P5.2. Acceptance: the gateway is called via the port (never a direct provider SDK); the persisted `NoveltyScore.vector` length equals `dimension`; replay reads the stored vector and recomputes the same cosine.

**Dependencies:** Phase 2 gateway + embedding adapter; Phase 3 hooks.

**Files:**
- Create: `apps/api/src/selection/novelty/embed.ts`
- Create: `apps/api/src/selection/novelty/cosine.ts`
- Create: `apps/api/src/selection/novelty/score-novelty.ts` (happy path; degrade extended in U2)
- Create: `apps/api/src/selection/novelty/__tests__/cosine.test.ts`
- Create: `apps/api/src/selection/novelty/__tests__/score-novelty.test.ts`

**Approach:** `embed.ts` exports `embedCandidate({ gateway, candidate, runId, candidateId })` which calls `gateway.invoke({ role: "embedding", input: { text: candidate.summary }, ... })` and returns `{ vector: number[], embeddingModelId: "text-embedding-3-large", dimension: 3072 }`. `cosine.ts` exports `cosineDistance(a, b)` returning `1 - dot(a,b)/(|a|·|b|)`. `score-novelty.ts` exports `scoreCandidateNovelty({ gateway, db, candidate, runId, candidateId, comparisonVectors })`:

1. Embed the candidate.
2. Compute cosine distance to every vector in `comparisonVectors` (other candidates in this generation, in seen order).
3. `score = mean(distances)` — range `[0, 2]`. (Higher = more novel.)
4. Build `NoveltyScore` with `method: "embedding_cosine_mean"`, `comparisonSet: comparisonVectors.map(cid)`.
5. Emit `novelty.scored` with the full `NoveltyScore` in payload.
6. Return the score for the scorer.

**Execution note:** Write the cosine test first (deterministic math is the load-bearing piece). Integration test against `RecordedGateway`.

**Patterns to follow:** Phase 2 `apps/api/src/model-gateway/adapters/openai-embedding.ts` for the gateway invocation shape; Phase 4's `apps/api/src/verifier/council/critic-call.ts` for the embed + persist sequence.

**Test scenarios:**
- Happy path: 3 candidates → 3 `novelty.scored` events, each with `vector.length === 3072`, `embeddingModelId === "text-embedding-3-large"`.
- Cosine: orthogonal vectors → distance 1. Identical vectors → distance 0. Anti-parallel → distance 2.
- Cosine: zero-vector input throws (division by zero).
- Replay: read persisted `NoveltyScore.vector`, recompute distances against the same comparison set, get the same `score` byte-for-byte.
- Empty comparison set: returns `score = 0` (single candidate has no comparators; documented behaviour).
- Integration: `RecordedGateway` fixture produces the same `novelty.scored` payload across runs.

**Verification:** `pnpm --filter @doppl/api test apps/api/src/selection/novelty` is green. The first generation's persisted `novelty.scored` payload is byte-identical to a recorded fixture on a second run.

---

### U2. Novelty degrade path: lexical fallback + `novelty_scoring_degraded`

**Goal:** When embedding fails (provider exhausts retries) AND on the next retry tier also fails, fall back to character-3-gram Jaccard distance and emit `novelty_scoring_degraded` once per affected candidate. `NoveltyScore.method` records `"lexical_char3gram_jaccard"` and `vector` carries the bag-of-trigrams hash (deterministic, NOT a real embedding) so replay reproduces the same degraded score.

**Requirements:** P5.3. Acceptance: degraded path never blocks the generation scoring state; `NoveltyScore.method` reflects the actual method; fitness is still computed with novelty flagged estimated.

**Dependencies:** U1.

**Files:**
- Create: `apps/api/src/selection/novelty/lexical-fallback.ts`
- Modify: `apps/api/src/selection/novelty/score-novelty.ts` (add the degrade edge)
- Create: `apps/api/src/selection/novelty/__tests__/lexical-fallback.test.ts`
- Modify: `apps/api/src/selection/novelty/__tests__/score-novelty.test.ts` (degrade scenarios)

**Approach:** `lexical-fallback.ts` exports `charNGramSet(text, n=3) → Set<string>` and `jaccardDistance(a, b) → number` returning `1 - |A∩B|/|A∪B|`. `score-novelty.ts` wraps the embed step in `try`; on throw (or gateway returns `ok: false`), it retries ONCE via the gateway, and on second failure switches to the lexical fallback:

1. For each candidate, build its trigram set.
2. Compute Jaccard distance to each comparison candidate's trigram set.
3. `vector = sortedTrigramArray` (placeholder; deterministic, persisted as the "vector"). `dimension = vector.length`. `embeddingModelId = "lexical_char3gram_jaccard"`. `method = "lexical_char3gram_jaccard"`.
4. Emit `novelty_scoring_degraded` exactly once for this candidate with `reason: "embedding_failed_after_retry"`.
5. Continue with the normal `novelty.scored` event using the lexical score.

**Patterns to follow:** Phase 4's `apps/api/src/check-runners/zeitgeist/falsifiability.ts` for deterministic token splitting; Phase 2's structured-output retry logic for the retry semantics.

**Test scenarios:**
- Jaccard: identical strings → 0. Completely disjoint trigram sets → 1.
- Jaccard: deterministic across runs for the same input pair.
- Degrade: gateway throws on first attempt + retry → lexical fallback engages; one `novelty_scoring_degraded` event emitted; one `novelty.scored` with `method: "lexical_char3gram_jaccard"`.
- Degrade isolation: gateway succeeds for 2 of 3 candidates, fails for 1 → 3 `novelty.scored` events, 1 `novelty_scoring_degraded` (only for the failed one).
- Replay: the persisted lexical "vector" (sorted trigram array) is read back and the same Jaccard distance is reproduced.
- Never-block invariant: even with all 3 candidates degrading, the function returns without throwing.

**Verification:** `pnpm --filter @doppl/api test apps/api/src/selection/novelty` is green. The persisted `novelty_scoring_degraded` event count matches the number of failed embedding attempts.

---

### U3. Energy-efficiency component

**Goal:** Pure function `energyEfficiencyForAgenome({ replayReader, runId, agenomeId }) → number`. Reads `energy.spent` events for the given agenome, sums actual (preferring `actual` over `estimate`), returns `1 / (1 + totalSuccessfulSpend)`. `provider_call_failed` contributes zero (the gateway already excluded those from `energy.spent` by spec, so this is automatic).

**Requirements:** P5.4. Acceptance: success-only by construction; replay-reconstructable; defined value at zero spend.

**Dependencies:** Phase 1 `replayReader`.

**Files:**
- Create: `apps/api/src/selection/components/energy-efficiency.ts`
- Create: `apps/api/src/selection/components/__tests__/components.test.ts` (covers energy + critic + subtype + judge)

**Approach:** Async iterator over `replayReader(db).events(runId)` filtered to `energy.spent` events whose `agenomeId === target`. Sum `payload.energy.actual ?? payload.energy.estimate`. Return `1 / (1 + sum)`.

**Patterns to follow:** Phase 3's `apps/api/src/runtime/energy-ledger.ts` for the rebuild-from-events idiom.

**Test scenarios:**
- Zero spend → returns `1.0` (the boundary value; an agenome that hasn't spent any energy is maximally efficient).
- Single `energy.spent` of `10` → returns `1/11 ≈ 0.0909`.
- Multiple `energy.spent` events sum correctly: 10 + 5 = 15 → returns `1/16`.
- `provider_call_failed` events present alongside `energy.spent` → only `energy.spent` counted.
- Wrong agenomeId filtered out: `energy.spent` events for `ag_other` don't count.
- Replay-stable: re-running on the same persisted log returns the same value.

**Verification:** Pure-function tests pass; helper used by U5's fitness scorer.

---

### U4. Critic-score, subtype-check, judge-acceptance components

**Goal:** Three pure functions, each reading from `replayReader` and returning a component value in `[0, 1]` for a given candidate. Together they cover the four primary fitness inputs (D4 aggregation rules).

**Requirements:** P5.5. Acceptance: each component is a deterministic read; selection never mutates the evidence; absence is a defined boundary.

**Dependencies:** Phase 4 events.

**Files:**
- Create: `apps/api/src/selection/components/critic-scores.ts`
- Create: `apps/api/src/selection/components/subtype-checks.ts`
- Create: `apps/api/src/selection/components/judge-acceptance.ts`
- Extend: `apps/api/src/selection/components/__tests__/components.test.ts`

**Approach:**

- `criticScoreForCandidate(replayReader, runId, candidateId)`: iterate `critic.reviewed` for this candidate. Average `CriticReview.confidence` across the 5 mandates. Missing mandates count as `0` (rejected → safety pin from Phase 4).
- `subtypeCheckScoreForCandidate(replayReader, runId, candidateId)`: iterate `check.completed` for this candidate, skipping `checkType === "final_judge"`. Group by subtype set (transfer or zeitgeist). `(passed + 0.5 × skipped) / 5`.
- `judgeAcceptanceForCandidate(replayReader, runId, candidateId)`: find `check.completed{checkType: "final_judge"}` for this candidate. Return `result.score / 25`. Return `null` if not found — caller (U5) treats `null` as "candidate not scored as accepted by default" (D4 documented).

**Patterns to follow:** Phase 3 terminal-classifier for the iterate-events-and-fold idiom.

**Test scenarios:**

- Critic: 5 accepted reviews with confidences `[0.6, 0.7, 0.5, 0.8, 0.4]` → component `= 0.6`.
- Critic: 3 accepted + 2 rejected (no review event) → `(0.6 + 0.7 + 0.5 + 0 + 0) / 5 = 0.36`.
- Critic: 0 accepted → `0.0`.
- Subtype: 4 passed + 1 skipped → `(4 + 0.5) / 5 = 0.9`.
- Subtype: judge `check.completed` for the same candidate is excluded from this aggregation.
- Judge: present with `score = 20` → `20/25 = 0.8`.
- Judge: not present → `null` (caller handles).
- Replay-stable across two reads.

**Verification:** All three components compose into U5's scorer deterministically.

---

### U5. Policy-versioned fitness scorer

**Goal:** `scoreFitness({ replayReader, runId, candidateId, novelty, policy }) → FitnessScore`. Uses `ScoringPolicy v1` (D3) weights, decomposes every contribution, and emits one `fitness.scored` event. `total = Σ weight_i × component_i`. `explanation` enumerates each component, raw value, weight, weighted contribution.

**Requirements:** P5.6. Acceptance: idempotent under same `policyVersion`; `total` reconstructable from `components + policyVersion` alone; refers to `novelty.scored` without re-storing the vector.

**Dependencies:** U2, U3, U4.

**Files:**
- Create: `apps/api/src/selection/fitness/policy.ts` (exports `SCORING_POLICY_V1` + helpers)
- Create: `apps/api/src/selection/fitness/score-fitness.ts`
- Create: `apps/api/src/selection/fitness/__tests__/policy.test.ts`
- Create: `apps/api/src/selection/fitness/__tests__/score-fitness.test.ts`

**Approach:** `policy.ts` exports `SCORING_POLICY_V1: ScoringPolicy` with the D3 weights and `version: "v1"`. Also exports `applyPolicy(policy, components)` → `{ total, explanation }`. `score-fitness.ts` composes U3 + U4 + the U2 novelty score, calls `applyPolicy`, emits `fitness.scored` with the full `FitnessScore`.

`explanation` shape (string): one line per component:
```
critic: raw=0.62 weight=1.00 contrib=0.620
subtype_check: raw=0.80 weight=1.00 contrib=0.800
novelty: raw=0.43 weight=1.00 contrib=0.430
judge_acceptance: raw=0.80 weight=1.00 contrib=0.800
energy_efficiency: raw=0.10 weight=0.10 contrib=0.010
total=2.660 policyVersion=v1
```

**Test scenarios:**
- Happy path: candidate with all 4 evidence streams + non-degraded novelty → `FitnessScore` with `policyVersion: "v1"`, `total = 0.62 + 0.80 + 0.43 + 0.80 + 0.10 × 0.10 ≈ 2.66`.
- `judge_acceptance` missing → component absent from `components`; explanation notes "judge: not present".
- Novelty degraded → component value is the lexical fallback's; explanation notes "novelty: estimated (lexical fallback)".
- Idempotency: re-scoring the same candidate under the same `policyVersion` produces a `FitnessScore` with the same `total` (id may differ; semantics identical).
- Replay-reconstructable: components + policyVersion + weights re-derive the same total.

**Verification:** `fitness.scored` events on the run can be read by a Phase 6 projection and produce a coherent ranking.

---

### U6. Weak-lineage culling + parent selection

**Goal:** Two pure functions over the per-generation candidate set: `cullWeakLineages` (emits `lineage.culled` for agenomes whose candidates all fell below a fitness threshold) and `selectParents` (returns top-K by `fitness × novelty × energy_efficiency`, ties broken deterministically via D5).

**Requirements:** P5.7. Acceptance: agenome reaches `eligible_parent` only via a candidate's `selected` fitness; ties deterministic; zero parents → empty result.

**Dependencies:** U5.

**Files:**
- Create: `apps/api/src/selection/cull.ts`
- Create: `apps/api/src/selection/parent-selection.ts`
- Create: `apps/api/src/selection/__tests__/cull.test.ts`
- Create: `apps/api/src/selection/__tests__/parent-selection.test.ts`

**Approach:** `cullWeakLineages({ db, runId, generationIndex, scoredCandidates, threshold })` iterates the scored candidates, finds the agenomes whose best candidate's `fitness.total` falls below `threshold` (D6: `threshold = max(0, median(totals) - σ)`), and emits `lineage.culled` per culled agenome with `explanation: "below median - sigma at gen N"`. Returns the set of surviving agenome IDs.

`selectParents({ scoredCandidates, K, rng })` ranks by `total × normalizedNovelty × energyEfficiency`. Top-K. Ties resolved by `(total, novelty, candidateId)` lexicographic, then `rng.choose` for the last tie.

**Test scenarios:**
- 5 candidates, threshold filters 2 → 3 survive, 2 `lineage.culled` events emitted.
- All candidates at same score → tie-break runs to `rng.choose` deterministically (same RNG seed → same result).
- Zero survivors → empty result, no `lineage.culled` events.
- `selectParents` with `K = 0` → empty array.
- Replay-stable across two calls with same input + RNG seed.

**Verification:** Phase 6 projection can replay `lineage.culled` events and render the cull explanation.

---

### U7. Bounded mutation

**Goal:** `mutateAgenome({ parent, rng, bounds }) → { child, mutationSummary }`. Mutates `personaWeights` (clamped to `[0, 1]`) and `spawnBudget` (clamped to `[1, floor(maxPopulation / 2)]`) within bounds. Persists concrete RNG outcomes in `mutationSummary` so replay reconstructs without re-sampling.

**Requirements:** P5.8. Acceptance: trait can never raise a cap; outcomes persisted; child schema-valid against `Agenome`.

**Dependencies:** Phase 3 `Agenome` contract + `SeededRng`.

**Files:**
- Create: `apps/api/src/selection/reproduction/rng.ts`
- Create: `apps/api/src/selection/reproduction/mutate.ts`
- Create: `apps/api/src/selection/reproduction/__tests__/mutate.test.ts`

**Approach:** `rng.ts` exports `mutationRngFor({ runSeed, generationIndex, parentAgenomeId }) → SeededRng` — a per-mutation seeded RNG derived from the run's master seed. `mutate.ts` picks 1–2 fields of `personaWeights` to perturb, draws a per-field magnitude in `[-0.1, +0.1]` from the RNG, clamps to `[0, 1]`. Optionally perturbs `spawnBudget` by `±1`, clamped. Records `{ fieldsChanged, magnitudes, clamps }` in `mutationSummary`. Returns a new `Agenome` with parent's `id` set as the single parent in lineage.

**Test scenarios:**
- Same `(runSeed, generationIndex, parentAgenomeId)` → identical child + identical `mutationSummary`.
- Different generation indexes → different mutations.
- Clamp: drawing magnitude that would push `personaWeights[0]` above 1 → clamped to 1; `clamps` records the field.
- `spawnBudget` cannot exceed `maxPopulation / 2` even with positive RNG draw → clamped.
- Child passes `Agenome.parse(...)` validation.
- `mutationSummary` carries enough info to reconstruct the child from the parent + summary (replay).

**Verification:** Hand-replay test: parent + mutationSummary + parser produce the original child.

---

### U8. Two-level fusion: crossover + output_synthesis

**Goal:** Two-level fusion. `fuseAgenomes({ gateway, parents, runSeed, generationIndex, rng })` does (a) **agenome-level crossover** — splice `personaWeights` and `traits` from both parents by a crossover point picked from RNG; (b) **output-level synthesis** — call `gateway.invoke({ role: "fusion_synthesis", input: { parents: parents.map(p => p.systemPrompt) }, ... })` to merge the parents' system prompts. Result is a new `Agenome` with `parentAgenomeIds: [parents[0].id, parents[1].id]` and persisted `crossoverPoints + synthesisOutput`. Distant-lineage preference is implemented by **parent pair selection** (U9 consumer), not by the fuse function itself.

**Requirements:** P5.9. Acceptance: gateway-routed (no SDK calls); persisted outcomes reconstructable on replay; child schema-valid.

**Dependencies:** U7.

**Files:**
- Create: `apps/api/src/selection/reproduction/crossover.ts`
- Create: `apps/api/src/selection/reproduction/output-synthesis.ts`
- Create: `apps/api/src/selection/reproduction/parent-distance.ts`
- Create: `apps/api/src/selection/reproduction/fuse.ts`
- Create: `apps/api/src/selection/reproduction/__tests__/crossover.test.ts`
- Create: `apps/api/src/selection/reproduction/__tests__/parent-distance.test.ts`
- Create: `apps/api/src/selection/reproduction/__tests__/fuse.test.ts`

**Approach:**

- `crossover.ts`: pure. Given two parent agenomes + RNG → picks crossover point + assembles child traits + `personaWeights`. Returns `{ childTraits, crossoverPoints }`.
- `output-synthesis.ts`: calls `gateway.invoke({ role: "fusion_synthesis", input: { messages: [ ... ] } })`. Returns the merged system prompt. NOTE: this call also goes through the U1 isolation seam? No — the verifier-track isolation seam is for candidate-as-DATA. The fusion synthesis input is agenome-derived (trusted), not candidate-derived. The lint from Phase 4 doesn't apply to `apps/api/src/selection/`.
- `parent-distance.ts`: pure. Reads two persisted embedding vectors via `replayReader` (from `novelty.scored` events), computes cosine distance.
- `fuse.ts`: orchestrator. Calls crossover (D6 mode = "crossover"); optionally calls output_synthesis (D6 mode = "output_synthesis" or "fusion"). Emits `agenome.fused` with `crossoverPoints + provider metadata + child agenome`.

**Test scenarios:**
- Crossover: same `(parents, runSeed, gen)` → same `crossoverPoints` and same child.
- Crossover: child carries `parentAgenomeIds: [parent1.id, parent2.id]`.
- Parent-distance: identical persisted vectors → distance 0. Orthogonal → distance 1.
- Output synthesis: gateway response shapes correctly; `agenome.fused` event payload carries provider trace ID + synthesized prompt.
- Fuse: against a mocked gateway, the full chain produces a schema-valid `Agenome` child.
- Integration with `RecordedGateway`: byte-identical child across runs.

**Verification:** Replay reconstructs the child from `agenome.fused` payload without re-calling gateway.

---

### U9. Degenerate `<2-parent` mutation_only fallback

**Goal:** `reproduceWithFallback({ parents, ... })` decides the reproduction mode per D6: ≥2 parents → split between fusion and mutation_only; 1 parent → all mutation_only; 0 parents → emit `reproduction_aborted_insufficient_parents` and return empty. Reuses U7 + U8.

**Requirements:** P5.10. Acceptance: deterministic fallback decision; no fusion when `<2` distinct eligible parents; explainable from events.

**Dependencies:** U7, U8.

**Files:**
- Create: `apps/api/src/selection/reproduction/degenerate.ts`
- Create: `apps/api/src/selection/reproduction/reproduce.ts`
- Create: `apps/api/src/selection/reproduction/__tests__/reproduce.test.ts`

**Approach:** Branch on `parents.length`:
- `≥ 2`: assemble pairs using distant-lineage preference (call U8's `parent-distance.ts`). For top-K-budget-many children, take `floor(2/3 × budget)` from fusion and `ceil(1/3 × budget)` from mutation_only of the top parent. (D6.)
- `1`: produce `budget` mutation_only children from the single parent.
- `0`: emit `reproduction_aborted_insufficient_parents` once; return `[]`.

Every produced child is persisted via `agenome.fused` or `agenome.mutated` + a per-child `agenome.reproduced` event with mode tag.

**Test scenarios:**
- 5 parents, budget 6 → 4 fusion children + 2 mutation_only children; `agenome.fused` × 4 + `agenome.mutated` × 2 + `agenome.reproduced` × 6.
- 1 parent, budget 3 → 3 mutation_only children; no `agenome.fused`.
- 0 parents → 1 `reproduction_aborted_insufficient_parents` event; empty result.
- Budget 0 → empty result, no events.
- Replay-stable: same inputs (incl. RNG seed) → same set of children.

**Verification:** Phase 3's `runGeneration` consuming the result advances to the next generation.

---

### U10. Heuristic allocation + successor population

**Goal:** `assembleSuccessorPopulation({ parents, fitnessScores, budget }) → Agenome[]`. Combines U9's reproduction output with allocation logic clamped by `budget = remainingMaxPopulation`. Returns the new agenome list for gen N+1.

**Requirements:** P5.11. Acceptance: never raises a cap; multiplicative `fitness × novelty × energy_efficiency` allocation; zero-parents → empty.

**Dependencies:** U6, U9.

**Files:**
- Create: `apps/api/src/selection/allocation.ts`
- Create: `apps/api/src/selection/successor.ts`
- Create: `apps/api/src/selection/__tests__/successor.test.ts`

**Approach:** `allocation.ts` computes per-parent allocation weight = `fitness.total × normalizedNovelty × energyEfficiency`. Normalize across all parents. Distribute the `budget` proportionally with integer rounding (largest-remainder method). The hand-off to Phase 3 is via `makeReproduceHook` (U11) which returns `{ nextAgenomes: Agenome[] }`.

**Test scenarios:**
- 3 parents with weights `[1, 2, 3]` and budget 6 → allocation `[1, 2, 3]`.
- Allocation never exceeds `budget` (clamp).
- One parent with allocation 0 produces no children.
- Sum of allocations equals `budget` (largest-remainder invariant).
- Zero parents → empty successor list.

**Verification:** Successor population size ≤ Phase 3's `remainingMaxPopulation` cap (verified in the integration test).

---

### U11. `makeScoreHook` + `makeReproduceHook` factories

**Goal:** Two factories matching Phase 3's hook signatures. `makeScoreHook(deps)` runs U1/U2 + U5 per candidate. `makeReproduceHook(deps)` runs U6 + U10 to produce the gen N+1 agenome list. Wires Phase 5 into the kernel's hook injection points.

**Requirements:** Bridges Phase 5 into Phase 3. Acceptance: `runGeneration` with both hooks wired produces full `novelty.scored + fitness.scored + lineage.culled + agenome.* + reproduction_aborted_insufficient_parents` event stream end-to-end.

**Dependencies:** U1–U10.

**Files:**
- Create: `apps/api/src/selection/run-scoring.ts`
- Create: `apps/api/src/selection/run-reproduction.ts`
- Create: `apps/api/src/selection/__tests__/run-scoring.integration.test.ts`
- Create: `apps/api/src/selection/__tests__/run-reproduction.integration.test.ts`
- Modify: `apps/api/src/selection/index.ts` (new barrel)
- Modify: `apps/api/src/index.ts` (add `selection/`)

**Approach:** `run-scoring.ts` factory captures `{ db, gateway, runId, runSeed, getCurrentGenerationIndex }`. Returns a closure that:
1. For each persisted candidate, runs `scoreCandidateNovelty` (U1+U2).
2. Then `scoreFitness` (U5) consuming the novelty + reading energy + critic + subtype + judge components.
3. Emits per-candidate `novelty.scored + fitness.scored` events.

`run-reproduction.ts` factory captures `{ db, gateway, runId, runSeed, getCurrentGenerationIndex, runCaps }`. Returns a closure that:
1. Reads `fitness.scored` events for the current generation.
2. Calls `cullWeakLineages + selectParents` (U6).
3. Calls `assembleSuccessorPopulation` (U10) which dispatches into `reproduce` (U9) and assembles the gen N+1 list.
4. Returns `{ nextAgenomes }`.

**Test scenarios:**
- Integration (testcontainers + `RecordedGateway`): full `runGeneration` with both hooks wired produces:
  - N candidates → N `novelty.scored` + N `fitness.scored` events
  - Some `lineage.culled` events for below-median agenomes
  - For ≥2 surviving parents: `agenome.fused` + `agenome.mutated` + `agenome.reproduced` events totaling the budget
  - Returns a non-empty `nextAgenomes` array
- Cap clamp: `runCaps.maxPopulation = 4` → `nextAgenomes.length ≤ 4` always.
- Zero survivors: empty `nextAgenomes`; no `agenome.*` events.

**Verification:** Phase 3's `runGeneration` consumes the hooks and runs end-to-end.

---

### U12. Phase 5 public surface harness

**Goal:** Pin the exports Phase 6 will import from `@doppl/api/selection`. Mirrors Phase 4's surface harness pattern.

**Requirements:** §2.5 acceptance gate.

**Dependencies:** U11.

**Files:**
- Create: `apps/api/src/__tests__/selection-surface.test.ts`
- Modify: `apps/api/src/selection/index.ts` (barrel)

**Approach:** Required exports list:

```
// Novelty
scoreCandidateNovelty
cosineDistance
charNGramSet
jaccardDistance
// Components
energyEfficiencyForAgenome
criticScoreForCandidate
subtypeCheckScoreForCandidate
judgeAcceptanceForCandidate
// Fitness
SCORING_POLICY_V1
applyPolicy
scoreFitness
// Selection
cullWeakLineages
selectParents
// Reproduction
mutateAgenome
crossoverAgenomes
fuseAgenomes
parentDistance
reproduceWithFallback
// Allocation
allocateSuccessorBudget
assembleSuccessorPopulation
// Factories
makeScoreHook
makeReproduceHook
```

**Test scenarios:**
- Each required export exists and is `defined`.
- No private helpers leak (`applyPolicy_internal`, etc.).
- `SCORING_POLICY_V1.version === "v1"` AND `SCORING_POLICY_V1.weights.critic === 1`.

**Verification:** `pnpm --filter @doppl/api test apps/api/src/__tests__/selection-surface.test.ts` is green.

---

## System-Wide Impact

- **`apps/api/src/runtime/generation-loop.ts`**: no change. Hooks already accept `(candidates) => Promise<void>` and `(agenomes, candidates) => Promise<{ nextAgenomes? }>`. Phase 5 supplies real implementations via factories.
- **`apps/api/src/runtime/worker.ts` + `start-run.ts`**: no change. The `processRun` driver (still test-injected) is where U11's factories get composed in.
- **`packages/contracts`**: no schema changes. Phase 5 consumes frozen contracts only. `SCORING_POLICY_V1` lives in `apps/api/`, not the contracts package — it's a runtime policy artifact, not a contract.
- **`apps/api/src/event-store`**: no migrations. Event types and payload schemas already in place.
- **CI**: new testcontainers integration tests in `selection/__tests__/`. Embedding live tests opt-in via `DOPPL_LIVE_TESTS=1`.

---

## Open Questions Surfaced by Planning

**None blocking.** All decisions resolved up-front via the three planning call-outs. The Phase 0 contract surface fully covers Phase 5's needs — no contract gap analogous to Phase 4's judge-event finding.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- Learned bandit / RL allocation. Out of scope per spec.
- A learned value model that predicts fitness from candidate text. Explicit non-goal.
- Per-trait mutation magnitudes informed by gradient signals. MVP mutation is uniform random in bounds.
- An offline rescoring CLI that walks an old run with a newer `ScoringPolicy.version`. Useful for Phase D tuning; not load-bearing for Phase 6.

### Deferred for Later (per IMPLEMENTATION_PLAN.md)

- REST + SSE endpoints — Phase 6.
- Lineage dashboard — Phase 7.

### Outside this product's identity

- Re-scoring a generation under multiple `ScoringPolicy` versions simultaneously. A run has exactly one active policy; comparisons across policies happen at the projection layer (Phase 6+).
- Hand-edited agenome traits. The runtime never accepts an externally-supplied agenome; reproduction is the only path that adds new agenomes to a run.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embedding cost balloons with `3-large` at scale | Low | Live test cost overrun | MVP comparison sets are 5-20 vectors / generation. Live tests are opt-in (`DOPPL_LIVE_TESTS=1`). `RecordedGateway` covers CI. |
| Replay divergence from non-deterministic cosine math | Low | Different fitness on replay | Cosine is deterministic. Floating-point order matters; iterate comparison set in `seenOrder` (persisted on `NoveltyScore.comparisonSet`). Tested explicitly. |
| Lexical fallback produces near-zero distances on similar candidates | Medium | All candidates score same novelty under degradation | Acceptable: degrade is a never-block fallback. `NoveltyScore.method` flags it; Phase 7 dashboard shows the degradation visibly so operators can re-run. |
| Top-K parent ranking ties → non-deterministic without RNG | Medium | Replay divergence | D5 tie-break is deterministic: lexicographic then `rng.choose`. Tested. |
| Fusion synthesis call rate balloons with large population | Low | Wall-clock cap exceeded | Phase 3 caps are the structural backstop. D6 caps fusion at `2/3` of budget. |

---

## Test Plan & Dev Loop

Mirrors Phases 1–4:

```bash
docker compose up -d postgres
pnpm -w typecheck
pnpm -w lint
pnpm -w test                          # unit
pnpm -w test:int                      # integration (testcontainers per file)
# Optional, opt-in:
DOPPL_LIVE_TESTS=1 OPENROUTER_API_KEY=… OPENAI_API_KEY=… pnpm -w test:live
```

CI covers everything against `RecordedGateway` recordings. The `embed.ts` live path (real OpenAI embedding) and the `output-synthesis.ts` live path (real fusion-synthesis call) are exercised only when `DOPPL_LIVE_TESTS=1`.

## Environment Variables

| Var | Default | Effect |
|---|---|---|
| `DOPPL_NOVELTY_RETRY_MAX` | `1` | Per-candidate embedding retries before lexical fallback engages. |
| `DOPPL_SCORING_POLICY_VERSION` | `v1` | Selects which `ScoringPolicy` constant the scorer applies. |
| `OPENAI_API_KEY` | _required for live tests_ | Direct OpenAI embeddings. CI uses `RecordedGateway`. |

## Acceptance Criteria

- [ ] Novelty embedding via gateway under `role: "embedding"`; persisted `NoveltyScore.vector` (3072 dim) reconstructs the same cosine on replay (U1).
- [ ] Degrade path: 2-attempt failure → lexical fallback → exactly one `novelty_scoring_degraded` per affected candidate; generation scoring never blocked (U2).
- [ ] Energy-efficiency: success-only by construction; `provider_call_failed` never penalizes (U3).
- [ ] Critic + subtype + judge components read evidence without mutation; missing judge is a defined boundary (U4).
- [ ] `ScoringPolicy v1` weights pinned in code; `FitnessScore.total` is a pure function of `components + policy`; explanation enumerates every component (U5).
- [ ] Weak-lineage culling with explainable `lineage.culled` events; deterministic parent selection ties (U6).
- [ ] Bounded mutation with persisted `mutationSummary`; child reconstructable from parent + summary; no trait raises a cap (U7).
- [ ] Two-level fusion: agenome crossover + output_synthesis gateway call; child carries both parent IDs; distant-lineage preference applied at parent-pair selection (U8).
- [ ] `<2-parent` fallback: 1 parent → all mutation_only; 0 parents → `reproduction_aborted_insufficient_parents` (U9).
- [ ] Heuristic allocation: multiplicative; clamped by remaining `maxPopulation`; never raises a cap (U10).
- [ ] `makeScoreHook` + `makeReproduceHook` plug into Phase 3's `verifyHook`-style injection; integration test produces full event stream end-to-end (U11).
- [ ] Phase 5 public surface harness asserts every required export and no private leaks (U12).
- [ ] `pnpm -w typecheck && pnpm -w lint && pnpm -w test && pnpm -w test:int` all green at PR open.

## Dependencies on Prior Phases

- Phase 0: `FitnessScore`, `ScoringPolicy`, `NoveltyScore`, `ReproductionEvent`, `Agenome`, `EvidenceRef`, `ModelRole` (`embedding`, `fusion_synthesis`).
- Phase 1: `appendEvent`, `replayReader`, schemas for `novelty.scored`, `fitness.scored`, `lineage.culled`, `agenome.fused`, `agenome.mutated`, `agenome.reproduced`, `novelty_scoring_degraded`, `reproduction_aborted_insufficient_parents`, `energy.spent`.
- Phase 2: `ModelGateway` + `RecordedGateway` + OpenAI embedding adapter + fusion_synthesis route + `pipeStructuredOutput`.
- Phase 3: `runGeneration` with `scoreHook` + `reproduceHook` slots; `createSeededRng`; `Agenome` lifecycle state machine.
- Phase 4: `critic.reviewed` + `check.completed` evidence stream that U4 reads.

## What ships in the PR

- The `apps/api/src/selection/` tree from the Output Structure section.
- One-line wiring in `apps/api/src/index.ts` to expose the public surface.
- Phase 5 public surface harness at `apps/api/src/__tests__/`.
- Plan file with `status: completed` (flipped at PR open).
- PR targets the `melissa` integration branch.
