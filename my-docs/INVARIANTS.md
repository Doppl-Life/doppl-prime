# Kernel Invariants

These are the rules that must survive implementation changes. They are not a
plan, a vibe, or a transcript of how we got here. If a change violates one of
these, it changes the kernel contract.

## Core engine

1. **One kernel, multiple modes.** The core operation is generate under
   selection. Discovery, problem recovery, and solution search are modes of that
   operation, not separate engines.
2. **The unit must be pluggable.** The thing being bred can be a thesis,
   consequence, problem frame, or later an agenome. Do not bake one reproduction
   unit into the kernel.
3. **Direction is explicit.** Divergent and convergent runs differ by schedule,
   selection pressure, and generation posture. Do not hide direction inside a
   prompt.
4. **Same pool before different selection.** A same-seed diverge/converge proof
   must select from the same candidate pool unless the test is explicitly about
   generation differences.
5. **Recursion is earned.** Do not add deeper generations until a depth-1 run
   produces judgeable output and exposes what should be bred next.

## Fitness

6. **Keep novelty and grounding visible.** Do not collapse them into an opaque
   scalar before selection has made the tradeoff inspectable.
7. **Novelty cannot be pure model self-grading.** Prefer absence-from-record,
   source coverage, substrate distance, hidden dependents, or cluster coverage
   over "the model says this is novel."
8. **Grounding must point outside the prose.** Claims need evidence, checks,
   dated predictions, held-out cases, or human judgment. Eloquence is not
   grounding.
9. **Decay belongs in the engine.** Timing-bound ideas lose fitness as their
   window closes. Feasibility is a lens on top, not the same thing as decay.
10. **Mechanism cost is a fitness component, not an aesthetic.** New
    dependencies, glue, abstractions, and human workflow burden are costs unless
    they buy evidence, correctness, safety, or speed.

## Memory and lineage

11. **Every child must state its delta.** The kernel must be able to answer:
    what changed besides wording?
12. **Append, do not overwrite.** Lineage observations, reclassifications, and
    run outcomes append to memory. Prior facts are not silently edited.
13. **Memory is advisory, not a fence.** High similarity blocks only no-delta
    rehash. A prior idea may be revisited if the new run changes mechanism,
    evidence, context, constraint, prediction, or synthesis.
14. **Phase matters.** Research claims, problem frames, solution candidates, and
    synthesis packets are not peers unless a run explicitly connects them.
15. **Convergence is evidence, not automatically success.** Independent branches
    finding the same attractor should trigger synthesis, not another paraphrase
    and not immediate pruning.

## Garden I/O

16. **Nodes in, nodes out.** Product input is a MarkScript node from the configured
    agarden. Product output is one or more surviving MarkScript nodes written back
    to the configured agarden.
17. **The agarden is required configuration.** The default local vault is
    `../agarden`, but the path is configurable. Product commands fail loudly when
    the configured vault is missing.
18. **Stock is read before research and written after survival.** Discovery reads
    existing agarden stock before reaching outward. New stock is admitted only when
    it supports surviving output nodes.
19. **Agenomes are inner runtime, not outer nodes.** Candidates under selection are
    agenomes. They become nodes only after they survive and compile to a garden
    artifact.
20. **No product fixture path.** JSON fixtures may exist for tests, but product
    defaults do not treat fixtures as source material.

## Proof and artifacts

21. **Trace first, views separate.** The kernel emits machine-clean process
    facts. Human-readable views (nodes, the proof board) translate those facts
    outside the engine; they never become the trace.
22. **Local output is not product output.** `out/**` is temporary inspection state
    when present. Durable product output is agarden flow and stock.
23. **A report must change a decision.** If an artifact cannot help a human make
    a decision quickly, cut it, demote it, or make it drill-down only.
24. **Every boundary has a contract.** Module boundaries should name inputs,
    outputs, owner, consumer, and the goal check that proves the boundary worked.
25. **Every proof has a tripwire.** A claim about the kernel should have a cheap
    way to fail: command, fixture, comparison, held-out case, or ledger query.

## Safety rails

26. **Finite by construction.** Generation depth, population, tool calls, wall
    time, and spend must have explicit caps.
27. **No secret-dependent design.** Secrets are never copied into docs, fixtures,
    traces, prompts, generated artifacts, or tests.
28. **No silent source-of-truth split.** If a fact is authoritative, say where it
    lives. If a file is a projection, trace, digest, or background note, say so.
29. **Distill, do not bulk import.** Historical source is raw material. Bring
    in only the mechanisms that make this kernel better, safer, or easier to
    judge.

## Nodes

30. **A node's slug is frozen at creation.** A SlugId (`{slug}-{shortId}`) is
    minted once from the node's name and never recomputed. Headlines may be
    reworded; the slug — and every inbound `[[wikilink]]` that points at it —
    must not move.
31. **A node is read-only except its human projection.** After creation the only
    fields ever overwritten are `scores.human` and `scores.n`, patched by the
    human-ratings projection job. Judge score, growth, discovery, lineage, and
    identity are immutable in place.
