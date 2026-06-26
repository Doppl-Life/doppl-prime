# Session 011 — Research tools fixed · KB MVP + graveyard shipped · in-run retrieval next

> **Branch `cody`** (working branch; was `experiment/mutagen-dynamics`, consolidated into `cody` this
> session). **Everything below is PUSHED to `origin/cody`** (HEAD `d8b7a52`). Collaborator **"Michael"**
> drives the calls. Read this doc + `docs/planning/shared-knowledge-space.md` (the LOCKED KB design) on resume.

## TL;DR

This session: (1) fixed all **3 research tools** + an x_search refinement, (2) built the **Knowledge-Space
MVP** (ResearchNote projection → REST endpoint → React-Flow "Knowledge Evolution" graph), (3) added the
**graveyard** (culled lineages' research shown as dead ends), each adversarially reviewed + live-verified in
the browser via `/browse`. **ACTIVE NEXT = in-run retrieval (KB design slice 3)** — agents query the shared
knowledge at generation time. The evolution CLIMB is still PAUSED + ceiling-bound (see
`docs/planning/evolution-climb-plan.md` "CLIMB REFRAME"; do NOT build more drive levers).

## What shipped (all pushed to origin/cody)

### Research tools (the live agent-research path)
- `0f68b00` **x_search** — default model `x-ai/grok-4.1-fast` was DEPRECATED→404 and `createGroundedSearch`'s
  `?? ''` swallowed it (silent "returns nothing"). Bumped → `x-ai/grok-4.3` (web plugin returns real X
  citations); `createGroundedSearch` now THROWS on `data.error` (loud, not silent); appends `url_citation`
  source URLs.
- `2e0e4d8` **youtube_search** — was one "find+summarize" call (hallucinated summary). Now: discover real
  watch URLs (web-grounded) → ingest each via Gemini's native `video_url` part (the model actually
  watches/transcribes — live-verified exact lyrics + a real 2.6 KB battery-video transcript) → keep first
  `maxVideos`(2) of `discoverCount`(4), skip refusals (`isVideoRefusal`). Two live gotchas baked in: a
  "reply VIDEO_UNAVAILABLE" escape hatch caused FALSE declines (removed → direct prompt); ingestion is
  VIDEO-SPECIFIC flaky (some videos reliably refuse) → over-discover+filter, not retry.
- `fa73417` **fetch_url** (SOLO security) — was `redirect:'manual'` (blocked article reads) + a documented
  [high] resolve→connect TOCTOU. Now a redirect-FOLLOWING loop re-validating the literal SSRF gate +
  all-records DNS on EACH hop + **pins the socket to the validated IP** (node `http/https` `lookup` hook;
  SNI+Host stay the hostname) → **TOCTOU CLOSED**. security-reviewer adversarial pass = 0 crit/high/med/low.
  The [high] (the pre-hosted-deploy blocker) is closed.
- `90b37bb` **x_search X-framing** — a bare topic made grok answer a generic web explainer (0 X posts); added
  an X(Twitter) framing prefix → live-verified **23 real `x.com/.../status/...` URLs**.

All seam logic lives in `apps/api/src/boot/toolSeams.ts` (+ `model-gateway/tools/{registry,ssrf}.ts`).
Tools attach ONLY to the `population_generator` route (rule #6). Replay reads persisted tool results (rule #7).

### Knowledge-Space MVP (the "Knowledge Evolution" graph)
- `4757dee` **KB-1 — ResearchNote projection** (`apps/api/src/projections/research-notes.ts`): a PURE fold
  over `tool_call.finished` → notes `{tool, query(normalized from raw JSON args), snippet, sourceUrls,
  agenome, gen, eventId}` + agenome→note `researched` edges (+ candidate→note `cited` when a
  `candidate.created.evidenceRefs.eventId` matches a note's event). Keyed by id (idempotent), lean (full
  result stays in the log, rule #2), replay-safe (no provider, rule #7). Mirrors §51/§53 (`buildProjection`).
- `684a34e` **KB-2 — `GET /runs/:id/knowledge`** (`apps/api/src/routes/runs-read.ts`): rebuild-on-read,
  clean 404, read-only (§57). Integration-tested vs real PG.
- `204c6e9` **KB-3 — frontend graph** (`apps/web/src/knowledge/*`): React Flow — generations = columns,
  agenomes = hubs, notes = tool-coded leaves; `apps/web/src/data/knowledge.ts` (web-local Zod schema +
  `getKnowledge`); route `/runs/:id/knowledge` + an AppShell Organism/Knowledge nav. Reads left→right as the
  swarm's knowledge GROWS generation over generation.
- `3595020` **graveyard** (design feature #5): the projection folds `lineage.culled` → an `agenomes` map
  `{culled, score}` (cull score from `scoreSnapshot`); the web renders culled lineages' research as red "✕
  dead end" cards + "✕ culled <score>" hubs + a summary count + legend key (encoded by label+glyph+color,
  never color alone — rule #4). The anti-survivorship-bias map.
- `d8b7a52` **graveyard review fixes** — a 3-lens adversarial-review **Workflow** caught 2 real defects:
  `culledCount` over-counted non-researching culled agents (fixed → count the note-bearing population);
  `youtube_search` shared `--status-culled` red with the graveyard (fixed → youtube `--status-active` cyan,
  red reserved for dead-ends). + the missing edge-case tests + a cull-score tooltip. Dispositioned no-change
  (rationale): the `lineage.culled` payload cast matches the projection pattern (§26) + is read defensively.

**Green:** ~890 api unit + 195 integration + 212 contracts; 343 web unit; full `/preflight` clean.

## The live demo (how to run + the demo run)

```bash
# Postgres (already up — 2 days; 2708 tool_call events from prior live runs)
docker ps | grep doppl-pg
# API (read-only serving; recorded gateway = NO live spend; 0 non-terminal runs so the worker is idle)
DOPPL_GATEWAY=recorded pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone/apps/api start   # :3000
# Web dashboard
pnpm -C /Users/dreddy/Documents/GauntletAI/Capstone/apps/web dev                            # Vite (5173/5174)
```
**Demo run** = `48cd4a0f-95a7-450e-a35f-2b45c77ff68c` (ER-patient-flow, the richest research: **95 notes ·
28 agents · 9 culled · 5 generations**). View: `http://localhost:<viteport>/runs/48cd4a0f.../knowledge`.
Verify with the gstack **`/browse`** skill (binary `~/.claude/skills/gstack/browse/dist/browse`; `goto` →
`screenshot` → Read the PNG) or the `mcp__claude-in-chrome__*` tools. Caveat: background dev servers may not
survive compaction — restart them. Vite jumped to 5174 once because 5173 had a stale server; check the log
for the actual port.

## ⚠ pgvector is NOT installed (a real infra fork for KB design-slice-2)
The pg image is stock **`postgres:16`** (not `pgvector/pgvector:pg16`); `pg_available_extensions` has no
`vector`. Embeddings live INSIDE `novelty.scored` event payloads (jsonb in `run_events.payload`), NOT a
dedicated column. So **design-slice-2 (pgvector migration) needs a Docker image swap that recreates the pg
container — which would lose/recreate the demo data unless the volume is preserved or data re-seeded.** Flag
this to Michael before doing slice-2. The brute-force cosine path (`apps/api/src/selection/novelty/cosine.ts`)
is what novelty uses today and is enough for in-run retrieval NOW; pgvector is a later perf optimization.

## ▶▶ ACTIVE NEXT = in-run retrieval (KB design slice 3) — Michael chose this

The CORE KB feature (the stigmergy payoff): **agents query the shared knowledge at generation time → it
changes their ideas.** Design ref: `docs/planning/shared-knowledge-space.md` slice 3 + features #1/#2.

**Dependency chain (research notes have NO embeddings yet — KB-1 was structural-only):**
1. **Embed research notes at run time + PERSIST the embedding (rule #7).** The embedding gateway role exists
   (`embedding` role → OpenAI `text-embedding-3-small`; see `apps/api/src/selection/novelty/embed.ts`). The
   embedding must be a PERSISTED event/payload so replay re-reads it (never re-embeds) — mirror how
   `novelty.scored` persists its `vector`. Decide: a new event/field for note embeddings, or embed-on-ingest
   in the tool-orchestrator and stash on `tool_call.finished` detail. This is the genuinely new piece.
2. **Retrieval seam** (IO → lives in `boot/`/seam layer like the tools, NOT the pure runtime loop): given the
   current agent's query/problem, embed it, **brute-force kNN cosine** (reuse `selection/novelty/cosine.ts`)
   over the persisted note embeddings, return top-K. The diverge/converge dial (FB.4 `generationBias`, already
   plumbed) picks NEAR (converge: follow the trail) vs FAR (diverge: anti-retrieve).
3. **PERSIST each retrieval result as an event** (rule #7) so replay re-threads the identical set with no
   provider/index call (lesson §44 caller/adapter split — the caller fetches + persists; the consumer reads).
4. **Thread the retrieved notes into the `population_generator` request as `wrapUntrusted` DATA** (rule #5) —
   reuse the isolation chokepoint (`apps/api/src/verifier/isolation/candidate-as-data.ts` / the contracts
   `wrapUntrusted`); research is untrusted DATA, never interpolated into the instruction string.
5. The orchestration entry is `apps/api/src/boot/toolOrchestrator.ts` (builds the multi-turn
   population_generator request) + the runtime generation loop (`apps/api/src/runtime/loop/generationLoop.ts`).
   The runtime loop stays replay-pure; retrieval is an injected seam (like the tool seams).

**Suggested decomposition:** (3a) note-embedding persistence [TDD the deterministic parts + a live embed
check] → (3b) the brute-force retrieval seam + persistence [TDD: injected embed/cosine] → (3c) thread into
generation as wrapUntrusted DATA + the near/far dial [TDD the assembly] → live run to demo agents using the
KB. Needs a LIVE run (embeddings + generation) to demo; n≥3 for any climb claims (Michael authorized paid
live experimentation — "spend until clear view"). It is NOT visible in the current graph (it changes the
candidates, not the graph) — consider also surfacing "this candidate retrieved these notes" later.

## Safety carry-forward (load-bearing — preserve)
- **rule #2** KB is a DERIVED rebuildable projection; `run_events` stays the sole system of record.
- **rule #7** anything an agent READS during generation is part of run determinism → PERSIST every retrieval +
  every embedding; replay re-threads with NO provider/index call. **The sharp one for slice 3.**
- **rule #5** research fed into a generation prompt is untrusted DATA → `wrapUntrusted`, never in the
  instruction string.
- **rule #6** the held-out judge (mvp-3) + scoring policy are immutable anchors; tools/retrieval attach ONLY to
  the `population_generator` route, never the judge/critic path. Any judge change needs Michael's sign-off.
- **rule #4** secrets env-only; the `.env` OPENROUTER_API_KEY is now CLEAN (a prior em-dash corruption was
  fixed by Michael; parses as a 73-char `sk-or-v1-…`, authenticates via fetch).
- **rule #8** building/reading the KB is not a productive spend (no energy debit); a retrieval failure debits
  nothing.

## Open items / backlog
- **pgvector swap** (design slice 2) — gated on the Docker image decision (above).
- **Visual:** `fitView` shrinks 95 notes (cards tiny); a tighter per-generation layout / initial zoom would
  read better. The React Flow zoom controls work (bottom-left).
- **Other KB slices:** heritable bibliography (#4), GPS-migration UMAP viz (#6), cross-run brain (#7, hard
  replay fork), Neo4j analytics (#8).
- Uncommitted, not mine: `.gitignore` gained `+.gstack/` (the /browse skill's local-state ignore) — harmless;
  `.DS_Store` / `docs/layers/` / `image.png` are pre-existing untracked noise — leave them.

---

## RESUME PROMPT (paste after compaction)

```
Resume Doppl on the `cody` branch (/Users/dreddy/Documents/GauntletAI/Capstone — verify `git branch
--show-current` == cody). Everything is PUSHED to origin/cody (HEAD d8b7a52). Collaborator "Michael" drives
the calls; ultracode may be on (use Workflow for substantive tasks + adversarially verify). FIRST read
docs/sessions/011-2026-06-26-*.md (the full handoff) + docs/planning/shared-knowledge-space.md (LOCKED design).

DONE this session (all pushed, all green): the 3 research tools fixed (x_search grok-4.3 + X-framing,
youtube real transcripts via Gemini video_url, fetch_url redirect-follow + [high] TOCTOU CLOSED); the KB MVP
(ResearchNote projection 4757dee → GET /runs/:id/knowledge 684a34e → React-Flow Knowledge Evolution graph
204c6e9); the graveyard 3595020 + review fixes d8b7a52 (culled lineages' research shown red as dead ends).
Live-verified via /browse on demo run 48cd4a0f-95a7-450e-a35f-2b45c77ff68c (95 notes · 28 agents · 9 culled ·
5 gens). The evolution CLIMB is PAUSED + ceiling-bound (evolution-climb-plan.md "CLIMB REFRAME" — do NOT
build more drive levers).

ACTIVE NEXT = in-run retrieval (KB design slice 3): agents query the shared knowledge at generation time so it
changes their ideas (the stigmergy payoff). Dependency chain: (3a) embed research notes at run time + PERSIST
the embedding (rule #7 — notes have NO embeddings yet; KB-1 was structural-only; mirror how novelty.scored
persists its vector; embedding role exists at selection/novelty/embed.ts) → (3b) a brute-force kNN cosine
retrieval seam (reuse selection/novelty/cosine.ts; lives in boot/ seam layer, NOT the replay-pure runtime
loop) that PERSISTS each retrieval (rule #7) → (3c) thread the retrieved notes into the population_generator
request as wrapUntrusted DATA (rule #5, reuse verifier/isolation/candidate-as-data.ts); the diverge/converge
dial (FB.4 generationBias) picks NEAR (converge) vs FAR (diverge). Orchestration entry: boot/toolOrchestrator.ts
+ runtime/loop/generationLoop.ts. TDD the deterministic parts; needs a LIVE run to demo (n>=3 for climb claims).

INFRA FORK to flag to Michael: pgvector is NOT installed (image is stock postgres:16, embeddings live in
novelty.scored jsonb) — KB design-slice-2 (pgvector) needs a Docker image swap that recreates the pg
container (risks the demo data). Brute-force cosine is fine for slice 3 NOW; pgvector is a later optimization.

Demo stack: docker doppl-pg up; API `DOPPL_GATEWAY=recorded pnpm -C apps/api start` (:3000, no live spend);
web `pnpm -C apps/web dev` (Vite 5173/5174 — check the log for the port); /browse to verify. Never push
without Michael's OK (origin only). The judge mvp-3 is a rule-#6 anchor. The .env OPENROUTER_API_KEY is clean.
```
