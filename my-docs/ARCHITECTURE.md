# Architecture

Doppl is a garden-node engine.
It reads MarkScript nodes and stock from a configured agarden vault, runs an in-memory selection process, and writes surviving nodes plus admitted stock back to that same vault.

## Bedrock

The product loop is:

```text
agarden flow/stock -> kernel trace and agenomes -> agarden flow/stock
```

The kernel does not take loose JSON seed prompts as product input.
A seed is a `case_study` node with `prev_id: null`.
A reseeded case study is the same stage with `prev_id` pointing at the doppl that produced it.

## Durable State

Durable product state lives in the configured agarden vault:

- `flow/<slug>/<slug>.md` stores surviving nodes.
- `stock/<slug>.md` stores admitted stock.
- `ratings-ledger.json` stores human ratings.

The configured vault path is required.
The local default is `../agarden`, but the path is a configuration value, not a baked-in product assumption.
If the configured vault is missing, product commands should fail loudly.

## Runtime State

The inner run is transient.
It may keep an in-memory trace, run ledger, event stream, model calls, candidate pool, and agenome history while selection is happening.
Those are not outer nodes.

Agenomes are proto-node candidates under selective pressure.
They become garden nodes only when they survive and compile into a `problem_recovery`, `doppl`, or reseeded `case_study`.

## Stock

Stock is domain memory.
Discovery reads existing stock before reaching outward.
Discovery may produce new stock candidates during a run.
Only stock used by surviving output nodes is admitted to the agarden.
Product knowledge packets are selected from configured agarden `stock/*.md`.
JSON knowledge packets are a deterministic test harness input only.
If the configured vault has no `stock/` directory, product runs fail loudly.

## Views

The outer view reads agarden `flow/` and `stock/`.
It shows surviving nodes, their lineage, and the stock links that support them.

The inner view reads the live run trace.
It shows the agenome process: candidate generation, variation, selection, energy, fitness, and model activity for the selected run.

The transition from outer to inner is by run context: select a durable node, then inspect the run that produced it or continue growth from it.

## Test Harness

Deterministic fixtures are allowed only as test or demo harness material.
They are not product input, not canon, and not a substitute for agarden nodes.
They must live under an explicitly test-only path or carry an explicit test-only label.
Product runs do not fall back to fixture generation providers.
The kernel requires live, replay, or CLI model generation providers unless a test explicitly enables `allowTestFixtureProviders` or `DOPPL_ALLOW_TEST_FIXTURE_PROVIDERS=true`.
HTTP product routes accept test fixture seed paths only behind that same harness gate.
That same harness gate is the only path that allows JSON knowledge packets.

`out/` is not product output.
If a command writes local run inspection files, that path is temporary drill-down state.
The durable output of Doppl is agarden nodes and stock.
