# Proposal — Kernel reconciliation & demo plan

The work to bring four branches into one kernel, stand up the Agora, and reach a demo. Tickets here
port into **Linear** (the chosen ticket home). This file is the shaping space; Linear is where the
tickets live and move.

## Build status — resume here

All work is on the `michael-reconciliation` worktree (`../doppl-prime-reconciliation`). Source of
truth: git history + this doc + the harness task list. Context is disposable. Package manager: pnpm.
Kernel green: `node --experimental-strip-types --test kernel/test/*.test.ts` → 118/118.

**Done & committed:** R0 (dalton base) · R1 (canonical `flow/<slug>/<slug>.md` vault + `slugId`,
SSOT) · R2 (clean case node vs `node.md`) · R3 (provider layer — one OpenAI-compatible client +
presets OpenRouter/Groq/OpenAI/LM Studio/Ollama + per-role routing + fusion) · R3.1 (CLI bridge
`--cli`, reads `doppl.config.json` tools; tolerant JSON extraction; stdin/stderr fix) · slug
stage-seeding fix · `--` separator fix · `.env.sample` · arch fix (`ModelCallRecord`→contracts,
broke the one upward dep). **Verified keyless end-to-end:** Ollama and grok CLI both write canonical
agarden nodes (no key, no paste). claude CLI works on the user's machine (not in-sandbox).

**Quality suite — one focused pass per window (context fresh each):**
1. ✅ `improve-codebase-architecture` — actioned the dependency fix; verdict: base solid.
2. ✅ `type-design-analyzer` — `RunEvent.payload` is now a discriminated union: the `RunEventPayloads`
   map in `contracts.ts` is the SSOT of per-type payload shapes (projecting `FitnessRecord`,
   `PairCompatibility`, `InheritanceWeights`, `Agenome` by indexed access so it can't drift), `RunEvent`
   is `{ [K in RunEventType]: base & { type: K; payload: RunEventPayloads[K] } }[RunEventType]`, and
   `EventRecorder.push<T>(type, payload: RunEventPayloads[T])` is checked per event type. `RunEvent.type`
   already off `| string`. All producers in `run-kernel`/`server` typecheck clean (fixed a real `status:
   unknown` leak; dropped dead `agenomeId`/`candidateId` push-options that `normalizeRunEvent` already
   derives from payload). This is **R4's first step, done**. 118/118 still green.
3. ✅ `deslop` — repointed `tsconfig.json` `include` → `kernel/src/**`, so `pnpm typecheck` now compiles
   the *real* kernel (it was compiling the dead root) and is **green** — fixed all 17 pre-existing strict
   errors it surfaced (node-compiler `run.fusion` guard ×3, run-kernel selected-parent closure narrowing
   ×2, scoring `frontier` optional-index + `proposalRating.scale` literal ×2, server `unknown` int-parse
   `typeof` guards ×2 + `readdir` Dirent overload via inference ×4); deduped the `.gitignore` env block
   (kept `!.env.sample`); **deleted dead root `/src` + `/tools`** (orphaned old michael kernel — nothing
   in `kernel/` imported them; 118/118 still green). Follow-ups: add `kernel/test/**` to `include` (its
   partial-payload legacy fixtures need boundary casts first); optional `vault-export` assay extraction.
3.5. ✅ **Type-safety guardrails (ESLint).** Flat config (`eslint.config.js`) on **`strictTypeChecked`**
   base, banning silent checker circumvention: `no-explicit-any`, `no-non-null-assertion`,
   `no-unnecessary-type-assertion`, `consistent-type-assertions` (no object-literal `as`), `ban-ts-comment`,
   the `no-unsafe-*` family, plus `switch-exhaustiveness-check` (every union switch handles all members —
   protects R4's `event.type` dispatch), `no-nested-ternary`, `no-unneeded-ternary`, `eqeqeq`,
   `consistent-type-imports`, and strict's `no-unnecessary-condition` + `prefer-nullish-coalescing`.
   `restrict-template-expressions` relaxed to allow number/boolean (idiomatic). tsconfig adds
   `noUncheckedIndexedAccess`. Cleared all hits honestly (~26 `!` → guards/`?.`/`??`, incl. a **latent
   crash** in `generation-providers` where `tertiary!` assumed 3 candidates but only 2 were guaranteed;
   nested-ternary verdict ladders → `verdictFor` helper + lookup; validators now check `unknown`/`Partial`
   before casting). `ModelPurpose` is honestly `string` (composed: `.repair`, `:fusion_draft`). One
   justified `eslint-disable` survives: the generic→union seam in `event-store.push`. **`pnpm build` now
   gates `typecheck → lint → test`.** Policy: escape hatches must be loud, rare, and justified — see
   `HEURISTICS.md`.
4. ✅ `thermo-nuclear` — deep structural audit. **Verdict: no blockers.** No file >1000L (passes #2/#3
   shrank the kernel; `server.ts` 807, `vault-export.ts` 855 are the two to watch). The recent passes
   *reduced* spaghetti (verdict/runMode ladders → helpers). Fixed the sharpest finding: `vault-export`
   candidate-score fns returned `Record<string,unknown>`, forcing `score as number` casts → typed
   `CandidateAssayScore`, **all `as number`/`as unknown` casts gone from the file**. Standing
   recommendations: ✅ **(a) DONE** — the comparison spine of `heldOutAssayJudge` + `sealedReferenceBenchmark`
   is now one `comparativeAssay(baseline, survivor, threshold, statements)` builder (SSOT; each judge
   supplies only its prose). `assayControl` stays separate by design (nullable `fitnessTotal`,
   `inconclusive`, threshold 3 — forcing it in would pollute the builder). Build green.
   ✅ **(b) DONE — `server.ts` split** (807L → 4 modules, leftward imports, no cycles, green first pass):
   `server-http.ts` (274: types, `KernelHttpError`, parse/auth/env helpers, dashboard pages) →
   `server-store.ts` (231: run reads + event/stream/health responses) → `server-runs.ts` (220:
   `runFromRequestBody`, async runs, dashboard-case runner) → `server.ts` (128: router + `createServer`).
   `pnpm build` green; only `handleKernelHttpRequest` (still in `server.ts`) is imported externally (the test).
   ✅ **R4 DONE — event adapter.** Key finding: melissa's client `RunEventEnvelope` (per her SSE
   `event-bridge.ts`) is `{ id, sequence, type, actor, occurredAt, runId, payload, schemaVersion }` + optional
   `candidateId`/`agenomeId`/`generationId`/`correlationId` — **nearly identical to dalton's `RunEvent`**,
   which `normalizeRunEvent` already fills. So the adapter is genuinely *thin*: `dashboard-envelope.ts` →
   `toDashboardEnvelope(event): DashboardEnvelope`, a pure/total projection guaranteeing the required fields
   and including correlation ids only when present. Wired into both SSE responses (`server-store.ts`); made
   `eventsAfter` generic to preserve `RunEvent`. The envelope keeps `payload` + adds top-level ids, so dalton's
   current `App.jsx` keeps working. 2 new tests, `pnpm build` green (120/120).

   **R4 is two layers — only layer 1 is done.** Diffing dalton's 26 `RUN_EVENT_TYPES` against melissa's
   `.strict()` `RunEventEnvelope` (`type: z.enum([18 names])`, `actor` enum identical to dalton, `runId`/`id`
   `.min(1)`, `schemaVersion` positive, `occurredAt` datetime — all of which `toDashboardEnvelope` satisfies):
   • **8 shared, flow cleanly:** `run.started/completed/failed/stopped`, `candidate.created`, `fitness.scored`,
   `generation.started/completed`.
   • **18 dalton-only → dropped** by the strict enum (energy/`materialized`/`control_baseline.*`/
   `critic.verdict_recorded`/`knowledge.*`/`model.*`/`pair.*`/`problem_recovery.created`). Silent-drop is fine.
   • **10 melissa-only her rich panels need but dalton never emits:** `agenome.spawned/mutated/reproduced/fused`,
   `critic.reviewed`, `energy.spent`, `lineage.culled`, `novelty.scored`, `run.configured`, `check.completed`.
   ✅ **Layer 1 (envelope reshape) done.** ▶ **Layer 2 (vocabulary mapping) is the remaining R4 substance**
   (build-status' "emit run.configured, mapped CriticReview, agenome lifecycle, shaped energy"): rename/reshape
   dalton events into melissa's names + payload contracts (`critic.verdict_recorded`→`critic.reviewed`,
   `agenome.energy_*`→`energy.spent`, `agenome.materialized`→spawn/reproduce lifecycle, `candidate.fused`→
   `agenome.fused`, emit `run.configured`). **Target spec = melissa's `packages/contracts/src/events/payloads/
   per-type-map.ts`** (maps each of her 18 types → its Zod payload schema; backed by `payloads/{agenome,energy,
   scoring,lifecycle,verification,failures}.ts`). Implement as a `mapEvent(RunEvent) → envelope[]` layer in
   front of `toDashboardEnvelope`, test reshaped payloads against those schemas. Then **R5** = lift melissa's
   ~40-file web app (App, charts, lineage,
   ~15 panels, reducer/store), feed from this SSE, add deps (Recharts, zod), skin with cody tokens —
   a dedicated frontend session.

**Then R4 (enrich events → thin adapter):** type payloads (from pass #2) → emit `run.configured`,
full candidate, mapped `CriticReview`, in-run agenome lifecycle, shaped fitness/energy → thin
envelope-reshape adapter validated vs melissa's strict Zod envelope → drop the 10 unmapped dalton
event types. Detail on the R4 task + the mapping in the Fusion spec. Then R5 (melissa dashboard +
cody skin), R6 (spike→kernel), R7 (demo floors).

**To resume in a fresh window:** read this section + `git log --oneline` + the task list, then continue
at the ▶ pass.

## What reconciliation is

Reconciliation is **synthesis, not selection**. The goal is one kernel that carries the best idea from
each of the four branches and fills what any single branch is missing — kernel *and* views merged into
one working whole. The demo is *of that reconciled kernel*.

The **run-trace is the substrate that makes this one problem instead of six.** Every surface is a
projection of `buildRunTrace()`. So: reconcile the kernel → it emits one canonical trace shape → every
view (inside-the-kernel process views from cody/melissa/dalton; outside-the-run view from michael)
becomes a lens on that one trace. "How it all works together" falls out of getting the trace right.
Kernel synthesis is Epic A; view synthesis is Epic E; both reconcile against the single trace.

The bake-off ran as an **architecture synthesis** from each branch's own design docs + code (not a
live trace diff — the branches are heterogeneous repos with no shared entrypoint). It revealed **two
paradigms**: michael's markdown idea-organism (vault, MarkScript contracts, run-trace, discovery→stock)
and the Capstone agent-evolution runtime (population of agenomes → critics → cull → fusion+mutation →
gen N+1 beats gen N), built three times as cody/melissa/dalton. They already share their spine —
event-log-as-truth + projections, a pinned/held-out judge, a provider-agnostic gateway, caps+kill
switch, local-first. **Dalton already fused both**: an evolution kernel that emits michael's markdown
vault + trace + replayable events, with a full test suite. So dalton is the running base; see the
**Fusion spec** below. The deep-dive maps are the synthesis material.

## Decisions taken

- **Base = dalton's `kernel/`.** It already fuses both paradigms (evolution loop + markdown vault +
  JSONL replay), runs end-to-end, has a full test suite, and runs deterministically with **no API key**.
- **Fusion lands on `michael-reconciliation`** (off `michael`), held separate from `michael`.
- **Contracts: michael's frozen MarkScript wins; dalton adapts to them.**
- **Infra: local-first, no Postgres** — keep dalton's in-memory + JSONL event store.
- **Agora: Obsidian read-only** for the demo (the agarden is already an Obsidian vault). The
  interactive rating UI is a post-demo nice-to-have.
- **Inner dashboard = melissa's web app** (live, tested) + **cody's design tokens/StatusBadge** skin;
  **cody's `organism-view`** on a baked fixture is the no-backend floor.
- **Outer view = the spike, wired to the real kernel** (so outer + inner narrate the same run).
- **Tickets live in Linear.**
- **Form factor is undecided** — a real decision ticket (H1).

## Fusion spec (deep-dive result)

Base is dalton. Everything below folds onto it.

**Branch verdicts** (from the parallel deep-dive):
- **dalton** — the running base. Evolution loop is real (not stubbed); in-memory + JSONL event store
  (no DB); `ModelClient.complete()` is a clean one-method provider boundary (OpenRouter only today);
  `node-compiler.ts` already emits the 3 stages with near-michael frontmatter; vault-export writes
  `<caseId>/<runId>/…proposal-nodes/` (must change to michael's layout); fixture mode needs no key.
- **michael** — canon. MarkScript contracts (node/stock/rating/run-trace), `sink.ts`
  (`flow/<slug>/<slug>.md` + `stock/<slug>.md`), `slugId()` (DJB2, deterministic), the spike provider
  matrix (demo / harness-bridge / Ollama / OpenAI-compatible incl. OpenRouter/Groq/LM Studio).
- **melissa** — the live inner dashboard (React Flow + Recharts, 7 surfaces, SSE→reducer, tested).
  Backend is Postgres (dropped); web app decoupled and fed from dalton.
- **cody** — the visual language: colorblind-safe design tokens + StatusBadge, and the `organism-view`
  standalone showpiece (fixtures only; engine has no runnable main).

**Work items (ranked by effort × risk):**
1. **Event adapter** dalton `RunEvent` (27 types) → melissa dashboard reducer (~20 types). *Hard;
   critical path to the best inner view. Floor if it slips: dalton's own dashboard / cody organism-view
   on a baked fixture.*
2. **Vault-layout swap** — replace dalton's export paths with michael's `sink.ts` + `slugId()` →
   `flow/`/`stock/` into `../agarden`. *Easy, high value (agarden compatibility).*
3. **Provider ports** — port the spike's Ollama / OpenAI-compatible / harness-bridge request shapes
   into dalton `ModelClient` impls; OpenRouter-fusion is one more impl later. *Medium, mechanical.*
4. **Spike → kernel wiring** — point the spike's "grow" at dalton's `POST /api/run` so outer + inner
   show the same run. *Medium; demo coherence.*
5. **RunTrace projection adapter** — project dalton's `KernelRun` to michael's contract `RunTrace`;
   full reconcile is post-demo. *Defer the rewrite.*

**Demo-safety floors (in order):** dalton fixture mode = offline golden run (no key) · cody
`organism-view` on a baked Die Hard fixture (no backend) · dalton's own React Flow dashboard.

**Post-demo (not needed for the 29th):** melissa's verifier/selection (rotating critic council,
held-out judge, 10 check-runners) folding into dalton's scoring; full RunTrace canon reconciliation;
the interactive Agora rating UI.

## What must reach `main`

The reconciliation exists to settle what becomes canon. Call these out explicitly as the bake-off
runs:

- **Contracts** (`contracts/**`) — the typed shapes that win: `markscript.md`, `node.md`, `stock.md`,
  `rating.md`, `human-ratings-ledger.md`, `run-trace.md`, `projection.md`.
- **Mechanics** (`mechanics/kernel/**`) — `compiler.md`, `discovery.md`, `sink.md`.
- **Kernel** (`src/**`) — only the reconciled engine, after canon settles. Canon wins; kernel follows.
- **Discovery semantics** — how retrieval becomes stock and is admitted to the agarden. This is the
  most contested concept and must be pinned in `mechanics/kernel/discovery.md` before it freezes.

## Three reframes (read before ticketing)

1. **Bake-off, not hand-merge.** The run-trace is the specimen (canon). Diff traces, pick winners per
   stage. Subjective argument becomes a diff review.
2. **Internal UI and external UI are one viewer, two lenses.** Every surface is a projection of
   `buildRunTrace()`. Internal = stage mechanics (cody/melissa/dalton's process views). External =
   idea-as-it-emerges (michael's experimental view). One trace stream, two lenses.
3. **Bake an offline golden run.** The spike already has an "Offline demo" provider. Freeze one seed →
   full agarden run into it so the live demo never depends on a key, rate limit, or wifi.

## Epics & tickets

Format: `[ID] Title — owner · depends on`.

### Epic A — Kernel reconciliation (bake-off → `michael-reconciliation`)

- **[A1] Freeze a reconciliation seed + harness** — Michael · none. Seed: `sealed-facility-staged-
  crisis-3f8a1d72` (Die Hard reframed). All four branches run it producing the same contract shapes
  (`node.md`, `stock.md`, primitives from `markscript.md`) into `../agarden`. They share the one
  `case_study` root and fan out into nested children — the visual fan-out *is* the comparison.
  **Guard:** slugs are title-derived (`compile-node.ts:46`), so two branches with the same child title
  overwrite the same file silently. Namespace each branch's children (git branch of agarden per kernel,
  or branch-tagged ids) so no candidate is lost. Also capture each run-trace as the rigorous specimen.
- **[A2] Run all four kernels on the seed** — Michael · A1. `cody`, `melissa`, `dalton`, `michael`,
  each into its own agarden namespace; traces captured per branch for the diff.
- **[A3] Stage-by-stage trace diff → best ideas + gaps** — team review · A2. Diff discovery/retrieval,
  generate, fitness/scoring, select, compile, sink. Per stage, name the best idea *and* what any branch
  is missing. Output: a synthesis table (stage → best idea(s) → source branch(es) → what's missing).
- **[A4] Synthesize the reconciled kernel on `michael-reconciliation`** — Michael · A3. Merge the best
  ideas per stage and fill the gaps into one kernel — not a copy of any single branch. Passes
  `pnpm typecheck && pnpm build && pnpm proof` and runs Die Hard end-to-end clean. Held separate from
  `michael`.
- **[A5] Name what freezes to canon/main** — team · A4. From the bake-off, list the contracts,
  mechanics, and kernel changes that must reach `main`. Map to the "What must reach `main`" section.

### Epic B — Kernel concepts (newest paths → discrete tickets)

- **[B1] MarkScript: contract vs kernel parity** — Michael · A4. Reconcile `src/io/*` against
  `contracts/markscript.md`. Canon wins.
- **[B2] Discovery: specialized retrieval → stock** — Michael · A4. Split: (a) retrieval/source-radar,
  (b) stock compilation, (c) admit-to-agarden. One seed run lands new stock in `agarden/stock/`.
- **[B3] Discovery acceptance criteria + scoring** — Michael · B2. The novelty × grounding gate for
  admitting stock. Documented in `mechanics/kernel/discovery.md`, enforced in code.
- **[B4] Provenance + reproducibility frontmatter** — Michael · A4 · *canon change*. Record per stage,
  in `run-trace.md` (and projected into `node.md` frontmatter): model id, version, temperature, and
  role (reasoning/fusion/judge). Pin the judge per run; pin generation (temp 0) during the bake-off.
  Payoffs: reproducible bake-off diffs, provenance ("generated by fusion-X, judged by grok"), and
  rate-by-who-ran-it analysis.

### Epic C — The Agora (agarden read + ledger write UI)

- **[C1] Agora read: render the flow from agarden** — Cody · none. Read `agarden/flow/**` + `stock/**`,
  render the spine `case_study → problem_recovery → doppl`.
- **[C2] Agora write: edit/append the ratings ledger** — Cody · C1. Human ratings → `agarden/
  ratings-ledger.json` per `contracts/human-ratings-ledger.md`.
- **[C3] Agora ↔ kernel handoff** — Cody · C1, B2. "Grow this" in Agora triggers a run.
- **[C4] Ledger write model: per-rater files → generated ledger** — Cody · C2 · *post-demo*. Each rater
  owns `ratings/<rater>.jsonl`; `ratings-ledger.json` becomes a derived projection compiled from them.
  Removes same-node textual merge conflicts entirely. Current single-file format is fine for Monday.

### Epic D — Run-ledger trigger (decision + build)

- **[D1] DECIDE: what brings up the run when something hits the Agora** — team · none. Options:
  (a) Hermes agent watching the ledger, (b) GitHub Action on commit to agarden, (c) local watcher.
  Recommendation: start with a local watcher for the demo, design toward the Hermes agent.
- **[D2] Build the chosen trigger** — TBD by D1 · D1, C2.

### Epic E — Trace viewer (merges internal + external UI)

- **[E1] One trace stream, two lenses** — Melissa · A4. Single viewer over `buildRunTrace()`; toggle
  internal/external lens on the same run.
- **[E2] Harvest the best internal UI from cody/melissa/dalton** — Melissa · E1. Same bake-off logic
  as the kernel: pick the strongest process-viz, fold into the one viewer.
- **[E3] Live progress (streaming) view** — Melissa · E1. Stages light up live during a run.

### Epic F — Experimental spike feature extraction

- **[F1] Inventory `experiment-spike/index.html` features** — Michael · none. Table of every
  capability (IndexedDB store, provider matrix, similarity search, clustering, graph chatbot,
  export/import, harness bridge) with keep/drop/port.
- **[F2] Port the "keep" features into the real app** — Michael · F1, H1.
- **[F3] Rework `experiment-spike/index.html` to run on our system** — Michael · F1, G1. Wire the spike
  to the real provider layer, contracts, and sink/export path instead of its standalone in-page logic.

### Epic G — Model routing / the fusion

- **[G1] Provider abstraction** — Dalton · none. One interface over OpenRouter (incl. fusion), local
  Ollama/LM Studio, and paid subscriptions (harness-bridge). Extract the spike's provider layer as the
  seed. Swap providers without touching the kernel.
- **[G2] Define "fusion" + expose it as a cognition target** — Dalton · G1. `cognition.reasoning:
  "fusion"` does not exist yet; it needs the provider layer to back an OpenRouter-fusion option.
  Ensemble vote? Best-of-N? Per-stage routing? Recommendation: per-stage routing first (cheap for
  scoring, strong for generation; the spike already isolates generation as the only model call).
- **[G3] Local + subscription paths verified end-to-end** — Dalton · G1. A full run completes on Ollama
  and on the harness-bridge with no paid API.
- **[G4] Cost guardrails: per-run budget cap + kill switch** — Dalton · G1. A run aborts when its
  spend crosses a configured cap; a manual kill switch stops an in-flight run. Matters once fusion runs
  deep graphs.

### Epic H — Form factor (decision + build)

- **[H1] DECIDE: PWA vs desktop (Tauri/Electron) vs web service** — team · F1. Tradeoffs: PWA =
  installable/offline, weak filesystem + local-model access. Desktop = real filesystem (agarden is a
  git repo) + local Ollama, heavier. Web service = easiest sharing, worst local story. **Open decision.**
- **[H2] Scaffold the chosen form factor** — TBD · H1.

### Epic I — CLI configs

- **[I1] Config matrix for every CLI we grant access to** — Dalton · none. Which CLIs (claude,
  opencode, cursor, codex, …), their config files, and what each may do in a run. Configs checked in.
- **[I2] Explore what else the CLIs unlock** — Dalton · I1. CLIs as harness-bridge provider, as
  discovery retrievers, as judges.

### Epic J — Demo readiness

- **[J1] Offline golden run** — Michael · A4. Freeze the Die Hard seed → full run into `../agarden` →
  bake the result into the Offline-demo provider. Demo runs with zero network.
- **[J2] Empty-state / onboarding** — Cody · C1. Cold-open tells the story without a manual.
- **[J3] Failure-mode hardening** — team · G1. Model timeout, rate limit, malformed JSON mid-run,
  ledger write conflict — each fails gracefully on screen.
- **[J4] Demo script + narrative** — Michael · J1. The 5-minute story; every beat maps to a working
  feature.
- **[J5] Key security** — team · F3. Keys move off checked-in configs and IndexedDB to an OS-keychain
  story for the chosen form factor. No secrets in the repo.

## Gaps — status

- **Ledger merge conflicts** → narrow (only same-node concurrent rating; textual, not semantic) and a
  non-issue for Monday. Permanent fix ticketed as **C4** (per-rater files → generated ledger).
- **Reproducibility / seed determinism** + **judge consistency** + **provenance** → one ticket, **B4**.
  Judge pinned to one model; generation pinned (temp 0) during the bake-off; model id/version/temp/role
  recorded per stage in frontmatter.
- **Cost guardrails** → ticketed as **G4** (per-run budget cap + kill switch).
- **Key security** → ticketed as **J5**.
- **Canonical agarden ownership** → resolved: agarden is the shared git remote; everyone pushes/pulls;
  the demo runs off a local clone. Not an open question.
- **Contract/MarkScript versioning** → *post-demo*. Add a version field + migration path when the
  schema churns. Low churn expected before Monday; not demo-critical.

## Cognition profiles

Two profiles selected via `doppl.config.json`:

- **Bake-off** — `reasoning` pinned + temp 0, judge pinned. The trace diff measures kernels, not model
  noise.
- **Demo** — `reasoning` = OpenRouter fusion (best output), judge still pinned (comparable scores).

## Branch hygiene

All new reconciliation work lives on **`michael-reconciliation`** (worktree:
`../doppl-prime-reconciliation`). The original branches — `michael`, `cody`, `melissa`, `dalton` —
stay clean and are *referenced*, never written. The agent makes reversible file changes; the human
owns every `git` op (stage/commit/reset/merge).

## Spike instruments to mine (the control surface)

`experiment-spike/index.html` is already a full outer-view **control panel for the kernel**, not just a
provider list. Mine the whole instrument set; expand the model-orchestration ones.

- **Model orchestration** — provider segment (Ollama·local / OpenAI-compatible / Harness-bridge /
  Offline) + Test connection + provider pill. **Expand into**: OpenRouter *fusion*, per-role routing
  (cheap-for-scoring / strong-for-generation, judge pinned), local LLM, and subscription wiring.
- **The dial** — diverge·novelty ◇ / converge·grounding ◆: the fitness dial as a control.
- **Campaign** — BFS/DFS traversal + dial schedule (auto/converge/diverge): the outer control surface
  for dalton's evolution loop (generations × population).
- **Analyze** — Similarity / Clusters / Doppelgängers: novelty + anti-collapse instruments.
- **Connect aGarden** (File System Access — read case studies, write nodes/stock back), **Insights**
  (graph-aware chat), **Inspector + inline rating**, **Export**, **run-trace console**, **proof board**.

The reconciled outer view = the spike wired to dalton's kernel, with the model-selection instruments
expanded. This is ticket **R6**.

## Build principles

Non-negotiable, in docs, architecture, code, and UX:

- **Radical simplicity first.** Delete before optimize; the simplest thing that is honest. Length and
  abstraction must earn themselves.
- **Single source of truth.** One home per fact (canon = `contracts/**` + `mechanics/**`); the trace /
  event log is the truth, every view a projection. No shadow copies.
- **SOLID + modular.** One responsibility per module; depend on interfaces (`Sink`, `ModelClient`,
  event adapter) not implementations; additive over invasive.
- **DRY.** One provider interface, one vault sink, one event schema — adapters at the seams, not
  forked logic.
- **Honesty & clarity.** Outer and inner views narrate the *same* run; no demo illusion. Names say
  what things are. Report what works and what doesn't, plainly.

## Build tickets (self-tasks, ordered)

Each is a clean, independently verifiable increment on `michael-reconciliation`. `[git]` = a git op
the human drives; the rest are agent file-work the human commits.

- **R0 — Foundation: dalton kernel as base** `[git]`. Bring dalton's `kernel/` onto
  `michael-reconciliation`. *Done:* `pnpm test` (dalton's suite) green; fixture run works, no key.
- **R1 — Vault layout → canon.** Replace dalton's export paths with michael's `Sink`
  (`flow/<slug>/<slug>.md` + `stock/<slug>.md`) + `slugId()`. SSOT: one module owns vault writes.
  *Done:* a fixture Die Hard run writes canonical nodes into `../agarden`; tests updated + green.
- **R2 — Node-compiler → MarkScript canon.** dalton's `node-compiler` emits michael's exact
  frontmatter + load-bearing headings (`contracts/node.md`). Canon wins. *Done:* output validates
  against the node contract.
- **R3 — Provider layer (mine + expand the spike).** One `ModelClient` boundary; port spike's Ollama /
  OpenAI-compatible / harness-bridge; add OpenRouter-fusion + per-role routing; judge pinned. DRY.
  *Done:* a full run completes on Ollama and on harness-bridge with no paid API; provider set by config.
- **R4 — Event adapter (dalton → dashboard).** Map dalton's 27 `RunEvent`s → the dashboard reducer
  envelope. Modular adapter; no dashboard logic forked. *(Hardest; critical path.)* *Done:* the
  dashboard renders a live dalton run.
- **R5 — Inner dashboard: melissa + cody skin.** Lift melissa's web app, feed from dalton SSE (R4),
  skin with cody's design tokens + StatusBadge. *Done:* live lineage/fitness/critic view of a real run.
- **R6 — Outer view: spike as control surface, wired to kernel.** Wire spike seed/dial/campaign/
  providers to dalton's `POST /api/run`; expand model instruments. *Done:* outer + inner narrate the
  same run.
- **R7 — Demo-safety floors.** Offline golden Die Hard run (dalton fixture); cody `organism-view` on a
  baked fixture; dalton's own dashboard. *Done:* each floor runs independently with no network.

Critical path to the best demo: R0 → R1 → R4 → R5, with R3/R6 in parallel and R7 baked early.
