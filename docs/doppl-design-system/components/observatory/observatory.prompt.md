The **observatory** components are the real-time window into the kernel runtime — the live telemetry that makes S2 · Organism View legible from across a room.

```jsx
<ActivityTicker events={sseEvents} mode="live" />        {/* streaming kernel event feed */}
<HealthIndicator health={{ currentGeneration: 3, candidatesInFlight: 4, lastEventAgeMs: 1300,
  capsConsumed: { energy: 0.535, generations: 0.6 } }} status="healthy" />
<RunEnergyGauge spent={6420} budget={12000} />           {/* draining charge */}
<CriticGauntletPanel
  reviews={[{ mandate: "factual_grounding", score: 0.81, confidence: 0.9, critique: "Signals well-sourced." },
            { mandate: "feasibility", score: null }]}     {/* score:null → live "reviewing…" pulse */}
  judge={{ acceptance: 0.88 }} />
```

- **ActivityTicker** maps each `RunEventType` to a glyph + color (spawn ◌, energy ⚡, critic ⊘, fitness ✦, fuse ⚇, cull ✕…). Feed it the sequence-keyed SSE reducer output; newest on top. In replay the live dot goes static amber.
- **HealthIndicator** is the continue-vs-switch signal; `stalled` is the cue to drop a fallback rung. Caps ≥90% turn amber.
- **RunEnergyGauge** glow shrinks as energy drains; goes empty at the budget.
- **CriticGauntletPanel** shows every critic mandate (evidence only) + the held-out judge as the gold, immutable-to-agents anchor. Pass `score: null` on a review to show it actively reviewing.
