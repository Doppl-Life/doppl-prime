# Rating Contract

How nodes are scored, so the judge's and the human's numbers mean the same thing.

This uses the same MarkScript idiom as `node.md`: explain the section, show the rendered shape where there is one, then state the TypeScript contract for what must be recoverable.

## Contract primitives

There are only two numeric scales in the system.

**Measurement** is an instrument reading, `0...1`. It is computed by a tool and carries no judgment. `0.7` is just `0.7`.

**Rating** is a judgment of worth, `-5...+5`. Negative does not mean "it does not work"; it means "even if it works, it is bad." `0` is neutral. Positive is real contribution.

`temporal` is a boolean. There is no third numeric scale.

The judge axis names are also primitive here because the measurement bridge and the rendered Evaluation section both build from them.

### Type contract

```ts
type Measurement = number; // 0...1; runtime validator enforces the range

type Rating = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;
type PositiveRating = 0 | 1 | 2 | 3 | 4 | 5;
type RatingLabel = '-5' | '-4' | '-3' | '-2' | '-1' | '0' | '+1' | '+2' | '+3' | '+4' | '+5';

type Temporal = boolean;

type JudgeAxis =
  | 'Novelty'
  | 'Grounding'
  | 'Falsifiability'
  | 'Cost-efficiency'
  | 'Relevance';

type BridgeableAxis = 'Novelty' | 'Grounding' | 'Falsifiability';
type JudgeOnlyAxis = 'Cost-efficiency' | 'Relevance';
```

## Measurement map

Measurements are not ratings. They map into ratings.

A `0...1` measurement detects presence, so it maps to the positive band only:

```ts
rating = round(measurement * 5); // 0 -> 0, 0.5 -> +3, 1 -> +5
```

A measurement cannot produce a negative rating. Negative ratings are judge-only: a judgment that
an idea is misleading or value-subtracting.

### Type contract

```ts
type MeasurementToRating = {
  input: Measurement;
  output: PositiveRating;
  formula: 'round(measurement * 5)';
};

type MeasurementName =
  | 'novelty'
  | 'grounding'
  | 'falsifiability';

type MeasurementBridge<A extends BridgeableAxis, M extends MeasurementName> = {
  axis: A;
  measurement: M;
  map: MeasurementToRating;
};
```

## Scored surface

A node is scored on its **Growth**: the live work of its stage. The whole document is not scored.
Discovery is not scored; it clears a signal bar elsewhere.

`problem_recovery` and `doppl` are scored separately, so a chain carries one judge result per
growth-stage node.

### Type contract

```ts
type GrowthStage = 'problem_recovery' | 'doppl';

type ScoredSurface<S extends GrowthStage> = {
  stage: S;
  section: 'Growth';
};

type UnscoredSurface =
  | 'Trace'
  | 'Discovery'
  | 'Path'
  | 'Case study';

type RatingScope<S extends GrowthStage> = {
  scored: ScoredSurface<S>;
  unscored: UnscoredSurface[];
};
```

## Judge axes

The judge scores five axes, each `-5...+5`, with full reasoning. The judge also emits `temporal`.

The deterministic bridge fills Novelty, Grounding, and Falsifiability from measurements. Cost-efficiency and Relevance are judge-only and default to `0` under the bridge.


| axis            | reads                                 | deterministic bridge        |
| --------------- | ------------------------------------- | --------------------------- |
| Novelty         | reaches something not already covered | `round(novelty * 5)`        |
| Grounding       | lands on something true / testable    | `round(grounding * 5)`      |
| Falsifiability  | states what would make it wrong       | `round(falsifiability * 5)` |
| Cost-efficiency | value vs. all-in ownership cost       | judge-only                  |
| Relevance       | matters for the current actor / lens  | judge-only                  |


### Type contract

```ts
type DeterministicBridge =
  | MeasurementBridge<'Novelty', 'novelty'>
  | MeasurementBridge<'Grounding', 'grounding'>
  | MeasurementBridge<'Falsifiability', 'falsifiability'>;

type JudgeOnlyBridgeDefault<A extends JudgeOnlyAxis> = {
  axis: A;
  score: 0;
  source: 'deterministic_bridge_default';
};

type DeterministicJudgePass = {
  bridged: [
    MeasurementBridge<'Novelty', 'novelty'>,
    MeasurementBridge<'Grounding', 'grounding'>,
    MeasurementBridge<'Falsifiability', 'falsifiability'>,
  ];
  judgeOnlyDefaults: [
    JudgeOnlyBridgeDefault<'Cost-efficiency'>,
    JudgeOnlyBridgeDefault<'Relevance'>,
  ];
};

type AxisEvaluation<A extends JudgeAxis> = {
  axis: A;
  score: Rating;
  reasoning: string;
  bridge?: Extract<DeterministicBridge, { axis: A }>;
};
```

## Evaluation section

On a node, the judge result renders inside `### Evaluation`, one subsection per axis. The single
`scores.judge` in frontmatter is the boil-down of these axes.

Humans never fill this form. Humans get one slider.

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
type AxisHeading<A extends JudgeAxis> = `#### ${A} ${RatingLabel}`;

type RenderedAxisEvaluation<A extends JudgeAxis> = {
  heading: AxisHeading<A>;
  body: AxisEvaluation<A>;
};

type RenderedJudgeEvaluation = [
  novelty: RenderedAxisEvaluation<'Novelty'>,
  grounding: RenderedAxisEvaluation<'Grounding'>,
  falsifiability: RenderedAxisEvaluation<'Falsifiability'>,
  costEfficiency: RenderedAxisEvaluation<'Cost-efficiency'>,
  relevance: RenderedAxisEvaluation<'Relevance'>,
];

type EvaluationSection = {
  heading: '### Evaluation';
  axes: RenderedJudgeEvaluation;
};

type JudgeResult<S extends GrowthStage> = {
  surface: ScoredSurface<S>;
  evaluation: EvaluationSection;
  judge: Rating; // round(mean(axes)), clamped to -5...+5
  temporal: Temporal;
};
```

## Human rating

The human gives one number: a gut read of the whole node on the same `-5...+5` scale. Never five
axes. Asking a human to fill five axes will not happen in practice.

Human ratings append to a ledger. The node frontmatter stores only the projection.

### Rendered ledger row

```json
{ "node_id": "4d1e8f0a-2b3c-4d5e-8f90-1a2b3c4d5e6f", "rater_id": "mh", "score": 3, "ts": "2026-06-23T15:04:05.000Z" }
```

### Type contract

```ts
type Uuid = string;
type Iso8601 = string;

type HumanRatingRow = {
  node_id: Uuid;
  rater_id: string;
  score: Rating;
  ts: Iso8601;
};

type ScoresProjection = {
  judge: Rating;
  human: Rating | null;
  n: number;
};

type RatingDelta = {
  judgeMinusHuman: number; // computed at display, never stored
};
```

## Birth state

A compiled node is born judge-only. Human ratings arrive later.

### Markdown shape

```yaml
scores: { judge: 3, human: null, n: 0 }
```

### Type contract

```ts
type BirthScores<J extends Rating> = {
  judge: J;
  human: null;
  n: 0;
};
```

## Temporal policy

The judge sets `temporal`.

`true` means zeitgeist: a positive score fades toward `0` as its moment passes and floors there.
Decay never turns a positive into a negative. A negative score does not decay; poison stays poison.
Reinvigoration happens by rechecking the idea when circumstances re-validate it.

`false` means transfer: no decay.

The engine may hold the raw decay factor as a `0...1` measurement, but the rating-layer rule is
decay-to-zero for temporal positives only.

### Type contract

```ts
type TemporalPolicy =
  | {
      temporal: true;
      halfLifeDays: 180;
      appliesTo: 'positive_rating';
      direction: 'toward_zero';
      floor: 0;
      negativeDecay: false;
      reinvigoration: 'recheck';
    }
  | {
      temporal: false;
      decay: 'none';
    };
```

