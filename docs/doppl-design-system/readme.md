# Doppl — Design System

> **An agental-evolution runtime you _watch_.** A human seeds a run; a bounded population of agent genomes (**agenomes**) breeds candidate ideas; an adversarial **critic council + held-out judge + objective checks** score them; weak lineages are **culled**; strong pairs **fuse** and **mutate** into later generations that *measurably beat* earlier ones. The product **is the process** — *"it's not the agent, it's the kernel that breeds the agents."* This design system makes a digital ecosystem getting smarter in real time **legible, unforgettable, and defensible** on a projector in a 10-minute showcase.

This project is the reusable design-system kit for Doppl's dashboard: tokens, the status-encoding primitive, reusable React components, the real-time observatory telemetry, and full-screen UI-kit recreations. It compiles to a runtime bundle (`_ds_bundle.js`) that the cards and UI kits mount.

**Sources this kit is built from** (binding ground truth — stored here for reference; do not assume the reader has access):
- `uploads/ARCHITECTURE.md` — the build contract (§3 domain + state machines, §7 verifier/judge, §10 lineage projection, §11 API, Appendix A models).
- `uploads/00-product-overview.md … 09-demo-storyboard.md` — the UX/UI brief (personas, IA, screens S0–S6, components, lineage graph, motion).
- **`uploads/10-dummy-data-fixtures.md`** — the single source of truth for fixtures: the canonical run `run_7f3a` threaded through every screen, and the **0–1 score scale** used everywhere.

> **Score scale note.** The dashboard renders all fitness / critic / novelty / judge values normalized to **0–1** (per doc 10). ARCHITECTURE §7 defines the held-out judge's *internal* rubric as 5 axes of 0–5; the UI displays its normalized acceptance. If you wire real data, normalize at the boundary.

---

## North star

> **Legible + Unforgettable + Defensible.** · **Calm chrome, vivid organism.**

A dark **evolutionary observatory / bioluminescent lab**: deep near-black canvas, glowing living nodes, **energy rendered as light/charge that drains**, the lineage rendered as a growing organism. The frame stays quiet and high-contrast; the life inside it is bioluminescent and in motion. Every decision is graded against the three pillars; on the shared stage surfaces (S0, S2, S5) projector **legibility** wins, and evidence **density** lives in the drill-in inspectors.

---

## CONTENT FUNDAMENTALS — how Doppl writes

- **Voice:** precise, technical, quietly confident. It states mechanism, not marketing. *"It's not the agent — it's the kernel that breeds the agents."* Never hypey; never cute.
- **Person:** the product narrates the **system**, not itself. Labels are nouns and verbs from the domain (`spawned`, `fused`, `culled`, `eligible_parent`), not UI chrome (`item`, `card`).
- **Casing:** UI labels and status are **lowercase / snake_case** rendered UPPERCASE in badges (`ELIGIBLE_PARENT`, `UNDER_REVIEW`). Domain nouns keep their exact canonical spelling everywhere: **agenome, candidate, fitness, novelty, energy, fusion, mutation, cull, lineage, replay**. IDs are mono and literal (`run_7f3a`, `cand_g3_004`, `seq 1187`).
- **Numbers are machine truth:** fitness `0.84`, novelty `0.74`, energy `6,420 / 12,000 doppl_energy`, `policyVersion sp-v3` — always in JetBrains Mono, always with their unit/policy beside them. Never a bare score; defensibility lives in the breakdown.
- **Honesty about degraded states:** copy says what is still trustworthy and what is estimated — `"novelty estimated — embedding unavailable"`, `"skipped: no allowlisted adapter"`, `"recorded run · no live calls"`. The system tells the truth when something is off.
- **Tone of the live story:** short, kinetic event phrases — `"ag_a3 fused from ag_a0 + ag_a2"`, `"♔ cand_g3_004 → 0.84 (winner)"`. The ticker reads like a heartbeat.
- **No emoji.** Iconography is the canonical status glyph set + lucide line icons (see ICONOGRAPHY). Unicode glyphs (◌ ◐ ★ ⚇ ∿ ✕ ♔ ✓ –) are load-bearing status shapes, not decoration.

---

## VISUAL FOUNDATIONS

- **Color:** a cool, desaturated near-black base with a faint blue-violet bias (`--bg-void #070A12` → `--bg-surface #111726`). Chrome is low-chroma so the **organism's status colors + energy glow are the only saturated things on screen.** Brand accent is **"living cyan" `#3BE3D0`**, reserved for *interactive + alive* (CTAs, focus, `active`) so it never collides with `eligible_parent` blue or `reproduced` violet. Full palette + OKLCH in `tokens/colors.css`.
- **Status = shape + icon + label + color, never color alone.** Colorblind-safe, survives full grayscale (the projector test). The `StatusBadge` primitive owns it. Hues are spaced for deuteranopia/protanopia; the glyph is the primary discriminator.
- **Type:** **Inter** for all UI (projector-legible), **JetBrains Mono** for *machine truth* (genome text, IDs, sequence, energy + fitness numbers, policyVersion). The mono/sans split itself signals "computed data" vs "chrome." Floor 13px; live-story text ≥ 15px. Scale in `tokens/typography.css`.
- **Spacing & radii:** 8px base grid (4px half-step for dense mono rows). Radii sm 6 / md 10 / lg 14 / xl 20 / full. Cards are `--radius-lg` with a 1px `--border-subtle` and `--elev-1`; the winner/selected card gets a gold border + glow.
- **Backgrounds:** flat deep surfaces — **no gradients, no imagery, no texture.** Depth comes from subtle borders + glow, not fills. The only "image" is the living lineage graph.
- **Elevation & glow (the bioluminescent layer):** dark UIs read depth via **glow + subtle borders**, not heavy drop shadows. Two channels: a calm **chrome shadow** (`--elev-1..3`) and an alive **organism glow** (`--glow-active / -winner / -fusion / -danger / -energy`). **Glow is meaningful** — only living/important things glow (active life, the winner, fusion, danger, energy); dead/`culled`/`spent` things lose glow. *Light = life.*
- **Motion (the soul):** every liveness beat maps to a named token (`--motion-spawn / -pulse / -energy-drain / -cull / -fusion / -mutate / -gen-advance / -chart-climb`) and a real `RunEventType`. Spawn = grow-in (overshoot); active = breathing pulse; energy = a charge that drains; cull = fade + sink; **fusion = two parent edges converge into a child** (the money animation); mutation = amber shimmer. Durations are slightly slower than a desktop app (the room needs time to see it). **Respect `prefers-reduced-motion` — meaning survives without motion** (pulses → static glow ring; everything snaps to end state).
- **Hover / press:** hover lifts + brightens (no color invention); press shrinks `scale(0.97)`. Focus is always a 2px `--ring` + 2px offset, never removed.
- **Borders & corners:** 1px hairlines (`--border-subtle`), stronger on focus-adjacent (`--border-strong`). Status borders color the node by its state. No pure-black borders, no heavy outlines.
- **Transparency & blur:** used sparingly — the modal/drawer scrim (`--bg-scrim`), tinted status fills via `color-mix`. No frosted-glass everywhere.
- **Imagery vibe:** N/A — Doppl has no photography. Its "imagery" is the organism: bioluminescent nodes on near-black, cool-to-violet, in motion.
- **LIVE vs REPLAY is sacred and unmistakable:** LIVE = cyan, breathing dot; REPLAY = amber, hatched, static, full-width; terminal states steady. `ModeBanner` sits at the top z-layer (`--z-banner`) so it can never be occluded.
- **Themes:** dark is the demo of record. A **high-contrast** seam (`.hc`) and a full **light theme** (`:root.light`, "the lab with the lights on" — paper surfaces, ink text, AA-darkened status hues, glows → crisp rings) are shipped; toggle by class on `<html>`. The UI kits include a dark/light toggle (persisted in localStorage).

---

## ICONOGRAPHY

- **Status glyphs are the core icon system** and are *load-bearing*, not decorative: `◌ seeded · ◐ active · ○ spent · ★ eligible_parent · ⚇ reproduced (two-parent) · ∿ mutated · △ failed · ✕ culled` (agenome); `· created · ◐ under_review · ◑ checked · ◉ scored · ♔ selected · △ invalid` (candidate); `✓ passed · ✕ failed · – skipped(+reason)` (check). These are canonical Unicode chars used everywhere a status appears (node, badge, ticker, inspector) so the system survives grayscale.
- **Line icons:** **lucide-react** is the brand's icon set (stroke 1.75) — one icon per concept (`Dna` agenome, `Lightbulb` candidate, `Zap` energy, `GitMerge` fusion, `Gavel`/`Scale` critic/judge, `Crown` winner, `HeartPulse` health, `History` replay…). Bundled React components use the **Unicode glyphs** (the bundler imports React only — no npm), so lucide is for standalone HTML / production where it can be loaded from CDN. Where a lucide icon is substituted by a glyph in this kit, the glyph is the canonical status shape — not a downgrade.
- **No emoji.** Energy is a charge/battery metaphor (`⚡` + draining meter), never an emoji.
- **Wordmark:** `◆ Doppl` — a cyan diamond glyph (drop-shadow glow) + "Doppl" in Inter 700. See `guidelines/brand-wordmark.card.html`.

> No raster logos or illustration assets ship with this kit — Doppl's brand is type + the status-glyph system + the living graph. `assets/` is intentionally minimal.

---

## Index — what's in this project

> Compiled inventory: **15 components** · **Design-System cards** across Colors/Type/Spacing/Status/Brand/Components · **self-hosted fonts** · **3 themes** (dark default · `:root.light`) · **3 UI-kit screens** wired into a clickable flow **S0 → S1 → S2**. Namespace: `window.DopplDesignSystem_352b49`.


**Tokens** (`styles.css` → `tokens/`): `colors.css` (chrome, status, meters, edges, + `.hc` / light themes) · `typography.css` · `spacing.css` (+ z-layers) · `elevation.css` (shadows + glows) · `motion.css` · `fonts.css` (Inter + JetBrains Mono) · `base.css` (resets + liveness keyframes).

**Components** (`components/<group>/` — `.jsx` + `.d.ts` + `.prompt.md`, one `@dsCard` per dir):
- `core/` — **StatusBadge** (the atom), **Button**, **Meter** (length-is-truth).
- `feedback/` — **ModeBanner** (LIVE/REPLAY), **EmptyState · LoadingState · ErrorState · DegradedState**.
- `cards/` — **CandidateCard**, **AgenomeCard**.
- `observatory/` — **ActivityTicker** (the live kernel event feed), **HealthIndicator**, **RunEnergyGauge**, **CriticGauntletPanel** (critic council + held-out judge).

**Foundation cards** (`guidelines/*.card.html`): Colors (surface, text, accent, meters), Status (agenome, candidate/check, edges/subtypes), Type (display, body/mono), Spacing (scale, radii/elevation), Brand (wordmark + mode banner). These populate the Design System tab.

**UI kits** (`ui_kits/<product>/`) — a complete clickable app: **Runs Home → Run Launcher → Organism View → Final Idea**:
- `runs-home/` — **S0 · Runs Home**, the entry point: the run list + **New Run** CTA (→ launcher); Open live / Replay / Final idea actions.
- `run-launcher/` — **S1 · Run Launcher**, where you **start a campaign**: prompt source (prepared set or live prompt), subtype toggles, safe caps with hard-max, model profile → **Start run** (→ organism view).
- `organism-view/` — **S2 · Live Organism View**, the centerpiece: a real-time window into the kernel runtime — a living lineage graph (**click any node to inspect** = S3/S4 drawers), the streaming kernel **ActivityTicker**, a per-agent **roster**, **RunEnergyGauge**, **HealthIndicator**, the **fitness climb**, the **critic gauntlet + held-out judge**, and a **replay scrubber (S6)** — all driven off one `step` clock exactly as production drives it off the SSE reducer. On completion: **Reveal Final Idea**. Dark/light toggle.
- `final-idea/` — **S5 · Final Idea / Payoff**, the showcase money shot: the winning idea, the generational climb (gen-0 → winner, Δ +0.39), the gauntlet + held-out judge it survived, the **transfer check run live**, and evidence links.

**Skill:** `SKILL.md` — makes this kit usable as a downloadable Agent Skill.

---

## Using the kit

Cards and UI kits link `styles.css` and load `_ds_bundle.js` (auto-compiled), then read components via `const { StatusBadge, … } = window.DopplDesignSystem_352b49`. To build a new surface, compose the primitives — don't re-implement `StatusBadge`/`Meter` inside a card. Status is always shape + icon + label + color; scores are always 0–1 with the breakdown one click away; LIVE vs REPLAY is always unmistakable.

---

## CAVEATS / open items

- **Fonts** are **self-hosted** — Inter + JetBrains Mono woff2 (latin subset) live in `assets/fonts/` and are declared as `@font-face` in `tokens/fonts.css`. Add weights/scripts by dropping more woff2 in and extending that file.
- **Lineage graph** in the Organism View is a faithful hand-built recreation (tiered layout + custom nodes/edges), not the production React Flow + Dagre instance — it cuts functional corners (fixed layout, fixture clock) while matching the visual + interaction spec.
- **Light theme** is a defined-but-secondary surface (the bioluminescent metaphor is dark-native); review the darkened status hues for your projector before relying on it on stage.
- Remaining surfaces (standalone S3/S4 inspector routes, a dedicated S6 replay entry) are optional — the Organism View already embeds the node inspector (S3/S4) and a replay scrubber + REPLAY mode (S6), and S5 Final Idea is built. The rest of `uploads/04-screens.md` composes from the existing components.

---

## Manifest (compiled)

- **Components (15):** `StatusBadge`, `Button`, `Meter` (core) · `ModeBanner`, `EmptyState`, `LoadingState`, `ErrorState`, `DegradedState`, `SystemState` (feedback) · `CandidateCard`, `AgenomeCard` (cards) · `ActivityTicker`, `HealthIndicator`, `RunEnergyGauge`, `CriticGauntletPanel` (observatory).
- **Cards:** Brand · Colors · Type · Spacing · Status · Components, plus the four screen cards (Runs Home, Run Launcher, Organism View, Final Idea).
- **Screens (4):** `ui_kits/runs-home` (S0), `ui_kits/run-launcher` (S1), `ui_kits/organism-view` (S2 + S3/S4 drawers + S6 replay), `ui_kits/final-idea` (S5).
- **Tokens:** dark `:root` + `:root.light` + `.hc` themes (`tokens/`).
- **Fonts:** Inter + JetBrains Mono, self-hosted in `assets/fonts/`.
- Namespace: `window.DopplDesignSystem_352b49`.

