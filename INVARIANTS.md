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

## Proof and artifacts

16. **Trace first, views separate.** The kernel emits machine-clean process
    facts. Human-readable views (nodes, the proof board) translate those facts
    outside the engine; they never become the trace.
17. **Generated output is disposable.** `out/**` is inspection output. Promote a
    run only when it becomes evidence for a decision or regression.
18. **A report must change a decision.** If an artifact cannot help a human make
    a decision quickly, cut it, demote it, or make it drill-down only.
19. **Every boundary has a contract.** Module boundaries should name inputs,
    outputs, owner, consumer, and the goal check that proves the boundary worked.
20. **Every proof has a tripwire.** A claim about the kernel should have a cheap
    way to fail: command, fixture, comparison, held-out case, or ledger query.

## Safety rails

21. **Finite by construction.** Generation depth, population, tool calls, wall
    time, and spend must have explicit caps.
22. **No secret-dependent design.** Secrets are never copied into docs, fixtures,
    traces, prompts, generated artifacts, or tests.
23. **No silent source-of-truth split.** If a fact is authoritative, say where it
    lives. If a file is a projection, trace, digest, or background note, say so.
24. **Distill, do not bulk import.** Historical source is raw material. Bring
    in only the mechanisms that make this kernel better, safer, or easier to
    judge.
