# Session 009 — elitism shipped, climb diagnosed (fan-out), research-space design locked

**Date:** 2026-06-25 · **Branch:** `experiment/mutagen-dynamics` (off `cody`) · **NOTHING pushed.**

> **READ-FIRST on resume.** Two durable planning docs carry the executable detail; this is the chronological
> orient + resume prompt:
> - **`docs/planning/evolution-climb-plan.md`** — the CLIMB build plan (Wave 1/2). ← the active work.
> - **`docs/planning/shared-knowledge-space.md`** — the agenome hive-memory design (stigmergy + pgvector).
>   ← design LOCKED, build deferred until after the climb.

## What this session did (chronological)

1. **Culled nodes render RED** (`0036ac7`, web) — the user couldn't SEE culling; repointed `--status-culled`
   to a deep red + a vivid wash/outline, only lightly de-emphasized (was opacity-0.55 gray).
2. **Elitism** (`73f0697`, api) — carry the top-K scored survivors UNCHANGED into the next generation
   (`DOPPL_ELITE_COUNT`, default 1; successor-threading + champion ranking). Live-confirmed it WORKS (top seed
   carried all 5 gens, dominated each gen) but **re-rolls the candidate** → doesn't climb alone.
3. **server cap-drift fix** (`e94098e`, api) — a B1 regression: B1 raised `DEFAULT_CAPS` (toolCalls 64→600,
   wall 10→20min) but left `server.ts`'s standalone route ceiling stale at 200/10min, so boot-derived POSTs
   422'd themselves (7 integration tests were red). Production was unaffected. Single-sourced the 2 drifted
   fields from `DEFAULT_CAPS`.
4. **Live elitism bake-off (n=1 then n=3 de-noise)** — control (eliteCount 0) vs elitism (1), fusion_only,
   pop6×5gen, seeds 42/7/99. Verdict: **neither climbs**; elitism only shrinks+stabilizes the peak→final drop
   (−0.036 vs −0.049). Confirmed elitism necessary-but-not-sufficient.
5. **22-agent fan-out adversarial analysis** (`wf_cf51573d-3b1`) — investigate the judging substrate → design
   4 climb approaches → adversarially verify → synthesize. **All 4 scored 0/3 climb votes**; the win is the
   minimal MIX (ratchet + drive + gradient). Full plan → `evolution-climb-plan.md`. Corrected our hypotheses:
   the skipped checks are ~0 gradient; fixing novelty-as-scalar-fitness FIGHTS the climb.
6. **Research-tool findings** (verified from the live run): `x_search` 100% empty; `youtube_search` returns a
   text summary not videos/transcripts; `fetch_url` blocked by the SSRF guard (agents can't read articles);
   agents DO use web_search (candidates cite real URLs). → fixes deferred until after the climb.
7. **Wave 1 Step 1 STARTED** (`0f4141e`, api) — the pure `reigningChampion` ledger + the loop emitting
   `bestSoFar` (non-decreasing floor + measurement scaffold). 841 unit + 195 integration green.
8. **Research-space design discussion** (via `/drunk-claude`) → locked in `shared-knowledge-space.md`:
   stigmergy core philosophy; pgvector NOW (also fixes novelty), Neo4j LATER as a graph-analytics projection
   (it isn't even running today); all features green-lit (in-run read-during-gen retrieval, evergrowing
   cross-run brain, heritable bibliography, the graveyard, GPS-migration viz).

## Commit state (off `cody`, NOTHING pushed)
`0036ac7`(culled-red) · `e94098e`(server-fix) · `73f0697`(elitism) · `0f4141e`(Step-1 ledger+bestSoFar) ·
`893bc22`(shared-KB doc) · `<this>`(climb-plan doc + session 009). Plus the prior `9953097`(judge mvp-2) +
`1893898`(session 008) already on the branch. 841 api unit + 195 integration green; web 322 green.

## Key user direction captured (do NOT lose)
- **Decouple novelty from fitness** — fitness = per-gen quality (not tied to a converging elite); novelty =
  separate diverge/CULLING pressure. The right design for the novelty rework.
- **Sequence:** finish Wave 1 → Wave 2 (judge needs Michael's sign-off) → then the research/knowledge-space
  build. Research tools (x_search/youtube-transcripts/fetch_url) + shared-KB both AFTER the climb.
- **The judge change (Wave 2 / Step 4) is the rule-#6 anchor — needs Michael's EXPLICIT sign-off to land.**

## Safety carry-forward
- `[high]` TOCTOU/SSRF residual in `createSafeHttpGet` — documented MVP residual; ALSO actively starving
  research (fetch_url blocked). Close before hosted deploy; revisit with the research-tool fixes.
- Judge mvp-2 recalibration (`9953097`) is a rule-#6 anchor change on the branch — needs sign-off to land to
  cody (carried from session 008).

---

## RESUME PROMPT (paste into a fresh session)

```
Resume the Doppl evolution-CLIMB work on `experiment/mutagen-dynamics` (off cody;
/Users/dreddy/Documents/GauntletAI/Capstone — verify with `git branch --show-current`). NOTHING pushed.
Collaborator "Michael" drives evolutionary-design calls. Demo: Docker doppl-pg up; .env at cody root (caps
raised); `DOPPL_GATEWAY=live DOPPL_MUTATION_STRATEGY=<s> DOPPL_ELITE_COUNT=<n> DOPPL_SEED_FIXTURE=
pnpm -C apps/api start`.

FIRST read docs/planning/evolution-climb-plan.md (the active build plan) + docs/sessions/009-*.md (orient).
The goal is a REAL per-generation climb (each gen's best beats the last). No single lever climbs — build the
MIX: ratchet (Step 1) + drive (Step 3) + gradient (Steps 2+4). Honest metric = bestFreshThisGen slope +
advancementCount vs a random-restart control, NEVER the running-max line.

Do, in order (TDD the deterministic parts, /eval the LLM-output parts, full /preflight, commit per slice):
1. (Wave 1 Step 1 — FINISH) The champion ledger + bestSoFar floor is committed (0f4141e). Build the fuller
   CARRY: the champion CANDIDATE carried as a non-regenerating eligible parent (config hallOfFameCarry,
   default 0) so Step 3 breeds against a locked target. KERNEL SAFETY-INVARIANT SLICE — isolate it; pins in
   the plan (replay state-equivalence, maxPopulation clamp, no novelty-accumulator leak, no energy debit).
2. (Wave 1 Step 2) Critic calibration — activeCount:5 + anchored 0-5 critic prompts + fixed-key sub-axis
   scores (repair≤1, NOT hard-required) + re-record fixtures. Rule-#6-free.
3. (Wave 1 Step 3) Directed reproduction — judge weakest-axis → fuse "repair the weak axis", elite paired
   with a FIT partner (not most-distant). Reads judge OUTPUT (rule #6 untouched); FLAG for review.
4. Re-run the live bake-off (control vs the Wave-1 stack, n≥3) and confirm advancementCount>0 + a rising
   bestFreshThisGen slope. Use a MUTATING strategy (not fusion_only) for the diverge phase.
5. (Wave 2 Step 4) Judge top-end discrimination — the dominant 46%, RULE #6. Present Michael Option A
   (scale 0-5→0-10) vs Option B (true comparative judge) via AskUserQuestion; build only after his sign-off.
6. THEN the research engine: tool fixes (x_search/youtube-transcripts/fetch_url-SSRF) + the shared knowledge
   space (docs/planning/shared-knowledge-space.md — stigmergy + pgvector). Build deferred until the climb lands.

Mode: autonomous within Wave 1 (rule-#6-free); STOP for Michael's sign-off before Wave 2. Michael authorized
paid live experimentation ("spend until clear view") — run replicates (n≥3); n=1 is noise. Decouple novelty
from scalar fitness when you get to it (fitness = per-gen quality; novelty = diverge/cull pressure).
```
