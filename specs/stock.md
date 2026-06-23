# Stock Contract

A stock field is durable domain memory: admitted discoveries that future stages can read before reaching outward again.

Stock is not raw search output, and it is not Growth. Discovery finds; stock remembers; stages conclude.

## Contract primitives

Stock uses stable ids for fields and discoveries. Timestamps are ISO 8601 strings. Gate readings are measurements, not ratings.

### Type contract

```ts
type Uuid = string;
type Iso8601 = string;
type NonEmptyArray<T> = [T, ...T[]];

type Measurement = number; // 0...1; runtime validator enforces the range

type FieldRef = {
  id: Uuid;
  name: string;
};

type SourceRef = {
  id?: Uuid;
  label: string;
  url?: string;
  retrieved_at?: Iso8601;
};
```

## Admitted discoveries

An admitted discovery is the shape of a find after it clears admission. Enrichment decides whether it becomes a new durable record, strengthens an existing one, or is dropped as a rehash.

Admission requires both novelty and grounding signal. A low-value find can be screened without entering stock.

### Type contract

```ts
type StockSignal = {
  novelty: Measurement;
  grounding: Measurement;
};

type AdmissionRuling = {
  gate: 'admission';
  decision: 'admit';
  reason: string;
};

type AdmittedDiscovery = {
  id: Uuid;
  field: FieldRef;
  claim: string;
  keywords: string[];
  sources: NonEmptyArray<SourceRef>;
  signal: StockSignal;
  admission: AdmissionRuling;
  created: Iso8601;
  updated: Iso8601;
};
```

## Screened finds

Screened finds are proof that the bar exists. They can be counted, audited, or sampled, but they are not stock discoveries.

### Type contract

```ts
type FindRuling = {
  gate: 'admission';
  decision: 'reject';
  reason: string;
};

type ScreenedFind = {
  field: FieldRef;
  found: string;
  sources: SourceRef[];
  signal: StockSignal;
  ruling: FindRuling;
  screened_at: Iso8601;
};
```

## Enrichment

Enrichment decides what happens after a find clears admission. A genuinely new discovery is added. A duplicate strengthens an existing discovery by merging sources, keywords, or wording. A rehash is dropped.

### Type contract

```ts
type EnrichmentRuling =
  | {
      gate: 'enrichment';
      decision: 'add';
      reason: string;
    }
  | {
      gate: 'enrichment';
      decision: 'merge';
      target_id: Uuid;
      reason: string;
    }
  | {
      gate: 'enrichment';
      decision: 'drop';
      reason: string;
    };

type StockDiscovery = AdmittedDiscovery & {
  enrichment: Extract<EnrichmentRuling, { decision: 'add' | 'merge' }>;
};

type EnrichStock = {
  input: AdmittedDiscovery;
  ruling: EnrichmentRuling;
  output: StockDiscovery | null;
};

type StockWriteResult = {
  ruling: EnrichmentRuling;
  discovery: StockDiscovery | null;
};
```

## Rendered field

The rendered stock field is a projection grouped by field. It is what humans and stages read first.

The counts in frontmatter are projections: `discoveries` counts admitted discoveries in the field, and `finds_screened` counts screened finds considered for the field.

### Markdown shape

```markdown
---
id: b8e2c6f0-3a1d-4c9e-8b7a-5f2d1e0c9a4b
name: "Battery supply"
keywords: [battery, lithium, refining, offtake]
discoveries: 37
finds_screened: 410
created: 2026-06-21T00:00:00.000Z
updated: 2026-06-22T00:00:00.000Z
---

# Battery supply

## Load-bearing facts

- accident liability shifts from driver to manufacturer faster than premiums reprice · grounded: 3 sources, 1 dated signal
- used-car residuals soften first in AV-pilot metros · grounded: held-out metro data
```

### Type contract

```ts
type StockFieldFrontmatter = {
  id: Uuid;
  name: string;
  keywords: string[];
  discoveries: number;
  finds_screened: number;
  created: Iso8601;
  updated: Iso8601;
};

type StockDiscoverySummary = {
  discovery_id: Uuid;
  claim: string;
  grounded: string;
  sources?: SourceRef[];
};

type MarkdownSection<Heading extends string, Body> = {
  heading: Heading;
  body: Body;
};

type MarkdownFile<Frontmatter, Body> = {
  frontmatter: Frontmatter;
  body: Body;
};

type LoadBearingFactsSection = MarkdownSection<'## Load-bearing facts', StockDiscoverySummary[]>;

type StockFieldFile = MarkdownFile<StockFieldFrontmatter, [
  headline: MarkdownSection<`# ${string}`, string>,
  facts: LoadBearingFactsSection,
]>;
```

## Discovery boundary

Discovery reads the rendered stock field before calling an external backend. Discovery submits admitted discoveries to stock; enrichment returns the write result.

### Type contract

```ts
type ReadStockField = {
  input: FieldRef;
  output: StockFieldFile;
};

type WriteStockDiscovery = {
  input: AdmittedDiscovery;
  output: StockWriteResult;
};
```
