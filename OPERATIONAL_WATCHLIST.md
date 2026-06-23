# Operational Watchlist

Watch process failures and process signals in kernel runs. This is not only a
bug list. Some observations mean the process is failing; some mean several
lineages have found the same attractor and need synthesis.

Use this file for human-readable doctrine: what to notice, why it matters, what
ledger evidence should reveal it, and how the next run should react.

## Relationship to other registers

- `OPERATIONAL_WATCHLIST.md`: watch patterns in the reproduction process.
- `BUGS_AND_MITIGATIONS.md`: confirmed or actionable mistakes with tripwires.
- `INVARIANTS.md`: rules a change must not violate without changing the kernel contract.
- `HEURISTICS.md`: portable moves and traps for generation, scoring, and review.
- `GLOSSARY.md`: local terms used by the kernel.

Do not import source registers wholesale. Distill them only when a kernel run
actually needs the concept.

## Entry format

### OW-000 Short name - YYYY-MM-DD

- **Watch for:** observable process shape.
- **Why it matters:** the hidden cost or signal.
- **Ledger evidence:** fields/events that should expose it.
- **Distinguish from:** nearby pattern that should not be treated the same way.
- **Response:** what the next run, skill, or human should do.
- **Escalate if:** when this becomes a bug/mitigation entry.
- **Carry forward:** one line for the next run or kernel owner.

## Watch items

> Evidence note: the garden replaces the separate lineage ledger with *the node graph as the
> memory* — a stored `doppelgangers` count plus a derived `convergence` query
> (`my-docs/garden/object-model.md`). The "ledger evidence" fields below describe the signal
> shapes to watch for; read them off the node graph, not a separate ledger schema.

### OW-001 Lineage rehash masquerading as evolution - 2026-06-21

- **Watch for:** generation depth increases, but children repeat the same core
  thesis with cosmetic wording changes.
- **Why it matters:** Doppl can burn energy and look evolutionary while walking
  in place. The opposite risk is also real: repeated discovery may be a genuine
  convergence signal, not junk.
- **Ledger evidence:** high nearest-prior similarity; same `core_thesis`; empty
  or weak `claimed_delta`; repeated `mutation_id` producing the same move;
  `delta_class: rehash` clustering inside one problem/phase.
- **Distinguish from:** `enrichment` adds a real mechanism, evidence source,
  domain transfer, constraint, prediction, execution path, or synthesis.
  `convergence_signal` appears when independent lineages re-find the same
  thesis through different routes.
- **Response:** force the child to answer: "What changed besides wording?"
  Starve no-delta rehash. If independent branches converge, create a synthesis
  packet instead of spawning another paraphrase. Feed the tried paths and
  attractor map into `breakout` before asking for escape moves.
- **Escalate if:** selection rewards rehash repeatedly or novelty scoring cannot
  separate paraphrase from delta.
- **Carry forward:** next-step an idea or synthesize its attractor; do not merely
  restate it.

### OW-002 Attractor without synthesis - 2026-06-21

- **Watch for:** separate runs, phases, or problems keep pointing to the same
  hidden pattern, but the system either suppresses it as duplicate or restarts
  another near-identical branch.
- **Why it matters:** repeated convergence is sometimes the signal. The value is
  not the Nth copy; it is the synthesis of why unrelated paths keep arriving
  there.
- **Ledger evidence:** same or linked `convergence_cluster_id` across distinct
  `run_id`, `phase`, `problem_id`, or parent-independent lineages; different
  `claimed_delta.type` values supporting one `core_thesis`.
- **Distinguish from:** OW-001 rehash, where the route and delta are also the
  same. An attractor earns synthesis only when different routes add evidence,
  mechanism, constraint, or falsifiable pressure.
- **Response:** emit a synthesis packet: common thesis, distinct routes, what
  each route adds, unresolved crux, and the next mutation to try.
- **Escalate if:** convergence clusters never produce synthesis artifacts.
- **Carry forward:** convergence is not the end of exploration; it is where the
  next, sharper question starts.

### OW-003 Memory cage - 2026-06-21

- **Watch for:** the ledger blocks a branch because "we tried that" even though
  the new candidate changes phase, context, evidence, or mechanism.
- **Why it matters:** memory should prevent dead paraphrase, not make Doppl
  afraid to revisit a live vein under better conditions.
- **Ledger evidence:** a high-similarity prior is used as a hard reject without
  checking `claimed_delta`; `delta_class` remains `unknown` or is coerced to
  `rehash` despite a new delta type.
- **Distinguish from:** real duplicate suppression. "Tried before" only blocks
  candidates with no meaningful delta.
- **Response:** allow revisits that bring a new delta. Classify them as
  `enrichment`, `breakout_seed`, or `convergence_signal`; require the candidate
  to name the difference explicitly.
- **Escalate if:** retrieval memory consistently reduces exploration diversity.
- **Carry forward:** the ledger is a map, not a fence.

### OW-004 Phase blur - 2026-06-21

- **Watch for:** research discovery, problem discovery, and solution discovery
  outputs get mixed together so the system cannot tell what kind of work a prior
  run performed.
- **Why it matters:** "we tried this" means different things depending on phase.
  A research claim, a problem frame, and a solution candidate should not compete
  as the same artifact.
- **Ledger evidence:** missing or inconsistent `phase`; solution candidates
  attached to research-discovery runs; problem-frame convergence scored as if it
  were final solution quality.
- **Distinguish from:** legitimate cross-phase reuse. Research can feed problem
  discovery, and problem frames can feed solution discovery, but the handoff must
  keep its artifact kind.
- **Response:** require `phase`, `mode`, and `artifact_kind` on lineage-ledger
  entries. Skills retrieve only the slices relevant to their current job, plus a
  compact cross-phase summary when useful.
- **Escalate if:** scoring or selection repeatedly compares artifacts from
  incompatible phases as peers.
- **Carry forward:** scope memory before judging novelty.
