`StatusBadge` encodes any lifecycle status as **shape + icon + label + color** (never color alone) — the colorblind-safe, projector-legible atom reused on every node, card, and inspector.

```jsx
<StatusBadge domain="agenome" status="eligible_parent" />
<StatusBadge domain="candidate" status="selected" size="lg" />
<StatusBadge domain="check" status="skipped" reason="no allowlisted adapter" />
<StatusBadge domain="run" status="running" />            {/* the LIVE pill family */}
<StatusBadge domain="subtype" status="cross_domain_transfer" />   {/* renders as XFER pill */}
```

- **domains:** `agenome` · `candidate` · `check` · `run` · `subtype`.
- **size:** `sm` (dense graph nodes, icon-only via `showLabel={false}`) · `md` (default) · `lg` (projector / RunHeader).
- `active` / `under_review` / `running` pulse by default; override with `pulse`. `selected` carries the gold winner glow.
- Always pass `reason` for check `skipped` and agenome `failed` — the system tells the truth about degraded states.
- `subtype` renders as a tinted pill (`XFER` / `ZEIT`), not a glyph+label row.
