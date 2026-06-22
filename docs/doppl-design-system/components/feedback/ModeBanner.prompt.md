`ModeBanner` is the global LIVE vs REPLAY signal — the single most important accessibility/credibility invariant. It sits at the top z-layer so it can never be occluded.

```jsx
<ModeBanner mode="live" generationLabel="Gen 3/5" />
<ModeBanner mode="replay" recordedAt="2026-06-18" fullWidth />
<ModeBanner mode="complete" generationLabel="Gen 3 · best 0.84" />
```

- **mode:** `live` (cyan, breathing dot) · `replay` (amber, hatched, static — pass `fullWidth` for the projector ribbon) · `complete` / `stopped` / `failed` (steady terminal).
- LIVE pulses; REPLAY never animates ("is it moving?" answers live-or-playing). Both back color with shape + icon + label.
- Mirror the live/replay state on the `RunHeader` badge too — redundant channels.
