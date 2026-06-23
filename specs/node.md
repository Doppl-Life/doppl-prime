# Node Contract

A node is one step of an idea's journey, stored as a single markdown file: a candidate idea plus
its lineage and scores, rendered as a portable, human- and agent-readable artifact.

Compiled nodes are projections of the `RunTrace`; they are not a second source of truth.

The intent is to make markdown read like the authored artifact while each section carries a TypeScript-shaped pressure test.

## Contract idiom

Each section below has three layers:

- what the section means;
- the markdown shape the compiler should render;
- the TypeScript contract for the parsed shape.

The TypeScript is not trying to replace markdown. It names what must be recoverable from the
markdown after parsing.

```ts
type Uuid = string; // UUIDv4; durable link key
type NonEmptyArray<T> = [T, ...T[]];
type Rating = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;
type RatingLabel = '-5' | '-4' | '-3' | '-2' | '-1' | '0' | '+1' | '+2' | '+3' | '+4' | '+5';

type Stage = 'case_study' | 'problem_recovery' | 'doppl';

type BaseStage<S extends Stage, Next extends Stage | null> = {
  stage: S;
  next: Next;
};

type CaseStudyStage = BaseStage<'case_study', 'problem_recovery'>;
type ProblemRecoveryStage = BaseStage<'problem_recovery', 'doppl'>;
type DopplStage = BaseStage<'doppl', null>;

type StageContract = CaseStudyStage | ProblemRecoveryStage | DopplStage;
type GrowthStage = ProblemRecoveryStage['stage'] | DopplStage['stage'];
type NextOf<S extends Stage> = Extract<StageContract, { stage: S }>['next'];

type MarkdownFile<Frontmatter, Body> = {
  frontmatter: Frontmatter;
  body: Body;
};

type MarkdownSection<Heading extends string, Body> = {
  heading: Heading;
  body: Body;
};

type MarkdownSubsection<Heading extends string, Body> = MarkdownSection<Heading, Body>;
```

## File shape

The file has YAML frontmatter and a markdown body. Every body starts with a headline. The case
study stays minimal; growth-stage bodies add Trace, Discovery, Growth, and Path.

### Markdown shape

```markdown
---
id: ...
stage: problem_recovery
...
---

# Headline

## Trace

## Discovery

## Growth — <Name of Growth>

## Path
```

### Type contract

```ts
type BaseBody<Tail extends unknown[]> = [
  headline: HeadlineSection,
  ...tail: Tail,
];

type CaseStudyBody = BaseBody<[
  context: MarkdownSection<'## Context', string>,
  synopsis: MarkdownSection<'## Synopsis', string>,
]>;

type ProblemRecoveryBody = BaseBody<[
  trace: TraceSection<'problem_recovery'>,
  discovery: DiscoverySection,
  growth: GrowthSectionFor<'problem_recovery'>,
  path: PathSection<'problem_recovery'>,
]>;

type DopplBody = BaseBody<[
  trace: TraceSection<'doppl'>,
  discovery: DiscoverySection,
  growth: GrowthSectionFor<'doppl'>,
  path: PathSection<'doppl'>,
]>;

type CaseStudyFile = MarkdownFile<CaseStudyFrontmatter, CaseStudyBody>;

type ProblemRecoveryFile = MarkdownFile<ProblemRecoveryFrontmatter, ProblemRecoveryBody>;

type DopplFile = MarkdownFile<DopplFrontmatter, DopplBody>;

type NodeFile = CaseStudyFile | ProblemRecoveryFile | DopplFile;
```

## Stages

The spine is fixed:

```markdown
case_study → problem_recovery → doppl → (the human's action)
```

No `doppl` without a recovered problem. No problem without a case study. A problem may produce
more than one `doppl`; each is its own node.

### Type contract

```ts
type Stages = CaseStudyStage | ProblemRecoveryStage | DopplStage;
```

## Frontmatter

Frontmatter is the file's identity and routing layer. It is a discriminated union on `stage`.
`next` is pinned by stage, so the type enforces the spine.

The seed has no scores, no `temporal`, no `prev`, and no `doppelgangers`: it is a start, not a
claim. Growth-stage nodes carry lineage, judge/human score projections, and dedup signal.

### Markdown shape

```markdown
---
id: 7c3a9b12-4f5e-4a01-9c2d-1e6b8a0f3d44
stage: case_study
name: "Battery / yuan resource constraint"
next: problem_recovery
---
```

```markdown
---
id: 4d1e8f0a-2b3c-4d5e-8f90-1a2b3c4d5e6f
stage: problem_recovery
root: 7c3a9b12-4f5e-4a01-9c2d-1e6b8a0f3d44
prev: [7c3a9b12-4f5e-4a01-9c2d-1e6b8a0f3d44]
kernel: melissa
temporal: false
next: doppl
scores: { judge: 3, human: null, n: 0 }
doppelgangers: 0
---
```

### Type contract

```ts
type KernelName = 'cody' | 'melissa' | 'michael' | 'dalton' | 'prime';

type Scores = {
  judge: Rating;
  human: Rating | null;
  n: number;
};

type BaseFrontmatter<S extends Stage> = {
  id: Uuid;
  stage: S;
  next: NextOf<S>;
};

type CaseStudyFrontmatter = BaseFrontmatter<'case_study'> & {
  name: string;
};

type BaseGrowthFrontmatter<S extends GrowthStage> = BaseFrontmatter<S> & {
  root: Uuid;
  prev: NonEmptyArray<Uuid>;
  kernel?: KernelName;
  temporal: boolean;
  scores: Scores;
  doppelgangers: number;
};

type ProblemRecoveryFrontmatter = BaseGrowthFrontmatter<'problem_recovery'>;
type DopplFrontmatter = BaseGrowthFrontmatter<'doppl'>;

type NodeFrontmatter =
  | CaseStudyFrontmatter
  | ProblemRecoveryFrontmatter
  | DopplFrontmatter;
```

## Headline

The headline is the one-line result of the node. On a growth-stage node, it becomes the synopsis
copied verbatim into downstream Trace. Names and headlines may change; links point at `id`.

### Markdown shape

```markdown
# Refined-supply access is the real battery constraint
```

### Type contract

```ts
type HeadlineHeading = `# ${string}`;

type HeadlineSection = MarkdownSection<HeadlineHeading, string>;
```

## Case study body

The case study is the seed. It has no Trace, no Discovery, no Growth, no Evaluation, and no Path
body section. It does not call discovery.

### Markdown shape

```markdown
# Battery / yuan resource constraint

## Context

The situation the chain grows from.

## Synopsis

The case in short. Downstream nodes copy this into Trace as "Case study · synopsis".
```

### Type contract

```ts
type CaseStudyBodyContract = CaseStudyBody;
```

## Trace

Trace accretes. It carries only prior stage synopses, copied verbatim, never reworded or merged.
Full thinking stays in the source node; only the synopsis travels.

### Markdown shape

```markdown
## Trace

### Case study · synopsis

Battery supply is read as a raw-materials scarcity story.
```

```markdown
## Trace

### Case study · synopsis

Battery supply is read as a raw-materials scarcity story.

### Problem recovery · synopsis

The real constraint is access to refined supply under yuan-locked offtake.
```

### Type contract

```ts
type TraceHeading<S extends Stage> =
  S extends 'case_study' ? '### Case study · synopsis' :
  S extends 'problem_recovery' ? '### Problem recovery · synopsis' :
  '### Doppl · synopsis';

type TraceEntry<S extends Stage> = MarkdownSubsection<TraceHeading<S>, {
  stage: S;
  synopsis: string;
}>;

type TraceSection<S extends GrowthStage> =
  S extends 'problem_recovery'
    ? MarkdownSection<'## Trace', [TraceEntry<'case_study'>]>
    : MarkdownSection<'## Trace', [TraceEntry<'case_study'>, TraceEntry<'problem_recovery'>]>;
```

## Discovery

Discovery is what was found, not what was concluded. It accretes across the chain and cites the
stock field it came from or wrote to. Discovery is not scored; Growth is scored.

### Markdown shape

```markdown
## Discovery

### Refining bottleneck

Refining capacity, not raw lithium, is the binding constraint. → field: battery-supply

### Offtake lock

Yuan-denominated offtake pulls supply off the spot market. → field: battery-supply
```

### Type contract

```ts
type FieldRef = {
  id?: Uuid;
  name: string;
};

type SourceRef = {
  id?: Uuid;
  label: string;
};

type DiscoveryEntry = MarkdownSubsection<`### ${string}`, {
  found: string;
  field: FieldRef;
  sources?: SourceRef[];
}>;

type DiscoverySection = MarkdownSection<'## Discovery', DiscoveryEntry[]>;
```

## Growth

Growth is the current stage at full fidelity: what the node concluded. It is the only body section
the judge rates. The content differs by stage; the wrapper stays the same idea.

### Markdown shape

```markdown
## Growth — Problem recovery

### Surface complaint

Battery supply is being read as raw material scarcity.

### Deleted assumption

Raw lithium scarcity is the binding constraint.

### Hidden variable

Refined-supply access is controlled by processing capacity and offtake.

### Actual problem

The allocator needs access to refined supply, not just exposure to extraction.

### Candidate response

Look for refining capacity, offtake control, and toll-processing leverage.

### Skin in the Game

- Talk to a battery procurement lead about what actually blocks delivery.
- Price a position that wins from refined spread widening.

### Sprouts

- Toll refining as the less crowded wedge.

### Evaluation

#### Novelty +3

Reframes off the consensus scarcity story.
```

```markdown
## Growth — Doppl

### Claim

Own the refining bottleneck, not the lithium.

### Implications

- loses substrate: miners priced on raw scarcity
- wins: refiners, offtake holders, toll processors

### Opportunities

- Back refining capacity.
- Hedge raw-miner exposure.

### Sprouts

- Toll refining as a separately investable pattern.

### Evaluation

#### Novelty +2

The refining/offtake unlock is a real reframe, though parts are visible.
```

### Type contract

```ts
type GrowthSectionFor<S extends GrowthStage> =
  S extends 'problem_recovery' ? ProblemRecoveryGrowthSection : DopplGrowthSection;

type ProblemRecoveryGrowthSection = MarkdownSection<
  '## Growth — Problem recovery',
  ProblemRecoveryGrowth
>;

type DopplGrowthSection = MarkdownSection<'## Growth — Doppl', DopplGrowth>;

type ProblemRecoveryGrowth = {
  surfaceComplaint: MarkdownSubsection<'### Surface complaint', string>;
  deletedAssumption: MarkdownSubsection<'### Deleted assumption', string>;
  hiddenVariable: MarkdownSubsection<'### Hidden variable', string>;
  actualProblem: MarkdownSubsection<'### Actual problem', string>;
  candidateResponse: MarkdownSubsection<'### Candidate response', string>;
  skinInTheGame: MarkdownSubsection<'### Skin in the Game', string[]>;
  sprouts?: MarkdownSubsection<'### Sprouts', string[]>;
  evaluation: EvaluationSection;
};

type DopplGrowth = {
  claim: MarkdownSubsection<'### Claim', string>;
  implications: MarkdownSubsection<'### Implications', string[]>;
  opportunities: MarkdownSubsection<'### Opportunities', string[]>;
  sprouts?: MarkdownSubsection<'### Sprouts', string[]>;
  evaluation: EvaluationSection;
};
```

## Evaluation

Evaluation is inside Growth because Growth is what gets scored. It holds the judge's ground truth:
one subsection per axis, each with a signed score and full reasoning. The frontmatter
`scores.judge` is the boil-down. Humans never see this per-axis form; they only append one slider
score to the ratings ledger.

### Markdown shape

```markdown
### Evaluation

#### Novelty +3

Reframes off the consensus scarcity story.

#### Grounding +2

Sourced; mechanism plausible.

#### Falsifiability +2

Falsifier named: if refined-supply spreads do not widen, the frame is wrong.

#### Cost-efficiency +1

Needs primary research to confirm the offtake lock.

#### Relevance +3

Actionable for the allocator lens.
```

### Type contract

```ts
type Axis = 'Novelty' | 'Grounding' | 'Falsifiability' | 'Cost-efficiency' | 'Relevance';
type AxisHeading = `#### ${Axis} ${RatingLabel}`;

type AxisEvaluation<A extends Axis> = MarkdownSubsection<AxisHeading, {
  axis: A;
  score: Rating;
  reasoning: string;
}>;

type EvaluationSection = MarkdownSection<'### Evaluation', [
  novelty: AxisEvaluation<'Novelty'>,
  grounding: AxisEvaluation<'Grounding'>,
  falsifiability: AxisEvaluation<'Falsifiability'>,
  costEfficiency: AxisEvaluation<'Cost-efficiency'>,
  relevance: AxisEvaluation<'Relevance'>,
]>;
```

## Path

Path names the next stage, or `null` at a doppl. It should match frontmatter `next`; the duplicate
is intentional because the reader should not need to inspect YAML to know where the flow points.

### Markdown shape

```markdown
## Path

next: problem_recovery
```

```markdown
## Path

next: doppl
```

```markdown
## Path

null
```

### Type contract

```ts
type PathSection<S extends GrowthStage> = MarkdownSection<'## Path', {
  next: NextOf<S>;
}>;
```

## Identity and signals

Every node has a stable UUIDv4 `id`; links point at the id, never the headline. `doppelgangers` is
the one fact dedup destroys, so it is stored. Convergence is a derived query over the node graph,
never stored.

### Type contract

```ts
type NodeSignals = {
  doppelgangers: number;
};
```

## Portable synopsis

Each stage authors its synopsis once. Downstream nodes copy it verbatim into Trace. Only the
synopsis travels; full thinking stays home.

### Type contract

```ts
type PortableSynopsis = string;

type VerbatimCopy<Source extends PortableSynopsis, Copy extends PortableSynopsis> =
  Source extends Copy ? Copy : never;
```
