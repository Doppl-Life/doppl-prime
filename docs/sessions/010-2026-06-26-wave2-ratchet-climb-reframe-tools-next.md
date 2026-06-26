# Session 010 — Wave 2 (comparative judge) + the ratchet shipped; climb proven CEILING-BOUND; research-tools next, then the knowledge space

**Date:** 2026-06-26 · **Branch:** `experiment/mutagen-dynamics` (off `cody`) · **NOTHING pushed** (origin only, on user OK) · Collaborator **"Michael"**.

> **READ-FIRST on resume.** The active next work is **(A) fix the 3 research tools, then (B) build the shared
> knowledge space (slices 1–3).** The evolution CLIMB is **paused** — it's ceiling-bound, not algorithm-bound
> (see §3). Durable plans: `docs/planning/evolution-climb-plan.md` (the "CLIMB REFRAME" section) +
> `docs/planning/shared-knowledge-space.md` (the LOCKED knowledge-space design). The resume prompt is at the
> bottom of this file.

---

## 1. What shipped this session (all green, NOT pushed)

**Wave 2 — comparative 0–10 held-out judge (Michael-signed-off rule #6 change).** The Wave-1 ceiling was
judge-gated: the 0–5 isolated-absolute judge clustered every axis at 3–4 (central tendency), so
`judge_acceptance` (the dominant 46% fitness weight) compressed to 5–6 distinct values capped ~0.68 and
couldn't separate the top. Michael chose **"Both at once"** (AskUserQuestion): widen the scale **0–5 → 0–10**
AND hoist the judge to ONE **peer-context comparative** call per generation.

| commit | slice |
|---|---|
| `303119c` | S1 — widen per-axis scale 0–5→0–10; `policyVersion` `final-judge-mvp-2` → `final-judge-mvp-3`; `JUDGE_AXIS_MAX_SCORE` 5→10 |
| `6ba20a3` | S2 — `assembleIsolatedComparativeRequest` (multi-blob rule-#5 isolation seam) |
| `2302bc4` | S3 — `runComparativeJudge` + extracted `judge-core.ts` (single + comparative share rubric/acceptance/events byte-identically); the **peer-invariant FLOOR** pin |
| `f396354` | S4 — hoist the judge out of the per-candidate map in `verify-seam.ts` → one comparative call/generation |
| `a73a1d0` | unit verify-seam test adapted to the hoist |

Rule #6 preserved: frozen `FinalJudgeRubric` byte-identical (only `policyVersion` moved); **acceptance is
peer-INVARIANT given fixed axis scores** (the runner sums `axes × immutable weights`, no peer term — the
structural FLOOR). Rule #5 (each candidate a sentinel-wrapped DATA blob), rule #7 (per-candidate
`judge.reviewed` persisted). Bonus: comparative judge is **cheaper** — 1 judge call/gen vs 6.

**The RATCHET — hall-of-fame carry (`a7e850c`).** Genome-elitism carries the champion *agenome* but
re-generates its candidate each gen → the score re-rolls, and when that re-roll is culled the champion drops
out of the eligible-parent set and reproduction mean-reverts ("reaches 0.744 then loses it"). Fix: new config
`DOPPL_HALL_OF_FAME_CARRY` (default **0 = HEAD-identical**); when >0 the loop stashes the reigning champion's
real `Agenome` and the pure `withChampionParent()` ALWAYS re-presents it as a reproduction parent — even after
its re-roll is culled — so directed reproduction breeds against the champion's **locked peak candidate**
(`projectSuccessorParents` reads it verbatim from the log, rule #7). A PARENT only → offspring count
unchanged (rule #1). Files: `runtime/config/{configSchema,loadConfig}.ts` + `runtime/loop/generationLoop.ts`
(`withChampionParent` exported + 6 unit tests in `resolveEligibleParents.test.ts`).

**Green:** 870 api unit + 195 integration (9 key-gated skips) + 212 contracts; full `/preflight` clean.

## 2. Live bake-off (n=3 × fusion_only / adaptive / ratchet, pop6×5gen, seeds 42/7/99)

- **Judge discrimination fixed:** 9–12 distinct acceptances/run (vs Wave-1's 5–6); the 0.68 ceiling broke to
  **0.74**. 0 schema rejections live (the comparative array schema is solid through the OpenRouter json_object
  adapter, lesson §98).
- **Mutations confirmed firing:** `adaptive`/`ratchet` = 10–14 of 30 offspring are `mutation_only` (~⅓–½);
  `fusion_only` = 0 (by design — `baseMutationFraction 0`). Michael's "no mutations" was the strategy, not a bug.
- **Ratchet's real, measured win:** peak-to-final **drop 0.030 → 0.006** (clean separation — all 3 ratchet
  seeds ≤0.011, all 3 adaptive ≥0.017). It HOLDS the peak. `advancementCount` unchanged (~1.3) — it prevents
  regression, doesn't add advancement.
- The **gen0-0 monopoly** Michael spotted: the champion seed is a parent in **27 of 30** fusions (~90%) — the
  population inbreeds on one lineage. Real diversity problem (relevant to the knowledge-space graveyard).

## 3. THE CLIMB REFRAME (the big finding — paused here)

Two cheap diagnostic checks (drunk-claude's instinct, then verified) reframed the whole goal:

- **Judge-ceiling probe (live):** hand-crafted EXCELLENT answer (airline yield-mgmt + Little's Law → ER)
  scores **0.740** (axes 7,7,7,8,8) · GOOD 0.62 · MEDIOCRE 0.48 · WEAK 0.24. **A genuinely excellent answer
  caps at ~0.74 — exactly where evolution already tops out. No headroom above ~0.74.** (The judge correctly
  reserves 9–10 for "genuinely rare," so excellent gets 7–8s. Wave 2's real win = the judge is now a clean
  quality instrument.)
- **Random-restart control (analytic):** observed `advancementCount` 1.22 ≈ i.i.d.-noise H(5)−1 = **1.28**.
  The metric never measured a climb.

**Conclusion:** the wall is NOT the algorithm — the model writes a ~0.69 answer on the FIRST try and the judge
caps excellent at ~0.74, so the run bounces in a ~0.05 band *already near the summit*. Building drive levers
(judge-rationale→mutation, niching, MAP-Elites) chases headroom that doesn't exist.

**3 deferred paths (Michael's decision, NOT yet made):** (1) declare the mechanism done; (2) **seed WEAK** so a
real 0.4→0.74 climb is visible (recommended for a demo — gen 0 starts at the summit); (3) harder problem with
real headroom. Full detail: `evolution-climb-plan.md` "CLIMB REFRAME".

## 4. ACTIVE NEXT WORK — (A) fix the research tools, THEN (B) the knowledge space

Michael's call: **fix the tool features first, then continue to the knowledge space.** The knowledge space
INGESTS from tool calls, so richer tools = a richer KB.

### (A) Research-tool fixes — `apps/api/src/boot/toolSeams.ts` (+ `model-gateway/tools/{registry,ssrf}.ts`)

The frozen `ToolName` allowlist (rule #3) = `web_search` / `fetch_url` / `x_search` / `youtube_search`
(`packages/contracts/src/gateway/tool.ts`). Current live state (verified from runs):

1. **`x_search` — returns nothing (100% empty).** Currently `createGroundedSearch({ model: 'x-ai/grok-4.1-fast',
   plugins:[{id:'web'}] })`. The OpenRouter `web` plugin isn't returning X/Twitter results this way. **Fix:**
   investigate the correct OpenRouter X-search path (Context7/docs — the `web` plugin's X behavior, an
   `x_search_filter`/search-params body, or the right xAI model + plugin config) so it actually returns X posts.
2. **`youtube_search` — returns SUMMARIES, not transcripts.** Currently `gemini-2.5-flash` + the
   `YOUTUBE_QUERY_PREFIX` "Find and summarize relevant YouTube videos" — it just asks the model to summarize,
   never fetches a transcript. **Fix (Michael's spec):** the agent picks a video → fetch that video's
   TRANSCRIPT → read it → do this in PARALLEL across multiple videos. Needs a transcript fetch (a YouTube
   transcript API) returning real transcript text, not a model summary.
3. **`fetch_url` — SSRF guard blocks article reads + `[high]` TOCTOU residual.** `createSafeHttpGet` uses
   `redirect:'manual'` → most article URLs (which 30x-redirect) return "[redirect not followed]". **Fix:**
   follow redirects SAFELY — re-run the SSRF host check (`resolveHostIsPublic`) on EACH redirect hop instead of
   refusing all redirects. AND close the documented `[high]` resolve→connect TOCTOU (connect to the validated
   IP with a `Host` header). This `[high]` must be closed before any hosted deploy regardless.

Each tool seam is INJECTED (`ToolExecutorDeps`) + unit-testable with faked `fetchFn`/`lookupAll`. Tools attach
ONLY to the `population_generator` route (rule #6 — judge/critic never see a tool). Replay reads persisted tool
results, never re-executes (rule #7). TDD the deterministic parts; the live behavior is an operator-run check.

### (B) Shared knowledge space — `docs/planning/shared-knowledge-space.md` (design LOCKED + reviewed)

Stigmergy core; KB = a DERIVED projection over the log (rule #2); every retrieval PERSISTED for replay (rule
#7); research fed in as `wrapUntrusted` DATA (rule #5); no energy debit (rule #8). MVP = the first 3 slices:
1. **`ResearchNote` projection** — pure fold over `tool_call.finished` (+ candidate `evidenceRefs`) →
   `{claim, source, url, embedding}` notes + lineage edges. Pure, replay-safe, no new infra.
2. **pgvector migration** — enable the extension, migrate the `jsonb` vectors → a `vector` column + HNSW index,
   repoint `selection/novelty/cosine.ts`. **Double win — upgrades novelty too ("one muscle").**
3. **In-run retrieval seam** — agents kNN-query the KB at generation time, the set is persisted per-call (rule
   #7) + threaded as `wrapUntrusted` DATA into the `population_generator` request (rule #5); the FB.4
   `generationBias` diverge/converge dial picks near-vs-far.
Then: heritable bibliography (via open `ReproductionEvent.mutationSummary`) → graveyard (index culled lineages'
research w/ low fitness — attacks the gen0-0 inbreeding) → GPS-migration viz (UMAP→2D, the best demo visual) →
cross-run brain (LAST, the hard replay version-pin) → Neo4j analytics (optional). The KB's value is idea
QUALITY / diversity / efficiency / demo — NOT the climb (which is ceiling-bound).

## 5. Safety carry-forward

- Judge `final-judge-mvp-3` is a **rule-#6 anchor** — any further judge-scale recalibration needs Michael's
  explicit sign-off. The mvp-2→mvp-3 bump this session WAS signed off.
- The `[high]` resolve→connect **TOCTOU residual in `createSafeHttpGet`** — closed as part of the fetch_url fix
  above; must be closed before any hosted deploy.
- Wave 1's `9953097` (judge mvp-2) was already a rule-#6 change on this branch (now superseded by mvp-3).

## 6. Live experiment harness (reuse for any re-run)

- `.env` at the cody root has `DOPPL_GATEWAY=live` + the OpenRouter key + raised caps (pop20/gen8). DB:
  `postgres://doppl:REPLACE_ME@localhost:5432/doppl` (the password is literally `REPLACE_ME`); Docker `doppl-pg`.
  Query the log via `docker exec doppl-pg psql -U doppl -d doppl`.
- Server: `DOPPL_MUTATION_STRATEGY=<fusion_only|mutate_lens|adaptive> DOPPL_ELITE_COUNT=<n>
  DOPPL_HALL_OF_FAME_CARRY=<n> pnpm -C apps/api start` (strategy is per-BOOT; restart to switch). POST a run by
  copying a prior `run.configured` payload from the DB (pop6×5gen ER-patient-flow, `rngSeed` per run); the
  server refuses concurrent runs (409) → run seeds sequentially.
- A bake-off analyzer (per-gen best, advancementCount, judge distinct-acceptance spread, mutation/fusion counts)
  was written ad-hoc this session and deleted; the SQL it ran is simple (`run_events` folds keyed by
  `generation.started.index` / `candidate.created` / `fitness.scored` / `lineage.culled` / `agenome.fused`).

---

## RESUME PROMPT (paste into a fresh session)

```
Resume Doppl on the `experiment/mutagen-dynamics` worktree (/Users/dreddy/Documents/GauntletAI/Capstone,
off cody — verify `git branch --show-current`). NOTHING is pushed (origin only, push only on Michael's OK).
Collaborator "Michael" drives the calls. FIRST read docs/sessions/010-2026-06-26-*.md (this handoff) +
docs/planning/shared-knowledge-space.md.

STATUS: Wave 2 (comparative 0-10 judge, mvp-3, Michael-signed-off rule #6) + the RATCHET (hall-of-fame carry,
DOPPL_HALL_OF_FAME_CARRY, a7e850c) are DONE + live-validated, all green (870 unit + 195 integration + 212
contracts), nothing pushed. The evolution CLIMB is PAUSED and ceiling-bound (a hand-crafted excellent answer
scores the same ~0.74 the evolved runs reach; advancementCount = random noise) — 3 deferred paths in
evolution-climb-plan.md "CLIMB REFRAME", do NOT build more drive levers.

ACTIVE NEXT, in order:
(A) FIX THE 3 RESEARCH TOOLS (apps/api/src/boot/toolSeams.ts + model-gateway/tools/{registry,ssrf}.ts):
    1. x_search returns nothing — fix the OpenRouter X-search path (Context7/docs: the web-plugin X behavior /
       x_search_filter / right xAI model) so it returns real X posts.
    2. youtube_search returns model summaries not transcripts — make the agent pick a video → fetch its
       TRANSCRIPT → read it → in PARALLEL across videos (needs a real transcript fetch).
    3. fetch_url blocks article reads (redirect:'manual') — follow redirects SAFELY (re-run resolveHostIsPublic
       on EACH hop) AND close the [high] resolve→connect TOCTOU (connect to the validated IP with a Host header).
    TDD the deterministic parts (injected fetchFn/lookupAll); rule #3 (frozen ToolName allowlist), rule #6
    (tools only on the population_generator route), rule #7 (replay reads persisted tool results), rule #4
    (key env-only). The [high] TOCTOU must close before any hosted deploy.
(B) THEN the shared KNOWLEDGE SPACE (docs/planning/shared-knowledge-space.md, design LOCKED): MVP = slice 1
    ResearchNote projection (pure fold over tool_call.finished → {claim,source,url,embedding} + lineage edges)
    → slice 2 pgvector migration (also upgrades novelty, "one muscle") → slice 3 in-run retrieval seam
    (persist each retrieval rule #7, thread as wrapUntrusted DATA rule #5, generationBias picks near-vs-far).
    KB = derived projection over the log (rule #2). Value = idea quality/diversity/efficiency/demo, NOT climb.

Mode: ultracode may be on (use Workflow for substantive tasks, be exhaustive). Commit per slice, full
/preflight, never push without Michael's OK. Michael authorized paid live experimentation ("spend until clear
view") — n>=3 replicates; n=1 is noise. The judge mvp-3 is a rule-#6 anchor (sign-off for any further change).
```
