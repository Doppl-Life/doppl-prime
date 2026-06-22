---
name: discovery
description: >
  Kernel function. A round trip a stage calls to gather context: read the stock field, reach the web,
  score finds, promote the keepers into stock, and return the pulled-together context to the caller.
trigger: >
  Called by problem_recovery or doppl when a stage needs more context, a missing fact, or a cost it
  can't yet estimate. Never called by case_study (a seed doesn't search; it just starts).
kind: kernel function · markdown-as-code · modular tool interface
---

# discovery

A round-trip tool. The calling stage hands discovery a focus; discovery returns context and (as a
side effect) enriches the stock field. The stage then finishes. Discovery is what was *found*; the
stage's Growth is what was *concluded*.

## Inputs

- `focus` — what the stage needs (the recovered problem, the doppl claim, or a specific gap).
- `field_id` — the stock field for this domain (read what's known; write what's new).
- `temporal` — whether the work is timing-bound (governs decay/expiry of zeitgeist finds).

## Procedure

1. **Read the stock field first.** Pull existing load-bearing facts for `field_id`. Free, and first.
2. **Reach the web** through the modular backend (see Backends). Collect raw finds.
3. **Score each find `−5…+5`** (novelty + grounding against the focus). A *find* is anything
   retrieved; a *discovery* is a find that clears the bar (≥ **+3**). Below the bar = scratch, not
   promoted. find → discovery is the flow→stock boundary.
4. **Enrich, don't duplicate.** For each discovery, classify against the field: rehash → drop,
   enrichment → merge, new → add. Never write the same fact twice; log why.
5. **Decay / expire.** Zeitgeist finds decay over time and expire below the floor; transfers don't.
6. **Return** the pulled-together context to the caller, and **write** new discoveries to the stock
   field with provenance.

## Backends (modular — add a tool, don't hardcode)

- now: web search across source recipes (hackernews, arxiv, github-trending, sec-edgar, …).
- later: a large-scale Karpathian deep-research skill for "go off and find it" runs.
- The verb is `discover`; backends are swappable behind it.

## Rules

- Discovery is **not** rated by humans. It is gated here, by the bar.
- One verb, many backends. The calling stage doesn't know or care which backend ran.

## Reconcile later (jungle)

`tools/source-radar.ts` already implements most of this: source recipes, three discovery lenses
scored `−5…+5` (hit +3, trap −3), decay half-lives, expiry thresholds. That is the backend to wire
in — after settling the scale/decay conflicts in `rating-inventory-draft.md`.
