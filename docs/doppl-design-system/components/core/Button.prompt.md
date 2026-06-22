`Button` — the brand action primitive. The accent "living cyan" is reserved for the **primary** CTA; reach for `danger` only for Stop / destructive paths.

```jsx
<Button variant="primary" glyph="▶">Start run</Button>
<Button variant="secondary">Inspect</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="danger" glyph="■">Stop</Button>
```

- **variant:** `primary` (accent fill) · `secondary` (surface + border) · `ghost` (transparent) · `danger`.
- **size:** `sm` · `md` · `lg` (lg for projector). Min height clears the 44px hit-target floor at `lg`.
- Disable + show a pending state for idempotent mutations (Start/Stop) so a double-click can't fire twice.
