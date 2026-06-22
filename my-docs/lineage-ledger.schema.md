# Lineage Ledger JSONL Contract

> **Cross-line note (2026-06-22):** This is the *kernel-side* (jungle) lineage memory. The
> flow/human-facing redesign lives in `my-docs/garden/` — start at `garden/SUMMARY.md`. The two
> overlap and must be reconciled at "lineage plumbing": the garden's node links `prev` / `root` and
> `cluster` are the same idea as this schema's `parent_candidate_ids` / `nearest_priors` /
> `convergence_cluster_id`; `delta_class` is parked in the garden but lives here; and this schema's
> `similarity` (0–1) is a *measurement* that maps into the garden's `−5…+5` novelty *rating*. Treat
> this file as jungle until that reconciliation happens.

The Lineage Ledger is the machine-readable memory of what the kernel tried, how
it mutated, what changed, and whether the change was real. It starts as
append-only JSONL and should later feed the durable knowledge-space boundary
captured in `tools/knowledge-space.ts`.

This contract does not choose the final storage engine. It defines the shape of
the facts that must survive storage changes.

## Scope model

Use one global append-only stream with scoped fields, not one ledger per run.
Runs need to query memory across the same problem, adjacent problems, and prior
domains.

Hierarchy:

```text
domain / corpus
  problem
    phase
      run
        generation
          candidate / mutation / delta
```

Required phase values:

- `research_discovery`: gather domain expertise, source receipts, analogies,
  examples, constraints, and factual substrate.
- `problem_discovery`: converge/diverge on the actual problem, hidden variable,
  frame, or crux.
- `solution_discovery`: explore, mutate, converge, and diverge on solution
  families after the problem frame exists.

Use `mode` to identify the local search posture inside a phase:
`divergent`, `convergent`, `synthesis`, `validation`, or `retrieval`.

## JSONL event shape

One line records one candidate-level lineage observation. The same candidate may
produce later events if judgment changes, but prior lines are never edited.

```json
{
  "schema_version": "lineage-ledger.v0",
  "event_id": "lle_2026_06_21_000001",
  "observed_at": "2026-06-21T00:00:00Z",
  "project_id": "doppl-kernel",
  "domain_id": "autonomy",
  "corpus_id": "fsd-case-studies",
  "problem_id": "fsd-ownership-unwind",
  "phase": "solution_discovery",
  "mode": "divergent",
  "run_id": "run_2026_06_21_001",
  "generation": 3,
  "artifact_kind": "solution_candidate",
  "candidate_id": "cand_abc123",
  "parent_candidate_ids": ["cand_parent_001"],
  "producer": {
    "agent_id": "fusant_breakout_01",
    "skill_ids": ["breakout"],
    "mutagen_ids": ["valence-flip"]
  },
  "summary": "Owned cars unwind before cars disappear because autonomy first breaks the financing and utilization assumptions.",
  "core_thesis": "Autonomy undermines owned-car economics before it eliminates personal vehicles.",
  "claimed_delta": {
    "type": "constraint",
    "text": "Moves the argument from car disappearance to financing/utilization collapse.",
    "compared_to_candidate_ids": ["cand_prior_017"]
  },
  "nearest_priors": [
    {
      "candidate_id": "cand_prior_017",
      "problem_id": "fsd-ownership-unwind",
      "phase": "problem_discovery",
      "similarity": 0.87,
      "relation": "same_cluster"
    }
  ],
  "delta_class": "enrichment",
  "convergence_cluster_id": "cluster_owned_car_unwind",
  "watch_triggers": ["OW-001"],
  "next_use": ["retrieve_for_solution_discovery", "feed_breakout"],
  "provenance": {
    "event_refs": ["run_events:run_2026_06_21_001:142"],
    "source_paths": ["case-studies/fsd-ownership-unwind/problem-statement.md"]
  }
}
```

## Field reference

- `schema_version`: contract version. Start with `lineage-ledger.v0`.
- `event_id`: globally unique append event ID.
- `observed_at`: ISO timestamp for when this lineage observation was recorded.
- `project_id`: project/system that emitted the event.
- `domain_id`: broad domain or market area.
- `corpus_id`: source corpus or fixture family when applicable.
- `problem_id`: stable problem identifier. Different runs of the same problem
  share this ID.
- `phase`: one of the required phase values above.
- `mode`: local search posture inside the phase.
- `run_id`: concrete run identifier.
- `generation`: generation number inside the run.
- `artifact_kind`: `research_claim`, `problem_frame`, `solution_candidate`,
  `synthesis_packet`, `critique`, or `watch_event`.
- `candidate_id`: stable ID for the artifact being classified.
- `parent_candidate_ids`: direct parents, if any.
- `producer`: agent/skill/mutagen metadata used to create the candidate.
- `summary`: compact candidate summary for retrieval.
- `core_thesis`: the invariant claim underneath wording changes.
- `claimed_delta`: what is actually new compared with parent or nearest prior.
- `nearest_priors`: closest known prior artifacts and why they matter.
- `delta_class`: `rehash`, `enrichment`, `convergence_signal`,
  `breakout_seed`, `dead_end`, or `unknown`.
- `convergence_cluster_id`: stable cluster ID when related candidates point to
  the same attractor.
- `watch_triggers`: `OPERATIONAL_WATCHLIST.md` IDs this event touches.
- `next_use`: retrieval hints for future skills/runs.
- `provenance`: pointers back to authoritative run events, sources, or files.

## Delta semantics

Every child must answer: "What changed besides wording?"

- `rehash`: same core thesis, same route, no meaningful new delta.
- `enrichment`: same cluster or thesis, but with a new mechanism, source,
  constraint, prediction, execution path, or synthesis.
- `convergence_signal`: independent lineages re-find the same thesis through
  different routes.
- `breakout_seed`: a deliberate escape from a dense cluster or exhausted route.
- `dead_end`: a tried path that produced negative evidence worth remembering.
- `unknown`: interim classification when evidence is incomplete.

## Skill retrieval uses

- `breakout`: retrieve high-density clusters, repeated rehashes, and dead ends
  so it can escape the actual attractor rather than a blank page.
- `blindside`: retrieve failure modes, rejected branches, and weak deltas.
- `breakthrough`: retrieve enriched clusters and unresolved cruxes.
- `first-principles`: retrieve repeated core theses and strip them to bedrock
  assumptions.
- `constraint-injection`: retrieve crowded regions and add a productive
  constraint that forces distance.
- `polymath`: retrieve analogous clusters across domains.

## Invariants

- Append-only: do not edit prior lines; append correction or reclassification
  events.
- Scoped retrieval: no skill receives the whole ledger by default.
- Phase-aware comparison: do not score research claims, problem frames, and
  solution candidates as peers unless a synthesis event explicitly connects
  them.
- Memory is advisory: high similarity blocks only no-delta rehash, not a revisit
  with a real delta.
- Replay-safe: persisted IDs, summaries, deltas, and nearest-prior decisions must
  be sufficient to explain why a future run used or avoided prior memory.
