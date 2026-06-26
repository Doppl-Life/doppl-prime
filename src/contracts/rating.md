# Rating Contract

How nodes are scored, so the judge's and the human's numbers mean the same thing.

This uses the same MarkScript idiom as `node.md`: explain the section, show the rendered shape where there is one, then state the TypeScript contract for what must be recoverable.

**Two raters, two shapes, one scale.** The *judge* fills the full rubric and boils it to one number; the *human* gives a single slider — never five axes. Both speak the same `−5…+5`, where negative is not "it doesn't work" but "even if it works, it's bad" (cut off your head to cure a headache: maximally effective, maximally wrong). Positive is real contribution, `0` is neutral, negative is value-subtracting.

## External contracts

This contract imports shapes owned elsewhere. It does not redefine them.

- [@markscript.md](./markscript.md) owns the structural standard library (`MarkdownSection`, `MarkdownSubsection`).
- [@node.md](./node.md) owns `Stage` and `GrowthStage`.
- [@human-ratings-ledger.md](./human-ratings-ledger.md) owns `HumanScoresProjection`.

`rating.md` owns the two numeric scales (`Measurement`, `Rating`), `OneDecimal`, and the judge evaluation.

## Contract primitives

There are only two numeric scales in the system.

**Measurement** is an instrument reading, `0...1`. It is computed by a tool and carries no judgment. `0.7` is just `0.7`.

**Rating** is a judgment of worth, `-5...+5`. Negative does not mean "it does not work"; it means "even if it works, it is bad." `0` is neutral. Positive is real contribution.

`temporal` is a boolean. Decay is configured to `0`, so there is no active time score yet.

The judge axis names are also primitive here because the measurement bridge and the rendered Evaluation section both build from them.

### Type contract

```ts
type Measurement = number; // 0...1; runtime validator enforces the range

type Rating = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;
type PositiveRating = 0 | 1 | 2 | 3 | 4 | 5;
type RatingLabel = '-5' | '-4' | '-3' | '-2' | '-1' | '0' | '+1' | '+2' | '+3' | '+4' | '+5';
type OneDecimal = number; // runtime validator enforces at most one decimal place

type Temporal = boolean;
type Decay = 0;

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

A measurement cannot produce a negative rating. Negative ratings are judge-only: a judgment that an idea is misleading or value-subtracting.

**Open — the full bridge.** Which `0…1` instrument informs which axis, and how, is not finished (similarity → novelty, signal strength → grounding, …); the engine bridges Novelty/Grounding/Falsifiability and defaults the judge-only axes to `0`. The scale itself is not new: the discovery/source layer (`tools/source-radar.ts`) already rates on this `−5…+5`. Only the core's instrument→axis map is still being settled.

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

`problem_recovery` and `doppl` are scored separately, so a chain carries one judge result per growth-stage node.

### Type contract

```ts
// GrowthStage is owned by node.md.
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
| Relevance       | matters for the current actor         | judge-only                  |


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

On a node, the judge result renders inside `### Evaluation`, one subsection per axis. The single `scores.judge` in frontmatter is the boil-down of these axes.

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

Actionable for the allocator context.
```

### Type contract

```ts
type AxisHeading<A extends JudgeAxis> = `#### ${A} ${RatingLabel}`;

type RenderedAxisEvaluation<A extends JudgeAxis> =
  MarkdownSubsection<AxisHeading<A>, AxisEvaluation<A>>;

type RenderedJudgeEvaluation = [
  novelty: RenderedAxisEvaluation<'Novelty'>,
  grounding: RenderedAxisEvaluation<'Grounding'>,
  falsifiability: RenderedAxisEvaluation<'Falsifiability'>,
  costEfficiency: RenderedAxisEvaluation<'Cost-efficiency'>,
  relevance: RenderedAxisEvaluation<'Relevance'>,
];

type EvaluationSection = MarkdownSection<'### Evaluation', RenderedJudgeEvaluation>;

type JudgeResult<S extends GrowthStage> = {
  surface: ScoredSurface<S>;
  evaluation: EvaluationSection;
  judge: Rating; // round(mean(axes)), clamped to -5...+5
  temporal: Temporal;
};
```

## Human rating

The human gives one number: a gut read of the whole node on the same `-5...+5` scale. Never five axes. Asking a human to fill five axes will not happen in practice.

Human ratings are upserted in the [human ratings ledger](./human-ratings-ledger.md). The node frontmatter stores only the materialized projection: the mean of current ratings, rounded to at most one decimal place, plus the current rater count.

### Type contract

```ts
// owned by human-ratings-ledger.md
type ScoresProjection = HumanScoresProjection & {
  judge: Rating;
};

type RatingDelta = OneDecimal; // judge - human, rounded to one decimal place

type DisplayDelta = {
  judgeMinusHuman: RatingDelta | null; // null when human is null
};
```

## Birth state

A compiled node is born judge-only. The projection job may fill `human` and `n` later from the human ratings ledger.

### Markdown shape

```yaml
scores: { judge: 3, human: null, n: 0 }
```

### Type contract

```ts
type BirthScores<J extends Rating> = { judge: J; human: null; n: 0; };
```

## Temporal policy

The judge sets `temporal`.

`true` means timing-bound and eligible for a future decay mechanism.

`false` means timeless and ineligible for decay.

Decay is stubbed to `0` for now. The effective multiplier is `1`, so ratings do not change with age. A future decay mechanism can replace the stub without changing the node's `temporal` field.

### Type contract

```ts
type TemporalPolicy =
  | {
      temporal: true;
      decay: Decay;
      effect: 'none';
      futureMechanism: 'time_decay';
    }
  | {
      temporal: false;
      decay: Decay;
      effect: 'none';
    };
```
