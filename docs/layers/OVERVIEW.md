# Doppl — System Overview

> **Architecture sentence:** *It's not the agent — it's the kernel that breeds the agents; the event log is the truth, and the held-out judge is the floor the organism cannot lift.*

## What it is

**Doppl is an agental-evolution runtime — a system that breeds AI agents instead of hand-building one.** Most agent products today are a *hand-crafted artifact*: a human designs the prompt, the tools, and the verification loop, and that design is frozen the moment the human stops. Doppl asks the opposite question — *what if the scaffold itself were under selection pressure?* It seeds a run with one human-authored "agent genome" (an **agenome** = system prompt + persona weights + tool permissions + decomposition policy + a spawn budget), spawns a small bounded population, has them **research** (now via allowlisted web tools and a shared knowledge base) and generate **candidate ideas**, scores those ideas with an adversarial **critic council** plus an immovable **held-out judge**, then **culls** the weak lineages and **fuses** (two-parent crossover + output synthesis) and **mutates** the strong ones into a next generation. The proof the MVP chases is simple to state and hard to fake: *generation N+1 produces measurably better, more verifiable ideas than generation N*, judged against a fixed rubric the agents cannot move.

The system targets the two hardest things to automate: **cross-domain transfer** (porting a technique from field A onto an open problem in field B) and **zeitgeist synthesis** (a thesis fitted to current signals that survives scrutiny). The deep reason it's hard is that *"good idea" has no cheap ground-truth signal* — you can't unit-test novelty — so Doppl's central trick is to **manufacture a fitness function out of adversarial verification** and use evolution to climb it without collapsing into confident slop.

Engineering-wise, Doppl is **not** an agent wired out of a SaaS pipeline — it's a *kernel*. The single source of truth is an **append-only Postgres event log** (`run_events`); every other view — current-state tables, the lineage graph, the **shared knowledge graph**, SSE streams, Langfuse traces — is a **derived, rebuildable projection** that is never authoritative. Because every lifecycle decision and every RNG draw is persisted, the whole run can be **replayed with zero AI-provider calls** — the demo's safety net. A React 19 dashboard renders the population breeding *live* and *replayably*.

## At a glance

- **Stack:** Node 22 LTS · TypeScript (strict) · pnpm monorepo · **Fastify** (REST + SSE) · **Zod** (every boundary) · **Drizzle + Postgres** (append-only event log; **pgvector optional/deferred**) · **React 19 + Vite + React Flow** (dashboard) · **Langfuse Cloud** (non-authoritative observability) · AI access via a provider-agnostic **ModelGateway** (OpenRouter primary; direct-OpenAI embeddings; Ollama). **Agent self-research is now SHIPPED** through the gateway's tool surface (`web_search`/`fetch_url`/`x_search`/`youtube_search`, allowlisted + SSRF-guarded). **No SQLite.**
- **Shape:** an event-sourced backend service (`apps/api`) + a read-only React dashboard (`apps/web`) + frozen shared schemas (`packages/contracts`) + a thin observability adapter (`packages/observability`). One pnpm workspace; import-direction-enforced boundaries; **not** publishable packages.
- **Posture:** a 2-week Gauntlet capstone — **MVP/prototype**, explicit *flagged* deferrals — but **nine load-bearing safety invariants are never cut** (see [10-cross-cutting-safety.md](10-cross-cutting-safety.md)).
- **Entry points:** `POST /runs` (the operator seeds + caps a run) → the in-process kernel worker executes the generation loop → `GET /runs/:id/stream` (SSE) + the read projections feed the dashboard. Boot spine: `loadConfig → migrate → seed → crash-forward → listen` (`bootApp`, `apps/api/src/main.ts:211`).

## The layers

Doppl decomposes along the architecture's §2.5 subsystem dependency DAG. Dependencies point **one way** — contracts inward, UI outward — and the only fan-out hub is the ModelGateway. (An arrow `A → B` reads "B depends on / imports from A".)

```
                         ┌─────────────────────────────┐
                         │ 00 Contracts & Event Model   │  (frozen Zod — freeze before fork)
                         └──────────────┬──────────────┘
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼
 01 Persistence   02 Model        03 Runtime       04 Verifier    05 Selection
 & Event Store    Gateway ─────►  Kernel ────────► Council &  ──► Scoring &
 (run_events =    & Providers     (caps · energy · Checks         Reproduction
  source of       (the only       state machines · (critics ·    (fitness ·
  truth)          fan-out hub)    generation loop) judge · checks) novelty · fusion)
        │              │            ▲   │  ▲            │              │
        │              │     tools[12]│  │  │read KB[11]│              │
        └──────────────┴───────────────┼───────────────┴──────────────┘
                                                ▼
                                   06 Projections & Read Models
                                   (derived folds of the event log)
                                                │
                                                ▼
                                   07 Backend API (REST + SSE)
                                                │
                                                ▼
                                   08 Frontend Dashboard (read-only)

 09 Observability  — Langfuse + kernel logs/heartbeat (non-authoritative side channel)
 10 Cross-cutting Safety — the nine invariants threaded through every layer above
 11 Shared Knowledge Space — research folds into a derived ResearchNote KB; agents READ it at gen-time (stigmergy)
 12 Tool-Use & Research — population_generator agents self-research (allowlisted, SSRF-guarded) before generating
```

| # | Layer | Responsibility | Doc |
|---|-------|----------------|-----|
| 00 | **Contracts & Event Model** | The frozen Zod dictionary every layer validates against: the closed 41-member event registry, the append-only `RunEventEnvelope`, the per-type payload map, and four structural safety primitives. Types derive from schemas via `z.infer`. | [00-contracts-event-model.md](00-contracts-event-model.md) |
| 01 | **Persistence & Event Store** | The append-only Postgres `run_events` log (per-run monotonic `sequence` = sole ordering key) that is the system source of truth, plus the one-transaction append path, the pre-append redaction scrub, migrations + triggers, the fail-closed `EvidenceRef` resolver, and the no-provider replay reader. | [01-persistence-event-store.md](01-persistence-event-store.md) |
| 02 | **Model Gateway & Providers** | The provider-agnostic `ModelGateway` port: role→route registry, the OpenRouter/OpenAI-embedding/Ollama/retrieval adapters, the **tool-use surface** (`tools?`/`toolCallRequests?`), and the authoritative validate / repair(≤1) / reject discipline that gates every model output. The only fan-out hub in the DAG. | [02-model-gateway-providers.md](02-model-gateway-providers.md) |
| 03 | **Runtime Kernel** | The custom TS kernel that breeds the agents — four lifecycle state machines, kernel-enforced caps + kill switch, the success-only energy ledger, the seeded PRNG, the generation loop, and the in-process crash-forward worker. The **sole** emitter of authoritative lifecycle events. | [03-runtime-kernel.md](03-runtime-kernel.md) |
| 04 | **Verifier Council & Checks** | The adversarial fitness signal: a rotating, evidence-only critic council, the immovable held-out judge + 5-axis rubric (now run **comparatively**, 0-10 axes), candidate-as-data injection isolation, and the allowlisted **non-executing** check runners for both candidate subtypes. | [04-verifier-council-checks.md](04-verifier-council-checks.md) |
| 05 | **Selection, Scoring & Reproduction** | The classical-ML half: the policy-versioned decomposed fitness score (critic + subtype + novelty + energy-efficiency + verbatim held-out-judge acceptance), embedding novelty for anti-collapse, relative + **truncation** cull with a population floor, **elitism + the ratchet + directed reproduction** (the climb), and two-level fusion + bounded mutation preferring distant lineages. | [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md) |
| 06 | **Projections & Read Models** | The derived, rebuildable read side: pure reducer folds over the event log → current-state, the storage-agnostic lineage graph, the **ResearchNote knowledge graph**, replay summaries, run-list/health — watermark-guarded, winner-*marked* (never winner-*invented*), replay-state-equivalent. | [06-projections-read-models.md](06-projections-read-models.md) |
| 07 | **Backend API (REST + SSE)** | The Fastify edge: REST commands (append-only writes) + read-projection queries (incl. `GET /runs/:id/knowledge`) + the SSE run-event stream (resume by `sequence`), idempotency, the omit-null wire serializer, and the `bootApp` sequence that composes the whole stack. | [07-backend-api-rest-sse.md](07-backend-api-rest-sse.md) |
| 08 | **Frontend Dashboard** | The React 19 + Vite live observatory — a multi-route app over read-only projections + SSE: sequence-keyed event folds, the React Flow lineage tree (per-generation columns), the **Knowledge-Evolution graph**, the evidence/critic/energy/fitness panels + deep telemetry inspector — accessible, replay-identical, strictly non-authoritative. | [08-frontend-dashboard.md](08-frontend-dashboard.md) |
| 09 | **Observability** | The non-authoritative diagnostic side channel: a fail-safe Langfuse emit boundary (scrub-before-emit, mirroring the event-store scrub), a correlation-ID kernel logger, and a worker heartbeat. Three layers, one truth. | [09-observability.md](09-observability.md) |
| 10 | **Cross-cutting: Safety & Trust Boundaries** | How the nine load-bearing safety invariants are *mechanically* enforced across the layers — each rule's exact code home, kernel/structural (never prompt) enforcement, and the test that pins it. | [10-cross-cutting-safety.md](10-cross-cutting-safety.md) |
| 11 | **Shared Knowledge Space** | Stigmergy: agents' research (`tool_call.finished`) folds into a derived `ResearchNote` projection (the KB substrate); agents READ it at generation time via a pure kNN retriever threaded as untrusted data; retrieved/researched/cited edges + a graveyard of culled dead-ends; served at `GET /runs/:id/knowledge` + the Knowledge-Evolution graph. Lexical MVP; embeddings/pgvector deferred. | [11-shared-knowledge-space.md](11-shared-knowledge-space.md) |
| 12 | **Tool-Use & Research** | schemaVersion 10 (TU.1): `population_generator` agents self-research via an allowlisted (`web_search`/`fetch_url`/`x_search`/`youtube_search`), SSRF-guarded, TOCTOU-closed, multi-turn model↔tool orchestrator attached ONLY to the generator route (judge byte-identical). Tool results re-enter as untrusted data; replay re-reads persisted results. | [12-tool-use-research.md](12-tool-use-research.md) |

## How it fits together

Follow one run from a seed prompt to a final surviving idea, naming the layers it crosses. This is the spine every other doc hangs on.

1. **Seed & configure.** An operator POSTs a run config + caps to `POST /runs` ([07](07-backend-api-rest-sse.md)). The request is idempotent and **cap-clamped** before anything is written; the kernel appends `run.configured` (persisting the **RNG seed** and the **scoring-policy version** — both load-bearing for replay) ([03](03-runtime-kernel.md), [01](01-persistence-event-store.md)).

2. **Spawn, research, generate.** The in-process worker runs the generation loop ([03](03-runtime-kernel.md)), now fanning out the population **concurrently** at a ceiling clamped to remaining-energy headroom. For each agenome up to the caps it may first **research** — a multi-turn model↔tool loop ([12](12-tool-use-research.md)) calling the allowlisted, SSRF-guarded research tools — and **read the run's shared knowledge base** ([11](11-shared-knowledge-space.md)) via a pure kNN retriever (near/far dialed by `generationBias`). It then calls the **ModelGateway** `population_generator` role ([02](02-model-gateway-providers.md)). The per-run problem, every tool result, and every retrieved note ride in as **untrusted, sentinel-wrapped data** (`wrapUntrusted`, [00](00-contracts-event-model.md)/[04](04-verifier-council-checks.md)/[12](12-tool-use-research.md)), never as instructions (rule #5); the retrieved note-id set is persisted on `candidate.generation_started` so replay re-threads it without re-querying (rule #7). The structured candidate is validated (accept / repair≤1 / reject), then `agenome.spawned` · `candidate.created` · `energy.spent` are appended. Caps — including `maxToolCalls` — are enforced *in the kernel*, never by prompt text (rule #1).

3. **Verify (the adversarial fitness signal).** Each candidate is reviewed by a **rotating critic council** (a deterministic K-of-N mandate set per generation, now also eliciting a numeric 0-5 rating), run through **allowlisted, non-executing** subtype checks (skipped-with-reason when unregistered), and scored by the **held-out judge** ([04](04-verifier-council-checks.md)). The judge now runs **comparatively**: council + checks run per-candidate concurrently, then the judge is **hoisted to one gateway call over the whole generation**, scoring all candidates side-by-side on a **0-10** per-axis scale so it spreads its scores (fixing a central-tendency compression that stalled the climb). Candidate text reaches every critic/judge only inside a sentinel-delimited data field (rule #5); the rubric is **immutable to agents** and acceptance is still **runner-computed** as Σ(axes × immutable weights) with no peer term — so the floor stays **peer-invariant** (rule #6). Evidence-only: critics emit `critic.reviewed`, checks `check.completed`, the judge `judge.reviewed` — none of them selects a winner.

4. **Score, cull, breed (the climb).** Selection ([05](05-selection-scoring-reproduction.md)) computes **novelty** (embed → cosine vs prior candidates, with a lexical degrade path), composes the **decomposed fitness score** (critic + check + novelty + energy-efficiency + the judge's acceptance read *verbatim* by `candidateId` join), then applies **elitism** (top-K survivors carried unchanged, prepended so the kernel clamp can only drop trailing offspring), a **truncation cull** (the weakest fraction dies each generation in addition to the relative-outlier cull), and the **ratchet** (the cross-generation peak survivor — the *reigning champion* — re-presented as a reproduction parent so the peak lineage can never silently mean-revert). Reproduction is **directed**: the fusion synthesis instruction was rewritten from blend-to-mean "merge" to "out-perform both parents and repair the weakest judged axis." All RNG outcomes are persisted in `ReproductionEvent` so replay never re-samples (rule #7). The loop emits `generation.completed` and threads the offspring into the next generation, **clamped** to `maxPopulation` by the kernel (rule #1).

5. **Terminate.** When caps are hit (or the operator stops, or a cap breaches), the kernel terminalizes the run and records the winner as `run.completed.finalIdeaRef` — the top-scoring non-culled survivor ([03](03-runtime-kernel.md)). Zero survivors is a legal, honest terminal, never a fabricated idea.

6. **Observe & replay.** Projection builders ([06](06-projections-read-models.md)) fold the authoritative log into current-state, the lineage graph, the **shared knowledge graph**, and the health read model; the API streams events over **SSE** ([07](07-backend-api-rest-sse.md)); the dashboard ([08](08-frontend-dashboard.md)) renders the organism breeding *live* — nodes visibly generating / reviewing / fusing, with an animated cyan **stigmergy** edge whenever an agent reads a prior agent's research — and identically in **replay**, which reconstructs everything from the persisted log + seed with **no provider calls**. Langfuse ([09](09-observability.md)) gets a redacted, non-authoritative deep trace on the side.

```
Operator ─POST /runs─► API ─► Kernel ─► run.configured/started ─► [per agenome ≤caps, CONCURRENT]
   ▲                                         │                         │ research (tools[12]) + read KB[11]
   │ SSE (live + replay)                     │                         │ generate (ModelGateway, all as DATA)
   │                                         │                         │ → candidate.generation_started(retrievedNoteIds)
   │                                         ▼                         ▼ → candidate.created · energy.spent
Dashboard ◄─ Projections ◄─ run_events ◄─ verify (critics · checks · COMPARATIVE HELD-OUT JUDGE, 0-10)
 (organism +  (derived,       (APPEND-ONLY,   ▼
  knowledge    rebuildable)     SOURCE OF      score · novelty · cull(+truncation) · elitism · ratchet
  graphs)                       TRUTH)         · directed FUSE+mutate ─► generation.completed
                                               ▼
                                            run.completed(finalIdeaRef)   ── replay reads this log, calls NO provider
```

## Cross-cutting concerns

- **Safety invariants (the heart).** Nine load-bearing rules — caps kernel-enforced, append-only authoritative log, no arbitrary code execution, secrets never leave the server, model output untrusted + candidate-as-data, the held-out judge immutable to agents, replay calls no providers, energy = successful productive spend only, Postgres-only + SDKs behind the gateway. They thread through every layer; [10-cross-cutting-safety.md](10-cross-cutting-safety.md) is the per-rule mechanism map.
- **Shared knowledge space (stigmergy).** A run's research is *already* in the log as `tool_call.finished`; the `researchNotesReducer` (`apps/api/src/projections/research-notes.ts:126`) folds it into a derived `ResearchNote` knowledge graph (notes + `researched`/`cited`/`retrieved` edges + a graveyard of culled dead-ends). Agents READ it at generation time via the pure kNN `retrieveNotes` (`apps/api/src/selection/knowledge/retrieve.ts:78`); the retrieved set is persisted on `candidate.generation_started` (rule #7) and never authors anything (rule #2). MVP is lexical (Jaccard); the cosine path is dormant until notes carry embeddings. See [11-shared-knowledge-space.md](11-shared-knowledge-space.md).
- **Tool-use / web-research.** schemaVersion **10** (`CURRENT_SCHEMA_VERSION`, `packages/contracts/src/version.ts:51`) adds a frozen 4-member `ToolName` allowlist (`packages/contracts/src/gateway/tool.ts:17`) and an optional `tools?`/`toolCallRequests?` surface. A boot-layer multi-turn orchestrator drives the model↔tool loop with kernel-clamped budgets, a two-layer SSRF defense (literal gate + all-records DNS publicness check + connection pinning that closes the resolve→connect TOCTOU), and tool results re-injected as untrusted data. Tools attach **only** to the `population_generator` route — the judge/critic path is byte-identical (rule #6). See [12-tool-use-research.md](12-tool-use-research.md).
- **Bounded concurrency.** A new shared `apps/api/src/concurrency/pLimit.ts` (`pLimit`/`mapLimit`, `apps/api/src/concurrency/pLimit.ts:21`) is a pure scheduling primitive (no timer/RNG/clock) consumed across four layers — runtime loop (agenome generation fan-out), verifier (council+checks fan-out), selection (reproduction slots), and the boot tool seams/orchestrator. It bounds **concurrency** for provider-rate-limit politeness, **not** any cap; energy-safety for the generation fan-out lives in a separate energy-headroom ceiling clamp, and the authoritative tool-call accounting stays serialized by the kernel relay gate.
- **Configuration / env.** All config (model registry, scoring policy, caps, problem sets) is Zod-validated at startup; required env (provider keys, DB URL) is fail-fast at boot; precedence is `defaults < file < env` via the pure `validateRunConfig` ([00](00-contracts-event-model.md)/[03](03-runtime-kernel.md)). Keys load from env only and never enter a persisted object.
- **Determinism & replay.** A per-run **mulberry32** seed + persisted outcomes make replay byte-stable; the replay reader imports no provider seam (structural rule #7). A generator change is treated as a schemaVersion bump.
- **Redaction.** One `scrubSecrets` scrub runs at **two** boundaries — event-store before append, observability before Langfuse emit ([01](01-persistence-event-store.md)/[09](09-observability.md)) — and redacts keys, array elements, and values (rule #4).
- **Observability is three layers, one truth.** Events (authoritative, live + replay window) · kernel logs/health (operator diagnostics) · Langfuse (deep per-call trace). Only events are authoritative.
- **Concurrency posture.** One active run at a time (kernel-enforced); replay is read-only and viewable concurrently. Multi-run concurrency is a flagged stretch.

## Key decisions & trade-offs

The locked baseline (full ADR rationale in `docs/planning/DECISIONS.md`, contract in `ARCHITECTURE.md §19`):

- **Custom TypeScript kernel, not LangGraph-as-runtime** — the "weird part" (population dynamics, energy metabolism, fusion, replay) is owned, not bent into a workflow framework.
- **Postgres append-only event log as the sole source of truth** — not current-rows, not SQLite (forbidden), not Neo4j-as-truth. Every read model is derived and rebuildable.
- **Provider-agnostic gateway, OpenRouter primary** — SDKs live only in adapters; the runtime sees a port. Embeddings pinned to direct OpenAI.
- **Agent self-research (tool-use), allowlisted + SSRF-guarded, generator-only** — agents do their own web/X/YouTube research before generating, but the tool registry is a closed 4-member allowlist (the rule-#3 analog of the check-runner registry), the fetch path is SSRF-defended + TOCTOU-closed, and tools attach to the `population_generator` route only — so the held-out judge can never structurally receive a tool (rule #6).
- **Shared knowledge base as a derived projection (stigmergy, not a second brain)** — the KB is a fold of the event log (`ResearchNote`), never a system of record (rule #2). Agents leave pheromone-trail notes others read and depart from; culled lineages' research surfaces in a graveyard *with* its low fitness (anti-survivorship-bias). The MVP is **lexical** (Jaccard, keyless); embeddings + pgvector are a tracked follow-up the retriever auto-upgrades to once notes carry vectors.
- **Comparative held-out judge** — the judge scores a whole generation side-by-side in one call on a 0-10 scale to break the central-tendency compression that clustered axes mid-scale and starved the dominant `judge_acceptance` weight of separating signal. Crucially, acceptance is still runner-computed with **no peer term**, so the rule-#6 floor stays peer-invariant — peer context changes what the *model* outputs, never how the *runner* aggregates.
- **Held-out judge + critic rotation** — the anti-reward-hacking anchor: the objective can evolve, but the floor cannot be lifted by the agents.
- **Fusion (two-parent), not asexual mutation** — sexual reproduction across distant lineages escapes local optima and is an explicit anti-collapse force; reproduction is now **directed** (out-perform both parents, repair the weakest judged axis) rather than blend-to-mean.
- **Energy = successful productive spend only** — a flaky provider never starves an agenome; finiteness rests on bounded retries + timeouts + the wall-clock/tool/generation caps, not on charging for failures.
- **The climb is ceiling-bound, not lever-bound** — the elitism/ratchet/directed-reproduction/convergence mechanisms are validated to **hold** the peak (the ratchet cut the peak-to-final drop from ~0.030 to ~0.006), not to climb past a ceiling that does not exist for the test problem: a hand-crafted excellent answer caps fitness at ~0.74 and advancement is statistically indistinguishable from random restarts. The default posture now ships with **elitism (carry 1) and truncation cull (weakest 1/3) ON**; the fuller ratchet (`hallOfFameCarry`) and the mutagen strategies default OFF.
- **Local-first demo of record, hosted deferred** — identical boot sequence both ways; the full demo runs locally on replay data even if hosted/providers are down.
- **Heuristic selection for MVP** — learned bandit/RL allocation, a learned value model, a self-evolving critic council, and the in-house fine-tuning flywheel are all **deferred** (the proposal's "moonshot"; `ARCHITECTURE.md §18`).

### Drift & shipped-vs-deferred ledger (from the faithfulness pass)

The per-layer docs flag where the code and the architecture/comments disagree. The consolidated, load-bearing items (kind tagged: **arch-prose drift** = `ARCHITECTURE.md` text behind the code · **in-code stale** = a code comment / mirror-doc behind the code · **known residual** = a real but accepted gap · **fixed in this doc-set** = the per-layer doc now matches the code):

| Item | Where | Status |
|------|-------|--------|
| Event registry is **41 members**; some code comments still say "42" / "36-member" / "seven high-traffic types" | [00](00-contracts-event-model.md), [02](02-model-gateway-providers.md), [03](03-runtime-kernel.md), [09](09-observability.md) | **In-code stale; code + snapshot tests authoritative.** |
| `agenome.failed` / `candidate.rejected` are in the registry but **not yet emitted** (defined-on-a-seam) | [00](00-contracts-event-model.md), [03](03-runtime-kernel.md) | Representable, MVP-inactive. |
| Grounding checks (prior-art / current-signal / falsifiability) are built but the **verify-seam doesn't thread retrieval**, so via the seam they always `skipped{retrieval_unavailable}` (the new tool-use research is on the *generation* path, not the *check* path) | [04](04-verifier-council-checks.md) | Retrieval-FETCH for checks is a named deferral, not shipped end-to-end. |
| Held-out judge: `ARCHITECTURE.md §7` (and the Appendix-A `JudgeResult` row) still say **"5-axis 0-5 scale" + per-candidate**; code scores **0-10** in a **comparative one-call-per-generation** judge. Frozen rubric/`JudgeResult` contracts are byte-identical (scale is a runtime/scoring concern). | [04](04-verifier-council-checks.md), [05](05-selection-scoring-reproduction.md) | **Arch-prose drift** (`ARCHITECTURE.md:279`, `:544`). |
| `ARCHITECTURE.md §8` omits the **climb mechanics** (elitism, ratchet/hall-of-fame, directed reproduction, mutation strategies, adaptive convergence, truncation cull); the **default reproduction posture shifted** — elitism + truncation cull are now ON by default and the anti-blend fusion prompt is unconditional, vs §8's offspring-only / relative-cull / blend-to-mean contract. | [05](05-selection-scoring-reproduction.md) | **Arch-prose drift** (`ARCHITECTURE.md:287-299`). |
| `ARCHITECTURE.md §6` prose omits the **runtime tool subsystem** (the `TOOL_REGISTRY`/`TOOL_IMPLS` allowlist, the two-layer SSRF + TOCTOU-closing pinned fetch, the multi-turn orchestrator, the 3 research-tool impls); the TU.1 *wire* contract IS captured in the Appendix-A tables (sv10). | [02](02-model-gateway-providers.md), [12](12-tool-use-research.md) | **Arch-prose drift** (`ARCHITECTURE.md §6`). |
| A **second env-projection path**: `DOPPL_MUTATION_STRATEGY` / `DOPPL_ELITE_COUNT` / `DOPPL_HALL_OF_FAME_CARRY` are read directly in `loadConfig`, bypassing the closed `ENV_ALLOWLIST` *and* the `.env.example` drift guard (undocumented there). Benign (non-credential, int/enum-parsed, kernel-clamped) but weakens the single-closed-projection-path invariant (Lesson §32/§95). | [03](03-runtime-kernel.md), [00](00-contracts-event-model.md) | **In-code residual.** |
| `apps/api/CLAUDE.md` mirror: the `LineageNode` row says **"strict 6-field"** but the frozen contract is now **7-field** (`generationIndex?` added; snapshot updated); the Module-organization map omits the new `src/concurrency/` shared util (an unfilled EXAMPLE BLOCK). | [00](00-contracts-event-model.md), [06](06-projections-read-models.md) | **In-code stale** (mirror-doc behind contract; low sev). |
| `registry.ts` `ToolExecutorDeps` docstring still describes the connection-pinning **TOCTOU as OPEN** and `httpGet` as "disables redirect-following", but the wired seam (`toolSeams.ts`) **pins the socket to the validated IP + follows redirects with per-hop re-validation** (TOCTOU closed). | [12](12-tool-use-research.md), [10](10-cross-cutting-safety.md) | **In-code stale** docstring; no live-path risk. |
| Comparative judge **whole-call rejection sinks the whole generation**: if the single comparative output is rejected/un-assemblable, every candidate gets `output_schema_rejected` (fails SAFE, never fabricates), so `judge_acceptance` loses its separating signal generation-wide — a robustness regression vs the single-candidate path. The call also sets no `maxTokens`, so a large generation can truncate. | [04](04-verifier-council-checks.md) | **Known residual** (medium). |
| **Tool-IO-vs-accounting concurrency gap**: under concurrent agenome generation each orchestrator reads a stale `toolBudget` snapshot, so outbound tool IO can exceed `maxToolCalls` while the authoritative **recorded/debited** count stays capped. An execution-vs-accounting gap, not a rule-#1 accounting bypass; loosely bounded by wall-clock + per-call timeout + per-orchestrator budget. | [12](12-tool-use-research.md), [03](03-runtime-kernel.md) | **Known residual** (medium). |
| KB `cited` edges (source = `candidateId`) are **dropped as dangling** by the Knowledge-Evolution graph, which emits no candidate nodes — the `cited` style is dead for the current node set (defensive, mirrors the producer; not a crash). | [08](08-frontend-dashboard.md), [11](11-shared-knowledge-space.md) | **Known residual** (low; cited relationship invisible in the KB graph). |
| The lineage graph **dropped Dagre** for a deterministic per-generation column layout; the frontend doc previously said "laid out by Dagre". | [08](08-frontend-dashboard.md) | **Fixed in this doc-set** (08 now describes the column layout). |
| `dashboard_snapshots` table + watermark cache machinery built but **no code populates/reads it** (rebuild-on-read instead) | [06](06-projections-read-models.md) | Cache deferred; not a correctness gap. |
| Append-only relies on **DB triggers only**; the least-privilege role split (`LESSONS §25`) is **not shipped** — a superuser/owner could disable triggers | [10](10-cross-cutting-safety.md), [01](01-persistence-event-store.md) | Accepted for local-first; required hardening if hosted. |
| Langfuse external emit + the operator **content toggle (Q3)** are built + unit-tested but **not wired live** on the demo fork | [09](09-observability.md) | Built ahead of wiring. |
| The monolithic `Dashboard.tsx` is **unreachable** from the router (S0/S1/S2/S5 mounted instead) | [08](08-frontend-dashboard.md) | Retained for its tests / pre-router fallback. |
| Architecture diagrams: replay "ordered by run_id, sequence" and OpenAI "embeddings + **fallback**" are loose/aspirational vs the code | [01](01-persistence-event-store.md), [02](02-model-gateway-providers.md) | Self-flagged harmless in `ARCHITECTURE.md §9`. |

## Map

Read in order for the full picture; jump by responsibility otherwise.

1. [00-contracts-event-model.md](00-contracts-event-model.md) — the shared dictionary (start here).
2. [01-persistence-event-store.md](01-persistence-event-store.md) — the append-only source of truth.
3. [02-model-gateway-providers.md](02-model-gateway-providers.md) — the provider seam + structured-output discipline.
4. [03-runtime-kernel.md](03-runtime-kernel.md) — the kernel that breeds the agents.
5. [04-verifier-council-checks.md](04-verifier-council-checks.md) — the adversarial fitness signal.
6. [05-selection-scoring-reproduction.md](05-selection-scoring-reproduction.md) — fitness, novelty, fusion, the climb.
7. [06-projections-read-models.md](06-projections-read-models.md) — the derived read side.
8. [07-backend-api-rest-sse.md](07-backend-api-rest-sse.md) — the REST + SSE edge.
9. [08-frontend-dashboard.md](08-frontend-dashboard.md) — the live observatory.
10. [09-observability.md](09-observability.md) — the non-authoritative side channel.
11. [10-cross-cutting-safety.md](10-cross-cutting-safety.md) — the nine invariants, end to end.
12. [11-shared-knowledge-space.md](11-shared-knowledge-space.md) — stigmergy: the derived KB agents read and depart from.
13. [12-tool-use-research.md](12-tool-use-research.md) — agent self-research: the allowlisted, SSRF-guarded tool subsystem.

---

*Source inputs: `Doppl_Capstone_Proposal.pdf` (PRD), `ARCHITECTURE.md` (binding contract), `docs/planning/*`, `docs/design/*`, both code-area `CLAUDE.md` + `LESSONS.md`, and the `apps/api` · `apps/web` · `packages/*` source. Every per-layer doc anchors its claims to `path:line` and flags architecture-vs-code drift. Regenerate or sync with `/layer-docs` (incremental) · `/layer-docs --check` (drift report).*
