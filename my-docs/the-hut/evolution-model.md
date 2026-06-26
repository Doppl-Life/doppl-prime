# Proposal — the reconciled evolution model (agenome · mutagen · trace · soil)

**Status:** GRADUATING to canon (2026-06-25). All questions closed. Frozen so far:
- **Vocabulary** — `agenome`, `mutagen`, the two pressures / tides, `soil`, the gardener are named in
  [`../GLOSSARY.md`](../GLOSSARY.md), reconciled with terms already there (`Stage`-as-breeding,
  `Convergence`-as-derived, `temporal`-replacing-`subtype`).
- **`src/contracts/run-trace.md`** — `OperatorId` → `Mutagen`; `Candidate` carries `mutagen` + `mutagen_lineage`
  (the record of which moves shaped a survivor).

Remaining canon steps (deliberate, not find-replace):
- **`run-trace.md` restructure** — `RunTrace` as the genuine multi-generation working memory, and
  `Dial`/`SelectionSchedule` (the old "set the direction" framing) → selection-as-emergent-tides. This is a
  spec redesign, not a rename.
- **`src/contracts/node.md`** — the survivor node carries its `mutagen_lineage` (and `temporal`), so "which
  mutagens produced this idea" is visible in the artifact.
- **kernel follows** — once canon settles, dalton's kernel catches up (agenomes carry mutagen-lineage; emit
  the rich trace). Why-record in [MEMORY.md](../MEMORY.md).

## The spine (the sentence to freeze)

> One `RunTrace` is one organism's full evolutionary working-memory toward a single node: a population of
> **agenomes** (ideas) that **strive and vary** (internal — mutagen-driven, compete-vs-differentiate)
> **against an environment that selects** (external — fitness + the energy economy), feeding on two soils —
> the permanent **garden** and the transient in-run history. **Convergence and divergence are the emergent
> tides of that tension — observed and named, never dialed.** The node is the survivor, planted back into
> the garden, carrying the record of the mutagens that shaped it.

When this freezes, `Candidate`, `Agenome`, `operator_id`, the energy ledger, and the generation loop
stop being separate things — they become *facets of one agenome's journey*.

## Settled decisions

1. **`agenome` = the evolving idea-organism** — content (claim, delta, growth) + the qualities that mark
   its survival (energy spent, lineage, mutations, fitness). One entity, accreting traits as it earns
   existence. (`agenome` the *noun* = this; the *process* = the kernel's evolution loop. Glossary: the
   noun wins; the loop is "the evolution," not "the agenome.")
2. **Rename `operator_id` → `mutagen`.** A mutagen is the source of an idea's variation under selection —
   exactly the role. Makes canon speak its own metaphor: agenome · mutagen · selection · fitness · garden.
3. **`RunTrace` is the run's working memory, not a write-once ledger.** Multi-generation: generations
   feed on prior generations within the run. It grows from single-pass into the full evolution record for
   one node-attempt. (Canon's "one trace = one node attempt" stays intact — the attempt is now a loop.)
4. **Two soils.** The **garden** (prior nodes + stock) is the permanent, cross-run fertile soil — already
   canon, already read via `RunInputs`. The **in-run history** is the transient cross-generation soil.
   So the trace does NOT carry permanent richness forever; the garden does. This kills the "fat trace is
   expensive forever" worry.
5. **Convergence/divergence is emergent, not a dial — it's two pressures in tension.**
   - **Internal:** each agenome strives to survive, and "best fit" pulls two ways at once — *compete* (chase
     the reward → converge with everyone else chasing it) or *differentiate* (find an empty niche → diverge
     to escape the crowd). Survival = being good AND being different.
   - **External:** the environment selects (fitness cull + energy scarcity); an overseer can also watch the
     population and push back — "all converging → push divergence", "all scattered → converge on something
     useful". Both the agenomes and the overseer read the state and pull the opposite way → the tension.
   - **No operator dial.** The operator tends the *balance* (mutagen potency, selection pressure, energy) and
     names the tides. Anti-collapse is intrinsic: a crowded agenome reaches for `breakout`/`blindside` to
     escape competition — the will-to-survive *is* the divergence engine when the soup collapses. `diverge`/
     `converge` are labels recorded in the trace, never controls that are set.
6. **The agenome carries its mutagen-lineage; it surfaces in the node.** Each time an agenome survives, append
   the mutagen(s) that shaped it to a list on the agenome (e.g. `mutagens: ['breakout','polymath']`). The
   witness into the process — *which mutagens actually produce survivors* — visible in the final node. Note the
   inversion: evolutionary metadata is now **off the skills** (mutagens are fixed tools) and **on the agenome**
   (the thing that lives). Metadata moved from the means to the survivor.
7. **Mutagens are fixed instruments, not evolving entities.** Skill-evolution is dead (no snake eating its
   tail). `lineage`/`generation`/`mutation` frontmatter is burned from all `SKILL.md` (both `.cursor/skills`
   copies); skills keep `name` + `description` + body. The agenome evolves; the mutagen is *how* it varies.

## Resolved: ONE-LEVEL (fan-out probe, 2026-06-25)

3-regime probe (one-level full-soil · one-level divergence-brake · two-level) on a shared problem.

- **Diversity:** soil 3/5 < brake 4/5 = two-level 4/5. **Two-level did not beat one-level-with-a-good-dial.**
- **Decisive (structural, not just n=1):** two-level's only real contribution was a child agent "grounded
  diverger" — i.e. *a diverge/converge dial setting wearing a persona costume.* The agent layer spends ~30%
  more work (its own estimate) to re-derive, as evolving personas, the control the **dial already gives at the
  idea level for free.** Pays off only at 4+ generations; demo runs are 1–2. → **one-level.**
- **Bigger finding — the converge/diverge *tension* is the load-bearing dynamic** (not a dial — see decision
  #5, refined past "dial" after this probe). Real tradeoff is **fusion vs diversity**: converge → ideas
  cross-pollinate → *fusion* (soil's best idea was a synthesis of two others); diverge → distinct ideas →
  *novelty* (the most-isolated run's winner was the weirdest). Teeth both ways.
- **Anti-collapse is intrinsic, not a scheduled brake.** Island-isolation is *wrong* — it kills fusion. The
  emergent model (decision #5) handles collapse for free: a crowded agenome reaches for `breakout`/`blindside`
  to survive, and an overseer pushes divergence on sight of monoculture. No bolt-on machine.

**Caveat:** n=1 per arm, one problem, self-graded — empirical signal weak; the two-level = tide-in-a-costume
conclusion is structural and holds regardless. The probe *retired the "dial"* for emergent tides (decision #5).
All open questions are now closed — the spine is ready to freeze to `src/contracts/` on your nod.

## Projections fall out (no canon growth)

- melissa's `subtype` ← projected from `mutagen` (`polymath → cross_domain_transfer`, `breakout →
  zeitgeist_synthesis`, else `other`). Her dashboard derives it; canon owns `mutagen`, not `subtype`.
- node ← the survivor agenome, rendered. dashboard ← the live trace. organism-view ← same trace. All
  projections of the one working-memory trace.
