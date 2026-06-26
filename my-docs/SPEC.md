# Build Spec - kernel target and scope

> Binds to `SPINE.md` (the why). Defines the *what* and the *scope fence*. If a
> build choice is not traceable to SPINE, it is out of scope.

---

## Scope fence (read first)

**Boil THIS ocean, not every ocean.** We are not building a full production
architecture. We are building **the kernel**: generate-under-selection with a
diverge/converge dial, running end-to-end on real ideas, wearing
discovery/ripple as its visible skin.

- **In scope:** the kernel loop, the two-axis fitness, the dial, one or two applications
  (discovery + ripple), enough I/O to run it on real seeds and judge the output.
- **Out of scope (for now):** production persistence, multi-user, auth, hosting,
  and the full critic-council/agenome machinery.
- **Posture:** code is cheap. Generate aggressively *within this fence*, run it, break
  it, find bottlenecks empirically. Divergent building, convergent scope.

---

## The artifact

**A small runnable program that demonstrates the kernel on real agarden nodes.**

Given configured **case_study nodes** from the agarden flow, it:
1. **Diverges** — generates children (ripples / candidate theses / candidate solutions).
2. **Converges** — computes the two-axis fitness (novelty × grounding), culls weak.
3. **Recurses** — expands selected survivors under hard caps.
4. **Decays / lenses** — applies engine decay during selection and feasibility after selection.
5. **Shows** — a compact board first; nodes (`src/contracts/node.md`) render the
   machine trace into portable, human-readable artifacts.

The proof it works: **the same harness runs multiple seeds and makes selection behavior
visible in one glance**: generated count, rejected count, Explore keeps, Proof keeps,
rank movement or swap, and failed checks. A no-swap row is allowed data, not automatic
failure; the tripwire is whether the kernel still exposes the selection consequence.

It does *not* need to be pretty, persistent, or complete. It needs to **run, produce
judgeable output, and reveal where the kernel strains.**

---

## The core abstractions

Keep these few and clean — they ARE the kernel:

| Abstraction | What it is | Notes |
|---|---|---|
| `Seed` | the starting condition | a thesis, a problem, or an existing idea node |
| `ReproductionUnit` | what reproduces | thesis \| consequence \| (later) agenome — pluggable |
| `generate(parent, dial)` | the divergent step | dial high = more/wilder children; produces candidates |
| `FitnessSource` | scores a candidate | returns **{novelty, grounding}** (two axes, not one) |
| `select(candidates, schedule)` | the convergent step | weights the two axes per the schedule; culls |
| `dial` / `schedule` | the diverge↔converge knob over generations | a weighting trajectory, not a constant |
| `decay(node, age)` | time axis | erodes fitness by `temporal` half-life (zeitgeist 180d; transfer no decay) |
| `Lens` | feasibility / fit, applied on top | pluggable; NOT part of fitness |
| `lineage` | the tree of who-bred-what | append-only; the demo's visible artifact |
| caps | finite-by-construction | max generations / population / depth / spend |

**The two non-negotiables from SPINE:**
1. Fitness is **two orthogonal axes** (novelty × grounding), weighted by the schedule —
   never collapsed to one number before selection.
2. **Decay is in the engine; feasibility is the lens.** Don't merge them.

---

## Discovery & scoring components

The engine's discovery and scoring concerns — what each is, and where it lives today:

- **Problem Recovery + temporal classify** — the convergent move + the
  ±5-year discriminator (zeitgeist vs. transfer). Reuse as the grounding/classify component.
- **Signed −5..+5 scoring + trap register** — feeds the grounding axis + the
  harm-detection.
- **Why-now decay + refresh** — the time axis.
- **Lenses** — the pluggable feasibility layer.
- **Calibration + backtest** — predicted-vs-realized and
  was-it-right; the bedrock grading.
- **Source registry + recipes + fetch ladder** — the harvest/access layer, if the
  artifact needs live seeds (optional for the kernel demo; can run on fixtures).
- **Ripple** — the divergent consequence-generator; the kernel's first real
  `generate()` with the dial set to diverge.

The implementation expresses these as `generate / select / decay / lens` with
the dial explicit.

---

## Settled (decisions locked by the synthesis)

- One kernel; three applications are dial settings. (SPINE)
- Two-axis fitness (novelty × grounding); weighting schedule = the application. (SPINE)
- Decay = engine time axis; feasibility = pluggable lens. (SPINE)
- Discovery is the same engine pinned to diverge; not a separate service. (SPINE)
- Ripple = divergent pass over AI-unlock seeds into named non-AI substrates. (SPINE)
- Runtime language: TypeScript. Keep it small and fast to break; product
  integration is out of scope until requested.
- Scope: the kernel, not product architecture wholesale. (this doc)

## Open questions (decide by building, not arguing)

- **Schedule representation.** Is the diverge→converge schedule a simple per-generation
  weight curve, a bandit, or operator-set? *Start: simple curve; learn from runs.*
- **How recursive for the demo?** Depth-1 (seed → ripples) vs depth-N (ripples of
  ripples)? *Current: bounded generation proof mode with maxGenerations=2,
  maxChildrenPerParent=2, maxPopulation=12.*
- **Novelty metric.** Embedding-cosine vs cluster-coverage vs
  LLM-judged distinctness? *Current: deterministic text/source signals; replace only
  when a richer scorer has a named consumer and clearer failure detection.*
- **What's the seed source for the demo?** Configured agarden nodes vs live harvest?
  *Current: configured agarden flow nodes; deterministic fixtures are test-only.*
- **Where does Doppl-the-agent-breeder fit?** Same kernel, `ReproductionUnit=agenome` —
  but do we build that now or just leave the seam? *Lean: leave the seam, build
  thesis/consequence reproduction first.*
- **Implementation split.** How many parallel workstreams, on what boundaries? (kernel
  core / fitness / applications / harness) — *decide when the build needs it.*

---

## Implementation boundaries

Use these clean seams when splitting implementation work:

1. **Kernel core** — `generate / select / dial / lineage / caps`.
2. **Fitness** — the two-axis `FitnessSource` (novelty + grounding), scored in
   `src/kernel/engine/scoring.ts`.
3. **Applications** — discovery (diverge) + ripple (diverge-on-consequences), as kernel
   configs.
4. **Harness + demo** — run on real seeds, render lineage + survivors, the judgeable output.

Each boundary builds against this spec; integration point is the kernel's
`generate/select` contract. Run it, break it, report bottlenecks, iterate. The
first milestone is the **same-seed-diverge-vs-converge** demonstration: proof
the kernel is one thing.

---

## Definition of done

- The kernel runs end-to-end on at least one real seed.
- It produces a lineage tree + scored survivors a human can judge.
- The multi-seed proof board is one-glance useful and backed by `RunTrace`.
- The **same-seed diverge-vs-converge** contrast is demonstrable as replacement,
  rank movement, or explicit agreement.
- We've learned where it strains (bottlenecks, weak fitness, bad outputs) —
  documented, so the next build target is aimed.

Done is **"we ran it, it worked enough to judge, and we know what to fix"** — not
"production-ready."
