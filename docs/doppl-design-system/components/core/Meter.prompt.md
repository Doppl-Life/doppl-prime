`Meter` is the length-is-truth primitive behind energy, novelty, and fitness bars. The fill **length** is the value; color only grades it; a mono number sits alongside.

```jsx
<Meter kind="fitness" value={0.84} label="fitness" />
<Meter kind="novelty" value={0.74} label="novelty" />
<Meter kind="energy"  value={0.46} label="ag_a9" valueLabel="46%" />
<Meter kind="novelty" value={0.5} degraded label="novelty" />   {/* novelty_scoring_degraded */}
```

- **kind:** `fitness` (low<0.4 / mid / high>0.7 thresholds) · `energy` (drains + charge glow) · `novelty` (violet).
- `degraded` renders a striped fill + `~est` flag — use it for `novelty_scoring_degraded`, never hide it.
- Compose several stacked `Meter`s for a `FitnessBreakdown`; one per agenome for the energy panel.
