# Doppl

> **It's not the agent — it's the kernel that breeds the agents; the event log is the truth, and the held-out judge is the floor the organism cannot lift.**

Doppl is an experimental **agental-evolution runtime**. A human seeds a run with a problem; Doppl spawns a bounded population of agent genomes ("agenomes") that generate **candidate ideas**; an adversarial **critic council**, **objective checks**, and a **held-out judge** score them; weak lineages are culled while strong ones **fuse, mutate, and reproduce** into later generations.

The proof: a later generation produces **stronger, more verifiable ideas** than an earlier one — measured by a held-out judge against a fixed rubric — with lineage, energy, critic evidence, subtype checks, novelty, and fitness all visible in a **live, replayable dashboard**.

This is a two-week Gauntlet capstone (MVP/prototype). Showcase: **June 29, 2026**.

## The headline

Type a problem →
a bounded population of agent genomes generates candidate ideas →
an adversarial critic council + a held-out judge + objective checks score them →
weak lineages are culled, strong ones fuse + mutate →
**a later generation beats an earlier one** →
the dashboard shows the **final surviving idea** with its full evidence (lineage, critics, checks, score, energy).

## Core ideas

- **The kernel breeds the agents.** A custom TypeScript runtime owns the evolution loop — population dynamics, energy metabolism, lineage, fusion, mutation, replay. It is not bent into a workflow framework.
- **The event log is the only truth.** A Postgres **append-only `run_events` log** (monotonic per-run `sequence`) is the single source of truth. Every read model — current-state tables, the lineage graph, SSE streams, Langfuse traces, Neo4j exports — is **derived and rebuildable, never authoritative**.
- **Two reproduction levels.** Fusion combines two parents at the **agenome level** (crossover of prompts/personas/toolsets) and the **output level** (a model synthesizes two parents' reasoning); mutation perturbs traits within bounds. Fusion prefers distant lineages as an anti-collapse force.
- **A judge the organism can't move.** A **held-out `final_judge`**, outside the breeding loop, applies a fixed rubric (5 axes, 0–5) and produces the acceptance metric that decides "gen N+1 beats gen N." The judge config and rubric are **immutable to agents** — the bedrock fitness anchor (anti-reward-hacking).
- **Replay calls no providers.** Replay reconstructs from the persisted per-run RNG seed and recorded outcomes — no model, embedding, or web calls — so the demo is deterministic and creds-free.
- **Two candidate subtypes** share one lifecycle: `cross_domain_transfer` (map a technique from domain A onto problem B) and `zeitgeist_synthesis` (a thesis fitted to current signals).

## Architecture at a glance

```
Operator (browser)
   │  REST commands + queries / SSE run-event stream
   ▼
Backend API (Fastify, REST + SSE)
   │
   ▼
Doppl Runtime Kernel ── lifecycle · caps · energy ledger · RNG seed
   ├── Postgres append-only run_events ........... SOURCE OF TRUTH
   ├── ModelGateway ── OpenRouter · OpenAI embeddings · web retrieval · ollama
   ├── Verifier council ── critics + held-out judge
   ├── Check runners ── allowlisted, non-executing adapters
   ├── Selection ── scoring · novelty · fitness
   └── Reproduction ── fusion · mutation
        │
        ▼
   Projection builders (current-state · lineage · replay)
        │
        ▼
   React Flow lineage dashboard (live + replay)
```

Langfuse (LLM observability) and Neo4j (lineage analysis) are **non-authoritative side channels** — never consulted for replay truth.

## Repository layout

A pnpm monorepo with import-rule-enforced boundaries:

```
doppl-prime/
├── packages/
│   ├── contracts/        # frozen Zod schemas (the Appendix-A models) — the contract surface
│   └── observability/    # Langfuse adapter + redaction scrub (thin)
├── apps/
│   ├── api/              # Node/TS backend: kernel · event-store · model-gateway ·
│   │   └── src/          #   verifier · check-runners · selection · projections · routes (REST/SSE)
│   └── web/              # React 19 + Vite dashboard (React Flow lineage)
├── fixtures/replay/      # committed creds-free demo-of-record fixtures
├── docs/                 # ARCHITECTURE companions, planning, gap audits, runbooks
├── ARCHITECTURE.md       # the binding design contract / source of truth
├── IMPLEMENTATION_PLAN.md # spec-anchored build plan + status
└── CLAUDE.md             # project conventions + safety invariants
```

Dependency direction is one-way: `contracts → infrastructure ports → domain/runtime → projections → api → ui`. Domain/runtime code imports only shared contracts and ports — never a provider SDK, the frontend, or a projection read model.

## Tech stack

| Layer | Backend (`apps/api`) | Frontend (`apps/web`) |
|---|---|---|
| Runtime | Node 22 LTS | Node 22 LTS |
| Package manager | pnpm (workspace) | pnpm (workspace) |
| Framework | Fastify (REST + SSE) | React 19 + Vite |
| Schema / validation | Zod (shared `packages/contracts`) | Zod (shared, read-only) |
| Persistence | Drizzle + Postgres (append-only `run_events`) | — (reads projections via API) |
| Graph UI | — | React Flow (`@xyflow/react`) + Dagre |
| Tests | Vitest (unit + integration vs real Postgres) | Vitest + Playwright (e2e smoke) |
| Observability | Langfuse Cloud (non-authoritative) | — |

Provider access is provider-agnostic via the **ModelGateway** (OpenRouter primary; direct-OpenAI embeddings; web-search retrieval grounding; keyless local `ollama`). **No SQLite.**

## Quick start

### Prerequisites

- **Node 22 LTS** and **pnpm**.
- **PostgreSQL** reachable via `DATABASE_URL` (the authoritative event log + projections). A throwaway local DB:

```bash
docker run --rm -d --name doppl-pg -p 5432:5432 -e POSTGRES_PASSWORD=doppl postgres:16
# → DATABASE_URL=postgres://postgres:doppl@localhost:5432/postgres
```

- For the **live path only**: an OpenRouter API key (and optionally an OpenAI key for embeddings/novelty). The replay path needs **no real keys**.

### Setup

```bash
pnpm install          # from the repo root
```

`.env.example` lists every env var the boot reads (each marked REQUIRED/OPTIONAL); it's single-sourced from the code allowlist and drift-guard-tested. Migrations run automatically at boot (`migrate → seed → start`). The API's `start` script loads the root `.env` for you (via `tsx --env-file`), and `pnpm dev` sources it too — no manual `export` needed.

### One command (recommended)

```bash
pnpm dev
```

This runs `scripts/dev-local.sh`, which: brings up a local Postgres in Docker matching your `.env` `DATABASE_URL` (only when the DB host is local; skipped if you point at your own/remote Postgres), waits for it to be ready, fetches the public Agarden demo data into `.cache/agarden`, seeds the curated `/agarden` maps, then boots the **API on `:3000`** (`migrate → seed → start`) and the **web dashboard** (Vite, proxying `/api` → `:3000`) together. Ctrl-C stops both; the Postgres container is left running for next time (`pnpm db:down` to stop it, `pnpm db:logs` to tail it).

If `.env` does not exist, `pnpm dev` creates it from `.env.example`. The default is the creds-free recorded path, so teammates do not need provider keys to inspect the local UI.

Open:

- `http://localhost:5173/runs` for the inner organism run observatory.
- `http://localhost:5173/knowledge` for the knowledge graph.
- `http://localhost:5173/agarden` for the outer Agarden map. The first `pnpm dev` run auto-seeds `The Rock Star Drone Problem` and `When the Crashes Don't Come`; set `DOPPL_AUTO_SEED_AGARDEN=0` to skip this, or `AGARDEN_FLOW_DIR=/path/to/agarden/flow` to seed from a local Agarden checkout.

Open the dashboard URL Vite prints. Whether it loads a seeded replay or boots live depends on your `.env`:

- **No keys / first run:** `DOPPL_GATEWAY=recorded` + `DOPPL_SEED_FIXTURE=demo-recorded-001` → boots and replays a committed run (Path A below).
- **Live LLMs:** `DOPPL_GATEWAY=live` with real `OPENROUTER_API_KEY` / `OPENAI_API_KEY`, `DOPPL_SEED_FIXTURE` empty (Path B below).

Validate the creds-free path anytime (no keys; needs Docker):

```bash
pnpm -C apps/api test:smoke:demo   # boot → seed → replay reaches the final-idea winner
```

### Path A — creds-free replay (the demo-of-record)

The safe default: boots the real stack and replays a committed real run — no API keys, fully deterministic, identical choreography to a live run.

```bash
# env: DATABASE_URL=real, OPENROUTER_API_KEY/OPENAI_API_KEY=placeholders,
#      DOPPL_GATEWAY=recorded, DOPPL_SEED_FIXTURE=demo-recorded-001
pnpm -C apps/api start         # migrate → seed → serve on :3000
pnpm -C apps/web dev           # the dashboard (Vite) in a second terminal
```

### Path B — live (the headline)

Real LLMs evolve against a problem you type. Non-deterministic, costs money, needs keys. Keep caps low to fit the demo window.

```bash
# env: DATABASE_URL=real, OPENROUTER_API_KEY/OPENAI_API_KEY=real, DOPPL_GATEWAY=live,
#      DOPPL_MAX_POPULATION=3, DOPPL_MAX_GENERATIONS=2  (leave DOPPL_SEED_FIXTURE unset)
pnpm -C apps/api start
pnpm -C apps/web dev
```

Full operator guide, the fallback ladder, and troubleshooting: **`docs/DEMO_RUNBOOK.md`**.

## Development

```bash
pnpm install                  # once, from the repo root

pnpm -r lint                  # lint all packages
pnpm -r typecheck             # tsc --noEmit (strict) everywhere
pnpm -r test                  # unit tests
pnpm format:check             # prettier

# backend integration tests (real Postgres via testcontainers — needs Docker)
pnpm -C apps/api test:integration

# demo smokes
pnpm -C apps/api test:smoke:demo   # creds-free e2e: boot → seed → replay reaches a winner
pnpm -C apps/api test:smoke:live   # live e2e (opt-in; skips cleanly without keys)
```

The deterministic kernel is built **test-first (TDD)**; the LLM-driven generation/critics/judge are non-deterministic and covered by an eval harness instead of unit assertions.

## Safety invariants

These are load-bearing in every run path (replay or live), never cut regardless of build posture:

1. **Caps are kernel-enforced, never prompt-enforced** — population, generations, energy, depth, tool-calls, wall-clock + a kill switch live in the runtime; a prompt can never hold a cap.
2. **The event log is append-only and authoritative** — projections are derived and rebuildable, never authoritative.
3. **No arbitrary code execution** — checks run through an allowlisted registry of non-executing adapters.
4. **Secrets never leave the server** — a redaction scrub runs at every persistence boundary (before append and before Langfuse emit).
5. **Model output is untrusted until schema-validated; candidate text is data, not instructions** — candidates reach critics/judges only inside sentinel-delimited fields (prompt-injection isolation).
6. **The held-out judge, its rubric, and the scoring policy are immutable to agents** — the anchor the organism cannot move.
7. **Replay calls no providers** — it reconstructs from the persisted RNG seed and recorded outcomes.
8. **Energy = successful productive spend only** — failed/retried/repaired attempts emit a failure event and do not debit energy.
9. **Postgres only; provider SDKs only behind the ModelGateway** — never imported into domain/runtime modules.

## Where to look

- **`ARCHITECTURE.md`** — the binding design contract / source of truth (read by `§<N>` section, never whole).
- **`IMPLEMENTATION_PLAN.md`** — the spec-anchored build plan and status.
- **`docs/DEMO_RUNBOOK.md`** — boot-and-run guide for both demo paths.
- **`CLAUDE.md`** — project conventions, safety invariants, and team protocol.
- **`apps/api/CLAUDE.md`** · **`apps/web/CLAUDE.md`** — per-area build guides and lessons.
- **`docs/`** — planning artifacts, gap audits, and operational runbooks.
```
