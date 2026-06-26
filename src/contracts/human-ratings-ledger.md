# Human Ratings Ledger Contract

The human ratings ledger is the source of record for human scores. A node stores only a materialized projection of it.

In this file, ledger means the current human rating state the service reads from. The demo contract is one current rating per `(node_id, rater_id)`, where `rater_id` is the rater's email.

## External contracts

This contract references shapes owned elsewhere. It does not redefine them.

- [@markscript.md](./markscript.md) owns `SlugId` and `Iso8601`.
- [@rating.md](./rating.md) owns `Rating` and `OneDecimal`.

`human-ratings-ledger.md` owns the ledger shapes and the `HumanScoresProjection`.

## Contract primitives

Human scores use the rating scale from [`rating.md`](./rating.md). Individual ratings are integers. The projected average is numeric and rounded to at most one decimal place.

`Iso8601` is the string timestamp format, for example `2026-06-23T15:04:05.000Z`. The field name is `rate_date`.

### Type contract

```ts
type RaterEmail = string;

type HumanAverage = OneDecimal; // -5...+5
```

## Node ratings

The service boundary is node-scoped: give the projection job a node id and the current ratings for that node.

A database can store this as a table keyed by `(node_id, rater_id)`. A file store can group ratings by `node_id`. Either way, the contract exposed to the projection job is the same.

### Rendered shape

```json
{
  "node_id": "actuarial-collapse-in-specialty-auto-reinsurance-59cd965f",
  "ratings": [
    { "rater_id": "mh@example.com", "score": 3, "rate_date": "2026-06-23T15:04:05.000Z" },
    { "rater_id": "dd@example.com", "score": 4, "rate_date": "2026-06-23T15:05:10.000Z" }
  ]
}
```

### Type contract

```ts
type HumanRating = {
  rater_id: RaterEmail;
  score: Rating;
  rate_date: Iso8601;
};

type HumanNodeRatings = {
  node_id: SlugId;
  ratings: HumanRating[];
};
```

## Upsert

Submitting a human rating upserts the current rating for that `(node_id, rater_id)`. A later rating from the same email on the same node replaces the prior score; it does not create a second vote.

### Type contract

```ts
type UpsertHumanRating = {
  input: {
    node_id: SlugId;
    rating: HumanRating;
  };
  output: HumanNodeRatings;
};
```

## Projection

The node stores a projection, not the human rating records.

For a node:

- `n` is the number of current ratings for that node;
- `human` is `null` when `n` is `0`;
- otherwise `human` is the arithmetic mean of current `score` values, rounded to at most one decimal place.

### Type contract

```ts
type HumanScoresProjection = {
  human: HumanAverage | null;
  n: number;
};

type RecomputeHumanScores = {
  input: HumanNodeRatings;
  output: HumanScoresProjection;
};
```

## Materialization

The projection job writes the computed `human` and `n` back into node frontmatter as `scores.human` and `scores.n`.

The mechanism is intentionally open. A local command, scheduled job, GitHub Action, or service can perform the write; the fixed contract is read `HumanNodeRatings`, compute `HumanScoresProjection`, and emit a `HumanScoresPatch`. A full recompute can regenerate every node projection from the ratings store if the materialized fields drift.

### Type contract

```ts
type HumanScoresPatch = {
  node_id: SlugId;
  scores: HumanScoresProjection;
};

type MaterializeHumanScores = {
  input: HumanNodeRatings;
  output: HumanScoresPatch;
};
```

## Example projection

Two current ratings for the same node:

```json
{
  "node_id": "actuarial-collapse-in-specialty-auto-reinsurance-59cd965f",
  "ratings": [
    { "rater_id": "mh@example.com", "score": 3, "rate_date": "2026-06-23T15:04:05.000Z" },
    { "rater_id": "dk@example.com", "score": 4, "rate_date": "2026-06-23T15:05:10.000Z" }
  ]
}
```

Project to:

```yaml
scores: { human: 3.5, n: 2 }
```

### Type contract

```ts
type ExampleProjection = {
  inputScores: [3, 4];
  output: {
    human: 3.5;
    n: 2;
  };
};
```

## Empty projection

A node with no human ratings is born with no human average.

### Markdown shape

```yaml
scores: { human: null, n: 0 }
```

### Type contract

```ts
type EmptyHumanProjection = {
  human: null;
  n: 0;
};
```
