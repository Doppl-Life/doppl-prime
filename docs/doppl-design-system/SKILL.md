---
name: doppl-design
description: Use this skill to generate well-branded interfaces and assets for Doppl, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML
files for the user to view. If working on production code, you can copy assets and read the rules here to become
an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some
questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## What Doppl is (one paragraph)

Doppl is an **agental-evolution runtime you watch**: a seed prompt breeds a population of *agenomes* that produce
candidate ideas, which face an adversarial **critic gauntlet** + executable checks and a **held-out judge the
agents cannot influence**; survivors reproduce across generations. The product is the **projector-legible
dashboard** you stand in front of while this happens. The thesis behind every pixel: *it's not the agent — it's
the kernel that breeds the agents; the event log is the truth; the held-out judge is the floor the organism
cannot lift.* It is **generational, not a tournament** — lineage and improvement-over-time, never a leaderboard.

## Where things are

- `readme.md` — **read this first.** Full design guide: content voice, visual foundations, iconography, the
  status-encoding invariant, and the component/token index.
- `styles.css` — the single CSS entry point. Link it and you get every token + font. `@import` lines only.
- `tokens/` — `colors.css` · `typography.css` · `spacing.css` · `elevation.css` · `motion.css` · `fonts.css`
  · `base.css` (resets + liveness keyframes). All design decisions are CSS custom properties.
- `components/` — React primitives, grouped: `core/` (StatusBadge, Button, Meter), `feedback/` (ModeBanner +
  state shells), `cards/` (CandidateCard, AgenomeCard), `observatory/` (the live kernel telemetry).
- `ui_kits/` — full click-through screen recreations: `runs-home` (S0) · `run-launcher` (S1) ·
  `organism-view` (S2, the live centerpiece) · `final-idea` (S5).
- `guidelines/*.card.html` — foundation specimen cards.
- `uploads/` — the originating brief (ARCHITECTURE.md, screens, flows, and **10-dummy-data-fixtures.md**, the
  single source of truth for fixture data + the 0–1 score scale).

## The five rules you must not break

1. **Status is never color alone** — always shape + icon + label + color. Use `StatusBadge`; never hand-color a
   dot. Quantities (fitness/novelty/energy) use `Meter`: length is the truth, color only grades it, number shown.
2. **LIVE vs REPLAY must be unmistakable** — `ModeBanner` at the top z-layer. Live = cyan, breathing. Replay =
   amber, hatched, static. Never let a recording look live.
3. **Dark observatory, calm chrome** — near-black surfaces; one accent ("living cyan" `--accent`) reserved for
   interactive+alive. Only living/important things **glow**. No gradient decoration, no emoji, no colored
   left-border cards. Need more legibility? Toggle the `.hc` high-contrast scope (projector seam).
4. **Motion is meaningful, never decorative** — every liveness beat is a named token in `tokens/motion.css`
   (spawn, pulse, energy-drain, fusion, mutate, cull, gen-advance). Always honor `prefers-reduced-motion`
   (handled globally in `tokens/base.css`).
5. **Machine truth is verbatim** — `snake_case` status/event/mandate strings and ids stay lowercase and in
   JetBrains Mono. Scores are normalized **0–1** (see `uploads/10-dummy-data-fixtures.md`). Tell the truth about
   degraded data ("~est", "novelty degraded") — never hide it.

## Mounting components (HTML artifacts)

```html
<link rel="stylesheet" href="styles.css" />
<script src="_ds_bundle.js"></script>
<script type="text/babel">
  const { StatusBadge, Meter, ModeBanner, ActivityTicker } = window.DopplDesignSystem_352b49;
  // …compose. Each component has a sibling .prompt.md with usage + variants.
</script>
```

Load React 18 + Babel standalone first (see any `ui_kits/*/index.html` for the exact pinned script tags). The
canonical fixture for any demo is run `run_7f3a` — "epidemiology → logistics", winner *Cold-chain routing via
epidemic-curve forecasting*, fitness 0.84. Reuse it so every screen tells one coherent story.

## Production note

Fonts (Inter, JetBrains Mono) load from Google Fonts for prototypes — self-host the woff2 for production and
keep `tokens/fonts.css` pointing at them. No brand logo asset exists yet; the wordmark is Inter + a `◆` mark.
