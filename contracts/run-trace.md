# RunTrace Contract

`RunTrace` is the machine specimen for one spine-arrow pass. It records what the engine tried, measured, selected, lensed, judged, and handed to the compiler.

A node is a rendered projection of a `RunTrace`. The node's `## Trace` section is only the portable lineage excerpt copied from prior nodes; it is not this machine trace.

## External contracts

`RunTrace` coordinates contracts owned elsewhere. It does not redefine them.

- [@markscript.md](./markscript.md) owns the structural standard library: `SlugId` (the durable node/stock link key), `Iso8601`, and `NonEmptyArray`. `Uuid` is used only for run-internal machine handles — `run_id` and candidate ids — which are not node or stock artifacts and never become Obsidian links.
- [@node.md](./node.md) owns `Stage`, `GrowthStage`, and `KernelName`.
- [@rating.md](./rating.md) owns `Measurement`, `Rating`, `Decay`, and `JudgeResult`.
- [@stock.md](./stock.md) owns stock records and rendered stock field shape.

## Trace primitives

The trace owns the engine-only names that do not render directly into the node.

### Type contract

```ts
type Dial = 'diverge' | 'converge';
type MeasurementAxis = 'novelty' | 'grounding';
type OperatorId =
  | 'breakthrough'
  | 'addition-by-subtraction'
  | 'breakout'
  | 'blindside'
  | 'first-principles'
  | 'constraint-injection'
  | 'polymath';
```

## Run identity

One trace belongs to one attempted growth-stage node. Parentage lives in `RunInputs.parent_nodes`, not in identity.

### Type contract

```ts
type RunIdentity<S extends GrowthStage> = {
  run_id: Uuid;
  stage: S;
  kernel: KernelName;
  started_at: Iso8601;
  completed_at: Iso8601;
};
```

## Inputs

The engine reads the parent nodes, the portable prior synopses needed for the rendered node Trace, and any discovery context returned to the stage.

The trace stores ids and payloads needed to explain the run. It does not copy full prior node bodies.

`parent_nodes` is spine-ordered `SlugId`s: root first, immediate parent last. For current growth-stage traces it is non-empty. If a seed-ingest trace is ever defined, an empty list would mean the run has no parent.

### Type contract

```ts
type TraceSynopsis = {
  stage: Stage;
  node_id: SlugId;
  synopsis: string;
};

type RunDiscoveryInput = {
  field_id: SlugId;
  entries: {
    discovery_id?: SlugId;
    found: string;
    field: string;
  }[];
};

type RunInputs = {
  parent_nodes: SlugId[];
  trace_synopses: TraceSynopsis[];
  discovery: RunDiscoveryInput;
};
```

## Candidates

A candidate is a child the engine generated before selection. Every candidate names its reproduction unit, operator, and delta. No-delta candidates are rejected before measurement.

### Type contract

```ts
type ReproductionUnit =
  | 'problem-frame'
  | 'solution-candidate'
  | 'thesis'
  | 'consequence'
  | 'agenome';

type CandidateStatus = 'generated' | 'rejected_no_delta' | 'measured';

type Candidate = {
  candidate_id: Uuid;
  parent_candidate_id?: Uuid;
  generation: number;
  unit: ReproductionUnit;
  operator_id: OperatorId;
  headline: string;
  synopsis: string;
  claim: string;
  growth: string;
  delta: string;
  status: CandidateStatus;
};

type GenerateStep = {
  candidates: Candidate[];
};
```

## Measurements

Measurements are instrument readings, not ratings. The selector uses novelty and grounding as separate axes.

Decay is present as a stub only: `decay` is `0` and `decay_factor` is `1`.

### Type contract

```ts
type AxisMeasurement<A extends MeasurementAxis> = {
  axis: A;
  value: Measurement;
  reason: string;
};

type CandidateMeasurements = {
  candidate_id: Uuid;
  measurements: [
    novelty: AxisMeasurement<'novelty'>,
    grounding: AxisMeasurement<'grounding'>,
  ];
  decay: Decay;
  decay_factor: 1;
};

type FitnessStep = {
  measured: CandidateMeasurements[];
};
```

## Selection

Selection records the dial, schedule, retained candidates, compiled candidate, and the regret sibling check from the opposite dial.

The compiled candidate is the survivor handed to lens and then judge. The node compiler does not see the full candidate pool unless it needs audit context.

### Type contract

```ts
type SelectionSchedule = {
  dial: Dial;
  keep: 3;
  priority_axis: MeasurementAxis;
  floor_axis: MeasurementAxis;
  floor: Measurement;
};

type SelectionDecision = {
  candidate_id: Uuid;
  pareto_front: number;
  directional_score: Measurement;
  selected: boolean;
  reason: string;
};

type RegretSibling =
  | {
      status: 'stable';
      candidate_id: Uuid;
    }
  | {
      status: 'replaced';
      candidate_id: Uuid;
      replacement_candidate_id: Uuid;
      other_dial: Dial;
    }
  | {
      status: 'dropped';
      candidate_id: Uuid;
      other_dial: Dial;
    };

type SelectionStep = {
  schedule: SelectionSchedule;
  decisions: SelectionDecision[];
  retained_candidate_ids: NonEmptyArray<Uuid>;
  compiled_candidate_id: Uuid;
  regret_siblings: RegretSibling[];
};
```

## Lens

Lens stays separate from judge. It asks whether the compiled candidate is actionable for a specific actor or context.

Lens lives in the machine trace. It does not render into the node unless a future viewer chooses to show it.

### Type contract

```ts
type LensContext = {
  actor: string;
  constraints?: string[];
};

type LensResult = {
  context: LensContext;
  score: Measurement;
  threshold: 0.55;
  passed: boolean;
  reason: string;
};
```

## Judge

The judge rates the compiled candidate and emits the evaluation the compiler renders into `### Evaluation`.

`[rating.md](./rating.md)` owns the judge axes, axis reasoning, `scores.judge`, and `temporal`. `RunTrace` only attaches that judge result to the candidate that was judged. Human scores are not part of `RunTrace`.

### Type contract

```ts
type TraceJudgeStep<S extends GrowthStage> = {
  candidate_id: Uuid;
  result: JudgeResult<S>;
};
```

## Compiler boundary

The compiler receives only the compiled candidate plus the data needed to render a valid node. It may mint the node id and format markdown. It may not invent judge reasoning, human scores, prior synopses, or discovery findings.

The handoff is derived from `RunTrace`; it is not stored as a second copy inside `RunTrace`. The field-by-field map from this handoff to a compiled node lives in `[projection.md](./projection.md)`.

### Type contract

```ts
type CompilerHandoff<S extends GrowthStage> = {
  stage: S;
  parent_nodes: SlugId[];
  trace_synopses: TraceSynopsis[];
  discovery: RunDiscoveryInput;
  compiled_candidate: Candidate;
  judge: TraceJudgeStep<S>;
};

type CompileStep = {
  output: {
    node_id: SlugId;
    path?: string;
  };
};
```

## Full trace

The full trace is ordered by engine responsibility. It is the source of generation truth for the compiled node.

### Type contract

```ts
type RunTrace<S extends GrowthStage> = {
  identity: RunIdentity<S>;
  inputs: RunInputs;
  generate: GenerateStep;
  fitness: FitnessStep;
  selection: SelectionStep;
  lens: LensResult;
  judge: TraceJudgeStep<S>;
  compile: CompileStep;
};
```

