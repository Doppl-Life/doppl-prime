# Session 012 — in-run retrieval + launcher cleanup + runs-table redesign + PR workflow

> **Status (2026-06-26):** All work is **on `main`** (`origin/main` HEAD `6ba801d`). Local `main` ==
> `origin/main`. The team now lands changes to `main` via **GitHub PRs** (no more direct pushes). Collaborators
> Melissa + Dalton are active on their own branches. **Read this + `docs/sessions/011-*.md` (the in-run
> retrieval design) on resume.**

## ⚙️ PROCESS CHANGE — PR workflow to main (effective now)

Land all changes to `main` via a **GitHub pull request**, NEVER `git push origin main`:

1. `git checkout main && git pull --ff-only origin main` (grab Melissa/Dalton's merges)
2. `git checkout -b feature/<topic>` (or `fix/<topic>`) — **branch off `main`** (cody is retired as the
   integration branch; `main` is the base now)
3. commit (conventional commits + the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer)
4. `git push -u origin <branch>` — the BRANCH, never `main`
5. `gh pr create --base main` (gh 2.92, account **SiWarlock**, SSH; default repo `Doppl-Life/doppl-prime`).
   End the PR body with the Claude Code generated-with line.
6. **the user/team merges** on GitHub. Do NOT merge or push `main`. After merge: sync main, delete the
   branch (`git branch -D <b>` + `git push origin --delete <b>`).

Still **ask before any push** (branch push / PR open is outward-facing). Memory: `pr-workflow-to-main.md`.

## ✅ SHIPPED THIS SESSION (all on `main`)

### 1. In-run retrieval (KB design slice 3) — the stigmergy payoff
Agents query the shared knowledge base at generation time so prior agents' research changes their ideas.
Full design + rationale in `docs/sessions/011-*.md`. 6 commits (`5294155`→`83c811d`), merged via `4a20e3d`.
- `apps/api/src/selection/knowledge/retrieve.ts` — pure kNN (cosine + **Jaccard lexical fallback**; near=follow trail / far=anti-retrieve).
- `apps/api/src/runtime/loop/generationLoop.ts` — injected `retrieveKnowledge` seam; persists the retrieved
  set on `candidate.generation_started` (rule #7, **no schema bump** — lesson §107); threads notes as a 2nd
  `wrapUntrusted` user message (rule #5/#6, judge path untouched).
- `apps/api/src/projections/research-notes.ts` — folds `retrieved` edges (the stigmergy read).
- `apps/api/src/boot/knowledgeRetriever.ts` — wired into `composeRuntime`+worker; **always-on, self-gates on
  notes** (no notes → no-op, so recorded/replay is byte-identical). **LEXICAL MVP — keyless**; auto-upgrades to
  cosine the moment notes carry embeddings.
- `apps/web/src/knowledge/*` — animated cyan `retrieved` edges + legend.
- **LIVE-VERIFIED:** run `8bcda562` fired retrieval (6 `retrieved` edges on real notes). Gen-1 agenome
  failures that run were a **user internet blip**, not code (graceful degrade, rule #8).

### 2. Launcher cleanup (the "new run" form) — last DIRECT push (`2aec332`)
- Dropped 2 INERT fields (Model profile + Scoring policy version — recorded but never affected a run) →
  read-only line `scoring mvp-2 · judge final-judge-mvp-3` (rule-#6 immutables).
- Documented the diverge/converge dial's second effect: it ALSO steers in-run retrieval (converge→near, diverge→far).
- Added a real **model-override picker** (`GET /config/model-route-overrides` + the FB.2 allowlist;
  `final_judge` excluded, rule #6).

### 3. Runs page → date-sorted table — PR #12 (MERGED, the first PR-flow change)
The runs home was an unorganized card grid (id + seq only). Now a **date-sorted table**:
`# · Run · Date · Problem · Final idea · Status · Gens · Cands · ↻✕⤳ · Replay`.
- `apps/api/src/projections/run-summary.ts` (NEW) — `buildRunSummary(events)` enriches each run: status +
  winner (reuses `buildCurrentState`), `createdAt` (run.configured), **problem TITLE** (strips "Problem:",
  first sentence), finalIdea title/summary, and generation/candidate/reproduction/cull/mutation counts.
- `GET /runs` (`routes/runs-read.ts`) serves them **sorted newest-first** (no extra DB cost; ~0.4s for 52 runs).
- `apps/web/src/components/run/RunsTable.tsx` (NEW) — fixed layout + colgroup (Problem + Final idea 25% each,
  2-line clamp). Retired `RunCard`. Live-verified via `/browse`.

## Dev stack (how to run + verify)
- Postgres: `docker doppl-pg` (up; trust auth, `docker exec doppl-pg psql -U doppl -d doppl` works).
- API: `DOPPL_GATEWAY=recorded pnpm -C apps/api start` (:3000, no spend — reads only). `live` needs the
  OpenRouter key in root `.env` (clean). ⚠ restarting the API kills the prior :3000 instance → its background
  task reports exit 143 (SIGTERM, benign).
- Web: `pnpm -C apps/web dev` (Vite :5173, proxies `/api`→3000; HMR picks up edits live).
- Visual check: the gstack **`/browse`** skill (binary at `~/.claude/skills/gstack/browse/dist/browse`) —
  `$B goto http://localhost:5173/ ; $B screenshot <path>` then Read the PNG.

## Safety carry-forward (unchanged invariants)
Caps kernel-enforced (#1) · append-only log authoritative (#2) · no arb code exec (#3) · secrets env-only,
scrubbed at the boundary (#4) · model output untrusted → wrapUntrusted DATA (#5) · **held-out judge
`final-judge-mvp-3` + scoring `mvp-2` immutable to agents/per-run config (#6 — the anti-reward-hacking
anchor)** · replay calls no providers (#7) · energy = successful spend only (#8) · Postgres-only, SDKs behind
the gateway (#9). The climb is PAUSED/ceiling-bound (`docs/planning/evolution-climb-plan.md` CLIMB REFRAME).

## NEXT — "a couple of tweaks and fixes" (user-driven)
The user will bring the specific list. Likely candidates from the recent work:
- **Runs table polish** — relative dates ("2h ago"), more/fewer columns, column proportions, click-through behavior.
- **In-run retrieval → cosine** — persist note embeddings at run time (rule #7) so the retriever upgrades from
  lexical to cosine (the pure `retrieveNotes` already accepts vectors; needs the embed-at-ingest + persist seam).
- **Knowledge-graph generation scrubber** — rewind the KB graph by generation (the lineage view has a scrubber;
  the KB graph relies on the live poll + columns).
- Other UI polish on the dashboard screens.

Whatever it is: branch off `main`, PR it, the user merges.

---

## RESUME PROMPT (paste after compaction)

```
Resume Doppl (/Users/dreddy/Documents/GauntletAI/Capstone). You are on `main` (verify `git branch
--show-current` == main; `git pull --ff-only origin main` first to grab Melissa/Dalton's merges). HEAD was
6ba801d. Collaborator "Michael" drives the calls.

PROCESS — land changes to `main` via GitHub PRs, NEVER `git push origin main` (the team uses PRs). Flow:
branch off main (feature/<topic> or fix/<topic>) → commit (conventional + Co-Authored-By: Claude Opus 4.8
(1M context) trailer) → `git push -u origin <branch>` → `gh pr create --base main` (gh authed as SiWarlock,
default repo Doppl-Life/doppl-prime) → the USER merges. Ask before any push. cody is retired; branch off main.

DONE recently (all on main): (1) IN-RUN RETRIEVAL (KB slice 3) — agents query the shared KB at gen time;
pure kNN retriever (selection/knowledge/retrieve.ts, LEXICAL MVP keyless, cosine auto-upgrades) → loop
retrieveKnowledge seam persisting candidate.generation_started (rule #7, no schema bump) + wrapUntrusted into
population_generator (rule #5/#6) → research-notes projection 'retrieved' edges → boot/knowledgeRetriever.ts
(always-on, self-gates on notes) → web animated cyan edges. Live-verified (run 8bcda562). (2) Launcher
cleanup (inert fields→read-only line, dial retrieval doc, model-override picker GET /config/model-route-
overrides). (3) Runs page → date-sorted enriched table (projections/run-summary.ts + GET /runs sorted
newest-first; web components/run/RunsTable.tsx; retired RunCard) — PR #12 MERGED. Full handoff =
docs/sessions/012-2026-06-26-*.md; in-run retrieval design = docs/sessions/011-*.md.

NEXT = a couple of small tweaks/fixes the user will specify (likely runs-table polish, or note-embeddings to
upgrade retrieval to cosine, or a KB-graph generation scrubber). Each one: branch off main → PR → user merges.

Dev stack: docker doppl-pg up; API `DOPPL_GATEWAY=recorded pnpm -C apps/api start` (:3000, no spend); web
`pnpm -C apps/web dev` (:5173, proxies /api→3000); /browse skill for visual checks (binary at
~/.claude/skills/gstack/browse/dist/browse). Restarting the API SIGTERMs the prior :3000 instance (exit 143,
benign). Judge final-judge-mvp-3 + scoring mvp-2 are rule-#6 immutables. Climb is PAUSED/ceiling-bound.
TDD the deterministic parts; full preflight (typecheck+lint+test, both apps/api and apps/web) before any PR.
```
