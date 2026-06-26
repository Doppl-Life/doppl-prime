# Bugs and Mitigations

Kernel failure memory: mistakes we made or are likely to remake, plus the
mitigation that prevents the same failure from hiding twice.

Use this for confirmed or actionable failures. Use
[`OPERATIONAL_WATCHLIST.md`](./OPERATIONAL_WATCHLIST.md) for patterns that are
still only being watched.

## Entry format

### Short name - YYYY-MM-DD

- **Mistake:** what we optimized for or allowed by accident.
- **Symptom:** how it shows up.
- **Mitigation:** what the kernel must do differently.
- **Tripwire:** the cheap way to detect it.
- **Pass condition:** what proves the mitigation held.
- **Carry forward:** one line for the next build.

## Entries

### Live demo gated off by accident - 2026-06-26

- **Mistake:** after burning fixture mode, the dashboard's only run paths were live or replay, but the
  live provider auto-selected OpenRouter whenever an `OPENROUTER_API_KEY` was present in `.env` — which
  then required `DOPPL_ENABLE_LIVE_LLM` to be set, so START silently failed. (First as a 400 — the web
  `startDemoLive` sent no `liveModel`; then a 403 — the enable-gate — once `liveModel` was wired.)
- **Symptom:** clicking START on the dashboard returns `HTTP 400` then `HTTP 403 at /kernel/dashboard/runs`;
  "no run loaded"; nothing evolves. Twice, because the 400 fix exposed the 403 underneath.
- **Mitigation:** a **cascading live model client** (`createFallbackModelClient`). A live run tries the
  preferred provider and falls through on failure to a free local floor (`gemma4:e4b`), so it always has
  a working path — it never hard-fails to a 403. *Consent to spend* (a key **and** `DOPPL_ENABLE_LIVE_LLM`)
  controls only whether the hosted layer is in the cascade: the public dashboard hides the hosted key when
  consent is absent, so the run quietly falls to local instead of erroring or charging. `/kernel/runs` is
  authenticated, so it uses hosted whenever keyed. A required demo token is still a hard gate. The web
  `startDemoLive` sends `liveModel: true`.
- **Tripwire:** a dashboard run path that 403s instead of degrading; spending a key the operator never
  consented to; a provider choice that hard-fails when the preferred backend is down.
- **Pass condition:** `POST /kernel/dashboard/runs {liveModel:true}` with an empty env returns
  `200 runMode: live` on the local floor (verified). With a key but no enable flag it still returns 200 and
  **never sends the hosted key** (server test asserts this). The fallback order and exhaustion are unit-tested.
- **Carry forward:** resilience is a cascade, not a default. Gates withhold *spend*, not *function* —
  without consent, fall to the free floor; never 403 the user out of their own local tool. A key is not consent.
- **Also bit us (2026-06-26):** the `DOPPL_REQUIRE_LIVE_DEMO_TOKEN` gate kept 403'ing the local dashboard
  even after the enable-gate fix — it was pure friction for a local tool, so it's removed from the
  dashboard entirely (the dashboard is never gated out of function; `/kernel/runs` keeps `KERNEL_API_KEY`).
  Two things *masked* the fixes for two rounds: the browser served a **cached** JS bundle (same hash
  across rebuilds — needs a hard reload), and `pnpm kernel:serve` runs source so a **stale server process**
  served old gate logic. Diagnosis that finally worked: `curl localhost:3000` directly to read the real
  403 body, instead of trusting the screenshot. When a fix "doesn't take," verify the *running* server and
  the *served* bundle, not just the source.
- **Floor must be capable, not just small:** `gemma4:e4b` (4B dense) completes a run but produces no
  doppl — it hallucinates critic candidateIds, so parent selection finds nothing to fuse. The engine now
  drops verdicts that name a non-existent candidate (robustness), and the keyless default/floor is
  `qwen3.6:35b-a3b` (MoE-fast and capable enough to fuse). gemma is an opt-in speed knob, not the default.

### Report theater - 2026-06-21

- **Mistake:** treating artifact volume as visibility.
- **Symptom:** the run produces a long report or trace, but the human cannot see
  pass/fail, survivor changes, stable survivors, or failed checks quickly.
- **Mitigation:** proof-board output. `pnpm build` shows the verdict and
  decision-relevant deltas; optional traces under `out/**` are drill-down only.
- **Tripwire:** a build whose first useful output is a file path, a full report,
  or a trace blob.
- **Pass condition:** stdout is enough to know whether the run passed and what
  changed.
- **Carry forward:** visibility is a budget; rich data is fine, mandatory
  reading is not.

### Novelty theater - 2026-06-21

- **Mistake:** scoring "novel" as whatever sounds unusual to the model.
- **Symptom:** weird phrasing, speculative leaps, or source-free claims outrank
  ideas that are actually absent from the record.
- **Mitigation:** novelty must expose grounded components: source absence,
  substrate distance, hidden dependents, cluster coverage, or an explicit
  nearest-prior comparison.
- **Tripwire:** a high-novelty candidate whose novelty reason cites no sources,
  substrate, prior cluster, or absence-from-record signal.
- **Pass condition:** every selected candidate can explain why it is new without
  relying on "LLM judged it novel."
- **Carry forward:** novelty is a claim about the search space, not a writing
  style.

### Consensus grading - 2026-06-21

- **Mistake:** treating agreement as correctness.
- **Symptom:** convergent runs score high while unresolved tension is empty, or
  all selected ideas collapse into the same answer without saying what was lost.
- **Mitigation:** preserve dissent and cross-dial regret. A run should expose
  what the other dial would have kept and where selected branches still disagree.
- **Tripwire:** high score plus no unresolved crux, no rejected sibling worth
  inspecting, and no meaningful contrast between dials.
- **Pass condition:** the digest/report shows stable survivors, changed
  survivors, and the reason the alternate dial would choose differently.
- **Carry forward:** convergence must be earned belief movement, not room mood.

### Rehash as evolution - 2026-06-21

- **Mistake:** counting generation depth while children restate the same thesis.
- **Symptom:** descendants differ in wording but not mechanism, evidence,
  constraint, prediction, or synthesis.
- **Mitigation:** require `claimed_delta` and classify `delta_class` in the
  lineage ledger. Starve `rehash`; synthesize repeated independent attractors.
- **Tripwire:** high nearest-prior similarity plus weak or empty `claimed_delta`.
- **Pass condition:** a child is kept only if it is `enrichment`,
  `convergence_signal`, or `breakout_seed`; otherwise it is visibly culled.
- **Carry forward:** "what changed besides wording?" is a selection gate.

### Flat cascade - 2026-06-21

- **Mistake:** rewarding long lists of implications as depth.
- **Symptom:** an unlock answer names many industries but does not show
  substrate removed, branch structure, hidden dependents, or convergence.
- **Mitigation:** score breadth, depth, and synthesis separately. Group by
  substrate removed, then take fertile branches deep.
- **Tripwire:** many first-order effects, no because-chain, no branch map, no
  final synthesis.
- **Pass condition:** high-scoring cascade output contains a breadth map, depth
  chains, and a convergence statement.
- **Carry forward:** breadth is not depth; depth is not synthesis.

### Zeitgeist vibe laundering - 2026-06-21

- **Mistake:** calling a topical answer a timing-bound thesis.
- **Symptom:** "AI changes everything" style answers pass without dated signals,
  why-now, or a falsifiable miss.
- **Mitigation:** run the +/-5-year test. A zeitgeist candidate must name current
  signals, why timing matters now, and what would falsify it by a date.
- **Tripwire:** the answer would read the same five years earlier or later.
- **Pass condition:** missing dated signals or falsifiability caps or re-tags the
  candidate.
- **Carry forward:** zeitgeist is timing-first, not trend-first.

### Signal leakage - 2026-06-21

- **Mistake:** giving the generator evaluator-only targets.
- **Symptom:** a withheld prompt contains the hidden thesis, branch map,
  required signal, or prediction the evaluator expects.
- **Mitigation:** separate agent-visible context from evaluator-only targets.
  Leakage scans should cover prompt text, success criteria, current signals, and
  source notes.
- **Tripwire:** a generated answer "recovers" a target phrase already present in
  the visible packet.
- **Pass condition:** visible packets contain evidence and constraints, not the
  answer key.
- **Carry forward:** signals can be input; synthesis targets cannot.

### Contract drift - 2026-06-21

- **Mistake:** letting docs, generated artifacts, and code disagree about what
  exists or how to run the kernel.
- **Symptom:** docs point to deleted diagrams, stale language choices, missing
  commands, or generated outputs that are treated as durable truth.
- **Mitigation:** keep source contracts and README/run commands aligned. Generated
  output remains disposable unless promoted by decision.
- **Tripwire:** a README path does not resolve, a stated command fails, or a
  generated artifact becomes the only proof of a design claim.
- **Pass condition:** local read order, commands, and boundary contracts resolve
  on disk.
- **Carry forward:** the map must match the territory.

### Stale default surface after a kernel change - 2026-06-21

- **Mistake:** changing kernel behavior while the default human surface (the proof
  board, the node) still shows the previous slice's facts.
- **Symptom:** a human reads the board or a node after a major change and has to
  infer whether anything changed from small labels or hidden fields.
- **Mitigation:** the default surface must expose current RunTrace facts that name
  the active slice: schema version, generation count, computed fitness, bounded
  child expansion, decay, lens, and failed checks — with terms defined at the point
  of use.
- **Tripwire:** after a major kernel change, the board/node could be mistaken for
  the previous slice, or a reader sees changed fields but cannot say what to
  inspect first.
- **Pass condition:** the default surface makes the changed contract/behavior
  visible and interpretable.
- **Carry forward:** visibility has to change shape when the kernel changes shape.

### Hidden control edge - 2026-06-21

- **Mistake:** letting a control decision affect downstream generation without
  its own trace event.
- **Symptom:** generation 2 depends on the gen-1 parent selection, but an
  engineer reading `RunTrace.events` sees generate/fitness/final-select/lens and
  has to infer the parent-selection edge from `GenerationSummary`.
- **Mitigation:** architecture views must mark hidden control edges explicitly.
  If recursion becomes more than fixture-bounded proof mode, emit the parent
  selection as a first-class trace event.
- **Tripwire:** a downstream stage filters, expands, or prunes work based on a
  decision that is not present in `TraceEvent[]`.
- **Pass condition:** every decision that changes reachable candidates is either
  a `TraceEvent` or explicitly named as a non-event control edge in the
  engineer view.
- **Carry forward:** if it controls the next generation, it deserves a trace
  surface.

### Premature fork resolution - 2026-06-21

- **Mistake:** closing a fork because one path looks cleaner before the kernel
  has evidence.
- **Symptom:** a deliberate static artifact, assay branch, or corpus boundary
  disappears under "cleanup" without a memory entry.
- **Mitigation:** label forks explicitly and route the choice to `MEMORY.md`
  before deleting the alternate path.
- **Tripwire:** a deletion removes the only record of why a competing path
  existed.
- **Pass condition:** intentional forks are either labeled, promoted, or deleted
  with a recorded reason.
- **Carry forward:** simplify hard, but do not erase the evidence for choices
  future work will need.

### Human-signal Goodhart - 2026-06-21

- **Mistake:** optimizing the human −5…+5 rating as if approval were truth.
- **Symptom:** ideas become pleasing, cool, or socially agreeable while losing
  falsifiability and mechanism clarity.
- **Mitigation:** keep the human slider advisory; the held-out judge stays the
  immutable anchor. Correlate human scores against the judge before changing
  selection policy.
- **Tripwire:** the human rating starts driving selection alone.
- **Pass condition:** human scores remain labeled evidence, not the whole objective.
- **Carry forward:** human judgment is bedrock input, not a replacement for
  bedrock.

### Static artifact drift - 2026-06-21

- **Mistake:** letting a hand-authored artifact look canonical.
- **Symptom:** a static page or node disagrees with the `RunTrace` but does not say
  which one owns truth.
- **Mitigation:** label static artifacts; a rendered node advertises that it is a
  projection of the trace, not the trace.
- **Tripwire:** a static page or node claims trace truth it does not derive.
- **Pass condition:** static artifacts are visibly static and never bypass the
  canonical nav.
- **Carry forward:** static is allowed; silent static is not.
