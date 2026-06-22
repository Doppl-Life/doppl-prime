# bedrock/signal/ - Agora verdict ledger

**Status:** this is a **schema + contract**, not a running service.
The append-only ledger (`verdicts.jsonl`) is created at runtime; only the `*.example.jsonl`
files are committed.

This is Bedrock check **#2: human judgment** — the first instance of the un-fakeable anchor
that actually exists alongside check #1, repo integrity; see [`../README.md`](../README.md).
A long-running kernel surfaces ideas to the **Agora** (a Slack/Discord channel); each
Agardener reaction is logged here as a **verdict** — a `(context, idea, judgment)` triple that
pays out as energy budget and feeds the collapse pipeline. See
[`../../GLOSSARY.md`](../../GLOSSARY.md) (Agora, Verdict) and
[`../../specs/fitness-selection.md`](../../specs/fitness-selection.md).

## The loop

```
kernel run ──► post (finalist OR side-idea, + provenance + trace link)
                   │
                   ▼
              the Agora  (Slack / Discord)
                   │  Agardener reacts: dimension + optional "because"
                   ▼
            verdicts.jsonl  (append-only, attributed)
                   │
        ┌──────────┴───────────┐
        ▼                      ▼
   energy budget        collapse pipeline
 (more/less spawns)   (promote skill / patch
                       agenome / write a BUGS entry)
```

The persistence, not the chat, is the point: a logged verdict becomes a
lineage's fitness history.

## Two kinds of surfaced idea: **sprout** vs **afrit** (process vs outcome)

A run mutates, diverges, and eventually converges. It throws off two *different* things, and
they must be judged on different axes:

| Kind       | Botanical rhyme | What it is | Judges | Pays out to |
| ---------- | --------------- | ---------- | ------ | ----------- |
| **sprout** | side-shoot mid-growth | "an idea popped up along the way — *send it*" | the **process** — is this lineage a good idea-factory? | **generativity** fitness |
| **afrit**  | the fruit it grew toward (A+fruit) | "this is the conclusion we came to — harvest it" | the **outcome** — did it arrive somewhere good? | **outcome** fitness |

Apply the **process-reward vs outcome-reward** split (PRM vs ORM) to idea generation.
They are not redundant: a spawner can be a brilliant *sprouter* whose *afrit* is weak, or a dull
journey with a strong conclusion. Keep **two energy ledgers**, not one — selecting only on
afrits starves the lineages that are most generative along the way (often the ones worth
breeding for sprouts and re-rolling toward a better afrit).

## Schema 1 — a post (kernel -> Agora)

```json
{
  "post_id": "p_2026-06-17_0001",
  "spawncidence_id": "crucible:run_42:node_3",
  "source_agenome": "transfer-hunter×feasibility-hawk:gen2",
  "kind": "sprout",                    // "sprout" (process) | "afrit" (outcome)
  "context": "Room Vitals prompt — what to monitor in a shared office",
  "idea": "Treat CO2 as a proxy for 'is this meeting over?' and auto-release the room booking.",
  "internal_score": 7.5,              // the internal critic/judge score (for the correlation gate)
  "cost_usd": 0.0031,
  "trace_link": "https://.../crucible_trace.html#node_3",
  "ts": "2026-06-17T20:00:00Z",
  "exploration": false                // true = deliberately random/low-score post (anti-survivorship)
}
```

## Schema 2 — a verdict (Agardener → ledger)

```json
{
  "post_id": "p_2026-06-17_0001",
  "spawncidence_id": "crucible:run_42:node_3",
  "kind": "sprout",                   // mirror the post's kind so process/outcome ledgers split cleanly
  "reactor": "mike",                  // attributed, NOT anonymous — needed for disagreeableness weighting
  "dimension": "novel",               // see reaction map below
  "because": "the booking-release angle is the actual product, not the CO2 reading",
  "weight": 1.0,                      // reactor disagreeableness weight (a Falsifier's 🧊 > an Optimist's 🔥)
  "ts": "2026-06-17T20:14:00Z"
}
```

## Reaction map (emoji → bedrock dimension)

| Emoji | Dimension   | Means                                  |
| ----- | ----------- | -------------------------------------- |
| 🔥    | `novel`     | cool / non-obvious / accretive         |
| ✅    | `feasible`  | actually buildable / useful            |
| ♻️    | `derivative`| tried before / obvious / low-lift      |
| 🧊    | `not-it`    | wrong / uninteresting / dead end       |
| 💬    | `because`   | (thread reply) richer signal, free-text|

Reactions are **dimensions, not one approval blob** — that is the counter-mutation to the
[politeness-inflation](../../BUGS_AND_MITIGATIONS.md) reward hack.

## Falsifiability (this is bedrock — it must be able to go RED)

- **Politeness mirror:** if dimension entropy collapses and every lineage stays fed → fail.
- **Survivorship leak:** if a proxy-Lα trained on these verdicts can't predict held-out
  *random* posts → the dataset is biased → fail.
- **Goodhart on cool:** if energy budget tracks 🔥-count alone (ignoring ✅/correlation) → fail.

See the three Agora entries in [`../../BUGS_AND_MITIGATIONS.md`](../../BUGS_AND_MITIGATIONS.md)
for repro triggers and pass/fail assertions.

## Deliberately NOT built yet

The webhook, the reaction listener, the energy-budget adapter, and the proxy-Lalpha. This
file is the contract they will honor. Build the dumb version first (post out -> append verdict)
before any ML; keep the human reaction *one* bedrock input, gated by downstream correlation.
