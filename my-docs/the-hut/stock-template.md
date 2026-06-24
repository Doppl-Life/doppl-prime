# Stock Field Template

A stock field is the rendered projection of admitted discoveries for one domain. Discovery reads this before reaching outward and submits admitted discoveries back through enrichment.

Each load-bearing fact is a compressed admission of source material, not the source itself: claim as the heading, a synopsis whose length tracks how much the source carried, and a grounding line for why it cleared the bar. Every fact ends with a stable block anchor (`^discovery-id`) so a node can deep-link the exact discovery it used (`[[field-id#^discovery-id]]`) rather than re-stating it. The node cites a lighter reference; the fuller admitted thing lives here. **Provisional:** the synopsis length and the grounding-line format are still being tuned against real fields.

See [`../../contracts/stock.md`](../../contracts/stock.md) for the MarkScript contract.

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
