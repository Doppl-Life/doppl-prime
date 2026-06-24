# Team Handoff phase-d-002 — Phase D COMPLETE + merged; next = frontend-v2

**Date:** 2026-06-24
**Why:** lead approaching context limit (compaction prep). Phase D done + merged; the next phase (frontend-v2) is a big new effort that should start with a fresh lead + proper planning.

## State — Phase D DONE + merged to cody
- **`phase-d → cody` MERGED** = `03e934d` (`--no-ff`), pushed origin/cody. Integration gate green (typecheck clean, api unit 665 · web unit 203). The merge was a clean fast-forward (cody was an ancestor of phase-d); ZERO frozen-contract change.
- **PD.1–PD.20 all done.** The demo works end-to-end, **live-validated**: operator prompt → Start → live SSE → the lineage graph grows live → final `'selected'` winner → Stop. Plus run-list/replay browser, live-updating lineage (PD.20), cap-form clamp (PD.18), clear boot log (PD.19), web↔API proxy + shape reconciliation (PD.14/15/16).
- **Post-merge fix:** `STRONG_TIER` model = `openai/gpt-4o` (was `anthropic/claude-3.5-sonnet`, which 404s "No endpoints found" on OpenRouter accounts w/o Anthropic routing) — cody `c5c137b`, phase-d `899b012`. This was the cause of "evolution stuck at gen0": `fusion_synthesis` (reproduction, gen N→N+1) used STRONG_TIER → 404 → 0 survivors → gens 1..N failed.

## Open backend item (non-blocking)
- **`novelty_scoring_degraded`** on live runs = OpenAI **embeddings** (`text-embedding-3-small`) failing → novelty falls back. Worth confirming the user's `OPENAI_API_KEY` works for the embeddings endpoint (separate from the OpenRouter key). Run still completes + picks a winner without it.

## NEXT PHASE — frontend-v2 (user-approved kickoff = "draft the full phase plan")
**Goal:** refactor `apps/web` from the single functional dashboard into a real multi-screen application matching the design system. **The design work is already done** — this is "implement the DS screens wired to the real backend," NOT design-from-scratch.

**Two binding design references:**
1. **`/docs/doppl-design-system`** — the DS kit (READ its `readme.md` + `SKILL.md` first; `doppl-design` is a user-invocable skill). Has: design tokens (dark bioluminescent observatory), **15 React components** (StatusBadge, Meter, ModeBanner, ActivityTicker, AgenomeCard, CandidateCard, CriticGauntletPanel, RunEnergyGauge, HealthIndicator…), and **clickable HTML prototypes of S0 Runs Home / S1 Run Launcher / S2 Organism View / S5 Final Idea**. Five non-negotiable rules: status = shape+icon+label+color (never color alone); LIVE vs REPLAY unmistakable (ModeBanner); dark calm chrome + meaningful glow; meaningful motion (honor prefers-reduced-motion); machine-truth verbatim (snake_case mono, scores 0–1).
2. **A richer mockup the user shared (2026-06-24, in chat)** — the layout they explicitly like: **3-pane shell** = left (SEED A THOUGHT form + "THE DIAL" run controls: diverge·novelty / converge·grounding, Generate/Keep, MUTAGEN-SKILL operators [breakthrough/first-principles/polymath/breakout/blindside/subtraction/constraint]) · center (the living graph with **every node labelled with its idea title**, color-coded seed/problem/doppl, halo = novelty×grounding) · right (deep **INSPECTOR**: judge 5-axes w/ per-axis rationale, novelty/grounding meters, TRACE). Header has an ollama/local-model selector + Providers/Proof-board/Analyze/Insights/Export.

**Reconciliation flag for the plan** — tag each UI concept **wire-to-existing-backend** vs **needs-new-backend/contract**: the mockup has richer concepts than today's backend exposes — mutagen-skill **operators**, the **diverge/converge dial**, **ollama/local-model** selection, and judge axes shown as Novelty/Grounding/**Falsifiability/Cost-efficiency/Relevance** on **−5..+5** vs the frozen contract's grounding/novelty/**feasibility/falsification_survival/subtype_check_pass** on 0–5 (UI shows 0–1).

**Backend plumbing EXISTS** (Phase D wired it): `apps/web/src/data/runClient.ts` has `listRuns · getRun · getLineage · getEvents · getReplay · getRunHealth · getProblemSets · getFallbackLadder · getModelRoutes · getCapMaxima · startDemoRun · startRun`; SSE stream + live re-fetch (PD.20); lineage projection (50-node real graphs). So frontend-v2 is mostly a presentation rebuild.

**Proposed decomposition (new phase):** DS adoption (tokens + core components into `apps/web`) → app shell + router (currently single-route) → **S0 Runs Home** (run-history/replay) → **S1 Launcher** → **S2 Organism View** (centerpiece: graph-with-idea-labels + roster + ticker + node-click inspector + critic gauntlet) → **S5 Final Idea**. Each TDD-sliced + wired to real data, vs the DS screens. Fresh team (a web implementer). Use the `doppl-design` skill.

## How to run the demo (env quirks discovered — don't re-derive)
- **Docker Desktop must be running.** Postgres container creds MUST match `.env` `DATABASE_URL` (=`doppl:<pw>@localhost:5432/doppl`): `docker run --rm -d --name doppl-pg -p 5432:5432 -e POSTGRES_USER=doppl -e POSTGRES_PASSWORD=<pw from .env> -e POSTGRES_DB=doppl postgres:16`.
- **`.env` at repo root.** `loadConfig` reads `process.env` directly (NO dotenv) → `set -a; . ./.env; set +a` before booting.
- **`unset DOPPL_FIXTURE_DIR`** — the user's `.env` still has the relative `fixtures/replay` which breaks `pnpm -C apps/api start` (CWD=apps/api → ENOENT). PD.19 fixed `.env.example` only, not the user's `.env`.
- **Live:** `export DOPPL_GATEWAY=live; unset DOPPL_SEED_FIXTURE; pnpm -C apps/api start` (now logs "Doppl API listening on http://0.0.0.0:3000" — PD.19). **Replay:** `export DOPPL_GATEWAY=recorded DOPPL_SEED_FIXTURE=demo-recorded-001`.
- **Web:** `pnpm -C apps/web dev` → http://localhost:5173 (proxies `/api`→:3000). **The user runs `open-webui` on :3000** — it must be stopped for the Doppl API to bind :3000.
- **Start runs via the OPERATOR-PROMPT panel** (sends no caps). The API does NOT hot-reload — restart it to pick up config/code changes.
- The user has been running from the **`../Capstone-phased`** worktree (phase-d branch); the main line is **`Capstone`** (cody). For frontend-v2, prefer working from cody.

## Team state
Phase D team (orch + web implementer) stood down (shutdown_request approved). Registry may carry stale dupes — clear at `/team-end`. No team running now. For frontend-v2: draft the plan first, then stand up a fresh team.
