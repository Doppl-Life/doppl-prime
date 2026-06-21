Shared system-state shells used by every data-bound surface — consistency here is what keeps degraded modes legible on a projector. Degraded states are first-class: the system tells the truth, never hides it.

```jsx
<EmptyState icon="◌" title="Population blooming…" description="waiting for Gen 0 to spawn" />
<LoadingState shape="graph" label="Establishing stream…" />
<ErrorState title="Live stream lost" detail="GET /runs/run_7f3a/stream (503)" onRetry={retry} action={<Button variant="secondary">Switch to replay</Button>} />
<DegradedState kind="novelty_degraded" />
<DegradedState kind="all_culled" detail="Generation 2: 0 survivors" />
```

- **DegradedState.kind:** `novelty_degraded` · `langfuse_off` · `provider_failure` · `all_culled` — each maps to a real architecture failure event and says what is still trustworthy.
- `LoadingState` prefers skeletons over spinners; use a spinner only for actions (Start, run-live).
- `ErrorState` on a lost live stream should always offer **Switch to replay** (the operator's continue-vs-switch decision).
