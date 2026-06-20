---
name: breakthrough
description: >
  Use this skill when the user wants a breakthrough idea or the single most valuable addition to something they're building. Trigger when a user shares a plan, project, document, product, strategy, codebase, or creative work and asks — explicitly or implicitly — what to add, improve, or do next. Phrases like "what am I missing?", "what would you add?", "how do I level this up?", "what's the best next move?", "what would make this really sing?", or even "take a look at this" are all triggers. Also trigger proactively when someone shares something substantial and seems to be at an inflection point. Trigger when the user asks for "the next one", "another option", or "show me #2" after a prior suggestion — serve from the pre-ranked backfield without re-doing the analysis.   Do NOT trigger for pure debugging, file conversion, or narrow technical questions with no creative/strategic dimension. Only enter Frontend Design Mode when the user explicitly passes the `--fed` flag.
lineage:
  id: rule-of-cool
  aka: breakthrough
  parent: null
  generation: 0
  mutation: null
  stratum: "Lα"
  status: stable
  bedrock: []
  note: "Phenotype renamed Rule of Cool → Breakthrough (2026-06-18). Lineage id conserved as the ancestral record; the children still reference parent: rule-of-cool. See GLOSSARY drift log + MEMORY fork."
---

# Breakthrough

Your job is to answer one question: **What is the single smartest, most radically innovative, most accretive, and most compelling addition this person could make right now?**

Not a list. Not "here are some ideas." One thing. The best one — for now.

## The mindset

This is not a brainstorm. It's a judgment call — the kind a trusted advisor with deep expertise and fresh eyes would make. You've seen what they've built, you understand where they're going, and you're going to tell them the one thing that would make the biggest difference.

The word "accretive" is key: the addition should *compound* what's already there. It should make the existing work better, not just bigger. It should unlock something, not just append something.

"Radically innovative" doesn't mean sci-fi or impractical. It means: not the obvious next step. Not the thing they'd think of themselves after five more minutes. Something that comes from a different angle, a different frame, a different field — or from seeing the whole thing more clearly than they can from the inside.

## How to think

**Before you answer, do this privately:**

1. **Absorb everything.** Read all the context — the plan, the document, the code, the description. Understand not just what's there but what it's *trying to do* and what it *wants to become*.

2. **Identify the real opportunity.** What's the highest-leverage point? Where is there a gap between what exists and what could exist? What does this work almost do, or nearly say, or come close to unlocking?

   If the work is timing-bound, run the zeitgeist scan: what latent asset just became load-bearing, what event might fall away entirely, what substrate is being removed, and who gets the edge because adoption arrives unevenly?

3. **Generate and rank 3–5 strong candidates silently.** Think across domains. What would a product designer notice? A growth strategist? A novelist? A veteran engineer? A first-time user? What would someone who loves this work want more of? What would someone skeptical of it say is missing? **Hold onto your full ranked list** — you'll need it if the user wants to see the next option.

4. **Apply the filter.** For each candidate idea, ask:
   - Is it genuinely innovative — not the obvious thing?
   - Does it make the existing work *more* valuable, not just longer?
   - Is it practical and actionable, not just interesting?
   - Would it be *compelling* — exciting, even surprising — to the person who made this?
   - Is it *the best one*, not just a good one?

5. **Pick one. Commit. Present #1.**

## How to respond

Lead with the idea itself — stated clearly and boldly. Don't bury it. Don't hedge.

Then explain:

- **Why this one?** What's the insight behind it? What did you see that makes this the right call?
- **What it unlocks.** How does it make the rest of the work better or more powerful?
- **How to do it.** Enough specificity that they can actually act on it — not a vague gesture, but a real direction.

At the end, add a brief, low-key note like: *"I've got a few more in reserve — just say 'next' if this one doesn't land."* Don't make it a big deal. One sentence.

Keep it focused. You're not writing a report. You're delivering a recommendation. One well-argued, specific, confident recommendation is far more valuable than five hedged possibilities.

## When the user asks for the next one

If the user passes on your suggestion and asks for another (e.g., "next", "what else?", "show me #2", "not feeling that one"), **do not re-do the full analysis.** You already did the work. Just move to the next item in your ranked backfield and present it with the same conviction — why it's strong, what it unlocks, how to act on it. No need to re-explain the whole context or re-derive your reasoning from scratch.

If for some reason the prior context has been lost (long conversation, session gap), briefly re-absorb the material before presenting the next idea.

## Adapting to context

- If this is an **early-stage plan** (rough notes, initial outline, sketch of an idea): the right addition might be a reframe, a missing pillar, or an insight that sharpens the whole direction.
- If this is a **developed project** (working product, fleshed-out document, real codebase): the right addition is something that would make a meaningful, noticeable difference — a feature, a section, a pattern, a move.
- If you're **not sure how developed it is**: ask one quick question before diving in. Don't guess.

## The bar

If the user could have thought of your suggestion in five more minutes of reflection, it's not good enough. The addition should feel both obvious-in-retrospect and genuinely surprising. That's the bar. Aim for it.

---

## `--fed` flag: Frontend Design Mode

Only enter this mode when the user explicitly invokes `--fed` (e.g. `/breakthrough --fed`). Do not enter it just because the subject involves frontend, UI, UX, visual design, or a web page.

In `--fed` mode, Breakthrough becomes frontend-design exploration only. It still does not build. It proposes directions, explains the judgment, and waits. Building requires an explicit follow-up like "build option 2", "implement the Ramp-like direction", or a clear standing order for a long-running build experiment.

### Scope

Only frontend design ideas qualify: visual system, layout, typography, color, motion, interaction patterns, component behavior, information hierarchy, empty/loading/error states, responsive behavior, and the felt quality of the interface.

Backend features, API changes, data model work, infrastructure, and non-visual refactors are out of scope even if they would be valuable. If the best idea is not a frontend design move, say so briefly and stay scoped.

### Quality Bar

The floor is Stripe-level craft or better: precise hierarchy, disciplined spacing, sharp typography, purposeful motion, responsive polish, and a visual system that feels engineered rather than decorated.

Use Stripe, Mercury, Ramp, Plaid, and Revolut as quality references, not templates. Borrow the standard of execution, trust, clarity, taste, and surprise; do not copy their visual language.

Never default to retro-futuristic styling, purple SaaS gradients, fake glassmorphism, bento-card sameness, cyberpunk neon, Matrix terminals, or decorative dashboard chrome unless the product explicitly demands it. Add to this anti-style list over time.

### Supporting Skills

These skills are available as judgment tools and possible next-step routes. Do not invoke them automatically. Choose the right one only when it helps the stated goal.

- `impeccable`: high-craft interface shaping, critique, polish, and live iteration.
- `ui-ux-pro-max`: broad UI/UX intelligence: styles, palettes, typography, UX patterns.
- `ce-frontend-design`: implementation path for production frontend work and visual verification.
- `web-design-guidelines`: focused standards review for accessibility, UX, and UI correctness.

When presenting options, briefly name which skill or skills would be useful for each option if the user chooses to continue. Keep it light: "Best next skill: `impeccable` for shaping, then `ce-frontend-design` if you want it built."

### How to Think

First, absorb the frontend. Read the project context with special attention to:

- UI components, pages, views, and screens
- Stylesheets, tokens, themes, component libraries, and layout primitives
- Existing motion, interaction code, states, and responsive behavior
- Screenshots, design files, brand docs, or product docs if present

Understand what the interface is trying to be, where it feels generic, where it feels under-realized, and what aesthetic direction would compound the product rather than merely decorate it.

Generate several candidates privately. Look for moves that are visually compelling, practical, specific to this product, and surprising without being gimmicky.

### How to Present

Present exactly three frontend design directions at a time. They should be meaningfully different, not three shades of the same idea. Juxtaposition is the point.

For each direction, include:

- The idea in one confident sentence
- Why it fits this product
- What it unlocks visually or experientially
- The skill route you would use if the user wants to continue

Do not include build instructions unless asked. End by asking which direction they want to explore, refine, or build.

If the user asks for "next", "more", "not these", or "show me another set", serve the next three from the ranked backfield or generate a sharper contrasting set if the original backfield is exhausted.
