`CandidateCard` and `AgenomeCard` are the scannable summaries used in lists, the graph periphery, and as inspector headers. They compose `StatusBadge` + `Meter` — don't re-implement those inside a card.

```jsx
<CandidateCard
  candidate={{ id: "cand_g3_004", subtype: "cross_domain_transfer",
               title: "Cold-chain routing via epidemic-curve forecasting", status: "selected" }}
  fitnessTotal={0.84} novelty={0.74}
  criticSummary={{ passed: 4, total: 5 }} checkSummary={{ passed: 2, failed: 0, skipped: 1 }}
  generation={3} agenomeId="ag_a9" onInspect={openS3} />

<AgenomeCard
  agenome={{ id: "ag_a9", status: "reproduced", parentIds: ["ag_a7", "ag_a3"] }}
  energySpent={410} energyBudget={500} candidatesProduced={1}
  specializationTag="transfer / systems" onInspect={openS4} />
```

- `CandidateCard` shows the gold winner treatment when `status === "selected"` (or `selected`).
- `AgenomeCard` infers parentage glyph: `◌` gen-0 seed · `∿` mutation child · `⚇` fusion child.
- Both call `onInspect(id)` — wire to the S3 / S4 drawers.
