# Doppl — Design Documentation

> **Purpose.** This package is the complete UX/UI + flows brief for **Doppl**, written to be handed to a design session (e.g. Claude design) to (1) build a **design-system kit**, then (2) build a **clickable dummy prototype**. It is derived from the binding `ARCHITECTURE.md` (§3 domain, §10 lineage, §11 API/flows, §12 dashboard, Appendix A models) + `docs/planning/USER_FLOWS.md` / `USERS.md` / `EVALUATION_CRITERIA.md`. It describes *what* the product is, *who* uses it, *every screen and interaction*, and the *canonical libraries* the prototype must use so it stays faithful to the eventual `apps/web` build.

## What Doppl is (10-second version)

An agental-evolution runtime you **watch**. A human seeds a run; a population of agent genomes ("agenomes") generate candidate ideas; an adversarial critic council + a held-out judge + objective checks score them; weak lineages are culled; strong ones **fuse** (two parents) and mutate into later generations that **measurably beat** earlier ones. The product is the *process* — *"it's not the agent, it's the kernel that breeds the agents."* The UI must make a digital ecosystem getting smarter in real time **legible, unforgettable, and defensible** — in a 10-minute showcase.

## How to use this package

**Recommended build order:**

1. **Build the design-system kit** → start with **[07-design-system.md](07-design-system.md)** (tokens, color/status palette, type, motion) + **[08-libraries-and-stack.md](08-libraries-and-stack.md)** (the canonical stack). This produces the reusable primitives + tokens everything else binds to.
2. **Prototype the screens** → **[04-screens.md](04-screens.md)** (the pages, with dummy data) composed from **[05-components.md](05-components.md)** (the component contracts), with the centerpiece **[06-lineage-graph-spec.md](06-lineage-graph-spec.md)** (the React Flow lineage graph).
3. **Wire the experience** → follow **[03-user-flows.md](03-user-flows.md)** + **[09-demo-storyboard.md](09-demo-storyboard.md)** for navigation, transitions, and the showcase narrative the whole UI serves.

The prototype runs on **dummy fixtures** (no backend) — each screen/component doc includes representative sample data. Production later binds the *same* libraries to the read-only `ARCHITECTURE.md` §11 API + `packages/contracts` Zod types.

## Document map

| Doc | What it covers |
|---|---|
| [00-product-overview.md](00-product-overview.md) | What Doppl is for designers · the narrative + wow · the emotional arc · domain glossary |
| [01-personas-and-jobs.md](01-personas-and-jobs.md) | Operator + Reviewer/Audience personas · jobs-to-be-done → screens |
| [02-information-architecture.md](02-information-architecture.md) | Screen map (S0–S6) · navigation · AppShell · routes |
| [03-user-flows.md](03-user-flows.md) | The 7 flows step-by-step with on-screen state · live/replay fallback ladder |
| [04-screens.md](04-screens.md) | Every screen: layout, regions, components, data, states, interactions |
| [05-components.md](05-components.md) | Component inventory: anatomy, data, variants, states, interactions |
| [06-lineage-graph-spec.md](06-lineage-graph-spec.md) | The React Flow lineage graph: nodes, edges, layout, live choreography |
| [07-design-system.md](07-design-system.md) | The design-system kit: tokens, color/status system, type, motion, theming |
| [08-libraries-and-stack.md](08-libraries-and-stack.md) | Canonical libraries + stack (React Flow, Tailwind/shadcn, Recharts, Framer Motion, …) |
| [09-demo-storyboard.md](09-demo-storyboard.md) | The 10-minute showcase as a frame-by-frame UX storyboard |

## Canonical screens (S0–S6)

- **S0 · Runs Home** — list of runs (live + completed); New Run; enter Replay.
- **S1 · Run Launcher** — configure + start (prompt source, subtypes, safe caps with hard-max).
- **S2 · Organism View** — the live observatory; the Lineage Graph + fitness/energy/activity panels.
- **S3 · Candidate Inspector** — (overlay) a candidate's full evidence + gauntlet.
- **S4 · Agenome Inspector** — (overlay) a genome + its lineage.
- **S5 · Final Idea / Payoff** — the winning idea + replayable gauntlet + transfer check.
- **S6 · Replay Mode** — S2 + a replay scrubber + REPLAY banner; time-travel from the event log.

## Canonical stack (pin this in the prototype — see [08](08-libraries-and-stack.md))

- **React 19 + Vite + TypeScript** (matches `apps/web`).
- **React Flow (`@xyflow/react`) + Dagre** — **canonical** for the lineage graph (do not substitute another graph lib).
- **Tailwind CSS + shadcn/ui + lucide-react** — the design-system kit + accessible primitives.
- **Recharts** — fitness-over-time + generation-comparison charts (visx as the power alternative).
- **Framer Motion** — the liveness choreography (spawn, energy-drain, critic-pulse, cull-fade, fusion-converge, mutation-shimmer).
- **TanStack Query + a sequence-keyed SSE reducer + Zustand + Zod** — data (prototype mocks the read-only §11 API).
- **Inter** (UI) + **JetBrains Mono** (genome text / IDs / energy).

## Non-negotiable UX invariants (from the architecture)

- **LIVE vs REPLAY must be unmistakable** at a glance (mode banner + badge).
- **Status uses shape + icon + label + color** (colorblind-safe, projector-legible) — never color alone.
- **The dashboard is read-only for reviewers**; only the operator mutates state, and only via the run controls (Start/Stop).
- **Every claim is defensible** — the winning idea always deep-links to its critic gauntlet, checks, fitness components, energy, and lineage.
- **The wow is generational** — the UI must make "round N+1 beats round N" visible, not just "an agent wrote a clever answer."
