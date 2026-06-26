# Stock Contract

A stock field is durable domain memory: admitted discoveries that future stages can read before reaching outward again.

Stock is not raw search output, and it is not Growth. Discovery finds; stock remembers; stages conclude.

## External contracts

This contract imports shapes owned elsewhere. It does not redefine them.

- [@markscript.md](./markscript.md) owns the structural standard library (`MarkdownFile`, `MarkdownSection`, `MarkdownSubsection`, `NonEmptyArray`, `SlugId`, `Iso8601`).
- [@rating.md](./rating.md) owns `Measurement`.

`stock.md` owns `FieldRef` and `SourceRef`.

## Contract primitives

Stock uses stable ids for fields and discoveries. Timestamps are ISO 8601 strings. Gate readings are measurements, not ratings.

### Type contract

```ts
type FieldRef = {
  id: SlugId;
  name: string;
};

type SourceRef = {
  id?: SlugId;
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
  id: SlugId;
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
      target_id: SlugId;
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

A load-bearing fact is a compressed admission of source material, not the source itself: the claim is the heading, the `synopsis` carries the mechanism and the implication, and a grounding line states why it cleared the bar. The synopsis is a compression — its length tracks how much the admitted source carried, not a fixed cap. Each fact ends with a stable block anchor (`^discovery_id`) so a node can deep-link the exact discovery it used (`[[field-id#^discovery_id]]`); the node cites that lighter reference rather than restating the fact. **Provisional:** synopsis length and grounding-line format are still being tuned.

### Markdown shape

```markdown
---
id: battery-supply-b8e2c6f0
name: "Battery supply"
keywords: [battery, lithium, refining, offtake]
discoveries: 37
finds_screened: 410
created: 2026-06-21T00:00:00.000Z
updated: 2026-06-22T00:00:00.000Z
---

# Battery supply

Domain memory for how refined-supply access — not raw lithium — governs battery cost and availability.

## Load-bearing facts

### Refining capacity is the binding constraint, not raw lithium

Raw lithium is abundant on paper; the bottleneck is qualified refining and the offtake that locks it up. A buyer with extraction exposure but no refined-supply access is long the wrong leg, and reprices when refined spreads widen.
_Grounded: 3 sources · 1 dated signal · novelty 0.74_ ^refining-bind

### Yuan-denominated offtake pulls supply off the spot market

Long-dated, yuan-settled offtake removes refined units from the spot pool before they clear, so visible spot inventory understates how tight access really is.
_Grounded: 2 sources · held-out trade-flow data_ ^offtake-lock
```

### Type contract

```ts
type StockFieldFrontmatter = {
  id: SlugId;
  name: string;
  keywords: string[];
  discoveries: number;
  finds_screened: number;
  created: Iso8601;
  updated: Iso8601;
};

type StockDiscoverySummary = {
  discovery_id: SlugId; // also the Obsidian block anchor (`^discovery_id`) a node deep-links
  claim: string;        // the load-bearing fact, stated as the entry heading
  synopsis: string;     // compressed mechanism + implication; length tracks the admitted source
  grounded: string;     // why it cleared the bar: signal + dated sources
  sources?: SourceRef[];
};

type LoadBearingFact = MarkdownSubsection<`### ${string}`, StockDiscoverySummary>;

type LoadBearingFactsSection = MarkdownSection<'## Load-bearing facts', LoadBearingFact[]>;

type StockFieldFile = MarkdownFile<StockFieldFrontmatter, [
  description: MarkdownSection<`# ${string}`, string>, // one-line domain description as the headline body
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
