# Proposal — Kernel reconciliation & demo plan

The work to bring four branches into one kernel, stand up the Agora, and reach a demo. Tickets here
port into **GitHub Projects** on `Doppl-Life/doppl-prime` (the chosen ticket home). This file is the
shaping space; the project board is where the tickets live and move.

## What reconciliation is

Reconciliation is **synthesis, not selection**. The goal is one kernel that carries the best idea from
each of the four branches and fills what any single branch is missing — kernel *and* views merged into
one working whole. The demo is *of that reconciled kernel*.

The **run-trace is the substrate that makes this one problem instead of six.** Every surface is a
projection of `buildRunTrace()`. So: reconcile the kernel → it emits one canonical trace shape → every
view (inside-the-kernel process views from cody/melissa/dalton; outside-the-run view from michael)
becomes a lens on that one trace. "How it all works together" falls out of getting the trace right.
Kernel synthesis is Epic A; view synthesis is Epic E; both reconcile against the single trace.

The bake-off is not an alternative to synthesis — it is how synthesis finds its material. The
stage-by-stage trace diff surfaces, concretely, the best idea per stage and the concept any branch is
missing. It also sizes the job: near-identical traces mean a day of merging; hard divergence is learned
early enough to scope. Throughout, michael's current kernel stays a known-good floor so the Monday demo
runs regardless of how far synthesis gets.

## Decisions taken

- **Reconciliation = trace bake-off**, not hand-merge. One frozen seed runs through every branch's
  kernel; run-traces diff stage-by-stage; winners chosen per stage with evidence.
- **Bake-off lands on `michael-reconciliation`** (new branch, created off `michael`). It is held
  *separate* from `michael` on purpose so all candidates stay comparable. Nothing merges into the
  standard `michael` branch from this work.
- **Tickets live in GitHub Projects** on `Doppl-Life/doppl-prime`.
- **Form factor is undecided** — it is a real decision ticket (H1), not pre-committed.

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
