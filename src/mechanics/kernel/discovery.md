---
name: discovery
description: >
  Kernel function with one job: gather high-signal context for a stage. Read the stock field, reach
  the web, keep only what clears the signal bar, write the keepers to stock, and return the context
  to the caller. It does not score, decay, or judge — it finds.
trigger: >
  Called by problem_recovery or doppl when a stage needs more context, a missing fact, or a cost it
  can't yet estimate. Never called by case_study (a seed doesn't search; it just starts).
kind: kernel function · markdown-as-code · modular tool interface
---

# discovery

One job: find high-signal context and put it where the stage and the stock can use it. Discovery is
what was *found*; the stage's Growth is what was *concluded*.

What discovery does NOT do — other functions own these:

- it does **not score** finds — there is a bar to clear, not a number per item;
- it does **not decay or expire** anything — that is a separate maintenance function over the stock;
- it does **not care about temporal / zeitgeist** — that is a property of a node, not of a search.

## Inputs

- `focus` — what the stage needs (the recovered problem, the doppl claim, or a specific gap).
- `field_id` — the stock field to read from and write to.
- `config` — where the stock lives and how to write it (see Config).

## Procedure

1. **Read the stock field first.** Pull what's already known for `field_id`. Free, and first.
2. **Fetch** through the routed tool — web→firecrawl, youtube→gemini, x→grok, with fail-safe fallback
   down the chain to the reasoning provider's own search (see Backends). Collect raw material.
3. **The judge admits.** The judge (`cognition.judge`) reads the retrieved material and decides what
   clears the bar — high-signal, novel, grounded, non-duplicate. A gate (in or out), set high. This is
   the judge's *admission* function, distinct from rating Growth: the agent that decides what enters
   the garden.
4. **Write keepers to the stock field** through the sink, with provenance; don't duplicate what's there.
5. **Return** the kept context to the calling stage.

## Backends (modular — add a tool, don't hardcode)

- now: web search across source recipes (hackernews, arxiv, github-trending, sec-edgar, …).
- later: a large-scale Karpathian deep-research skill for "go off and find it" runs.
- The verb is `discover`; backends are swappable behind it.

## Config

Discovery must be told where things live and how to write them:

- `stock_location` — where the stock field / database is.
- `write_method` — how a keeper is appended or merged.
- `backend` — which discovery backend to use for this call.

`stock_location` and `write_method` are the **sink's** concern ([`sink.md`](./sink.md)): discovery reads and writes stock *through the sink*, whose destination is configured once (`doppl.config.json`). Only `backend` is discovery's own choice per call.

The stock source/projection shape is defined in [`../../contracts/stock.md`](../../contracts/stock.md).

## Boundaries

Source recipes (the backends) and source-quality signals live in `tools/source-radar.ts`. Scoring
and decay/expiry are not discovery's job: scoring belongs to the filter that sets the bar;
decay/expiry belongs to the stock-maintenance function.
