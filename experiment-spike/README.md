# Doppl — local idea-organism lab

A single-file, dependency-free web app that runs the Doppl pipeline on your own machine.
It stores everything in your browser's **IndexedDB** (a transactional document + graph store —
the browser's equivalent of an embedded database), uses **whatever model provider you already
have**, grows the graph **many generations deep**, and gives you **similarity search, clustering,
and a graph-aware chatbot** to make sense of the result.

> One file. No build step. No server required (but recommended). No mandatory cost.

---

## Run it

**Option A — open the file (fastest).** Double-click `index.html`. Everything works except calls
to a *local* model server (Ollama/LM Studio), because a `file://` page has a "null" origin those
servers reject. The **Offline demo** and **Harness bridge** providers work fine this way.

**Option B — serve it locally (recommended).** From this folder:

```bash
python3 -m http.server 5173
# then open http://localhost:5173
```

A real `http://localhost` origin makes local model servers reachable and avoids browser quirks.
Any static server works (`npx serve`, `php -S`, etc.). Your data lives in the browser profile you
open it with; use **⤓ Export** to move it (JSON bundle + a markdown file of every node).

---

## Providers — pick by budget

Generation is the **only** step that calls a model. Scoring, selection, the judge bridge, the graph,
**and all of the similarity/cluster analysis** are local and free, so the pipeline and the analytics
run end-to-end even with no key.

| Provider | Cost | Setup | Browser CORS |
| --- | --- | --- | --- |
| **Offline demo** | $0 | nothing | n/a — runs in-page |
| **Harness bridge** | $0 over your plan | paste prompt into Claude Code / opencode / Cursor / any chat, paste JSON back | n/a |
| **Ollama (local)** | $0 | install models, run `OLLAMA_ORIGINS=* ollama serve` | works once origins allow the page |
| **Groq** | free tier / cheap | base `https://api.groq.com/openai/v1` + key | works directly |
| **OpenRouter** | pay-as-you-go (free models too) | base `https://openrouter.ai/api/v1` + key | works directly |
| **LM Studio (local)** | $0 | start its server, base `http://localhost:1234/v1` | works |
| **OpenAI** | usage | base `https://api.openai.com/v1` + key | may need a proxy (no browser CORS) |

Open **⚙ Providers**, choose a mode, **Test connection**, then **Save**. Keys live only in your
local IndexedDB. The **Harness bridge** is the universal $0 path: when a model is needed, Doppl shows
the exact prompt, you run it in your agent, and paste the JSON back.

---

## The core loop

1. **Plant a seed** (left panel) — a case study, postulation, or contradiction. A seed has no scores;
   it's a start, not a claim.
2. **Recover the problem** — open the seed, click *Recover the problem* (converge dial). Doppl
   generates candidate problem-frames, scores each on novelty × grounding, keeps the Pareto
   survivors, and folds them in as `problem_recovery` nodes.
3. **Grow the doppls** — open a recovered problem, click *Grow the doppls* (diverge dial) to fan out
   distinct unlocks. Those leaves are your `doppl` nodes.
4. **Rate** any grown node with the human slider (−5…+5); the projection updates live.
5. **Reseed a leaf** to plant a new island from an unlock — closing the forest loop.

Reading the graph: node **colour** = stage (slate seed, violet problem, leaf-green doppl); **halo** =
the two fitness axes rendered as light (aquamarine novelty, amber grounding); **size** = judge score.
Each connected component is an **island**. Drag to move, scroll to zoom, **⊡** to fit.

---

## Campaigns — grow many generations deep

Instead of clicking stage by stage, a **campaign** auto-grows the graph by walking a frontier to a
target depth. Set it up in the **Campaign** panel:

- **Depth** — how many hops from the origin a lineage may reach.
- **Max nodes** — a hard safety cap so branching can't run away (each kept survivor branches by *Keep*).
- **Traversal** — **BFS** expands level-by-level (broad, balanced islands); **DFS** dives one lineage
  to depth first (deep, narrow chains).
- **Dial schedule** — **Auto** uses the principled schedule (converge to recover a problem, diverge to
  grow doppls); or pin Converge/Diverge for the whole run.
- **Reseed leaves** — the Doppl spine is only three stages (`case study → problem → doppl`), so to go
  *past* depth 3 the campaign turns each doppl leaf into a fresh case study and keeps growing. This is
  what makes "10 deep" real; depth is ultimately bounded by **Max nodes**.
- **Start from every seed** — run the campaign across all islands at once instead of just the selected node.

Press **▶ Run campaign**; watch the run console stream each breeding round with a progress bar, and
**■ Stop** at any time. Every round still does the full generate → score → select → fold pipeline, so
the proof board fills up as it goes.

---

## Analyze — similarity, clusters, doppelgängers

**⊕ Analyze** opens a workbench that runs entirely locally (TF-IDF vectors + cosine over every node's
text — no API, no cost):

- **Similarity** — pick a node *or* type free text, and get the cosine-ranked nearest neighbours.
  Matches are highlighted in the graph; click one to jump to it.
- **Clusters** — k-means over the node vectors for a chosen *k*. You get each cluster's members and its
  top terms, and can **Tint graph** to recolour every node by cluster (Clear tint to restore stages).
- **Doppelgängers** — find near-duplicate pairs above a similarity threshold, and **Mark** them to
  increment the `doppelgangers` count the contract already tracks — the system's built-in convergence
  signal, surfaced.

(If you have a live provider, you can still rely on local vectors here — analysis never needs the model,
so it stays free and offline.)

---

## Insights — chat with your graph

**✦ Insights** opens a chat drawer that answers questions about *your* graph. Before each reply it
builds a compact live summary — stage counts, islands and their sizes, strongest doppls by rating,
recent runs, and the selected node — and sends it to your provider. Ask things like *"what are my
strongest doppls?"*, *"what themes recur across islands?"*, *"what should I grow next?"*, or *"what can
I prune?"*. Suggested prompts sit above the input.

With a live provider (Ollama/Groq/OpenRouter/OpenAI) you get full conversational answers grounded in the
summary. In **Offline demo** mode a local heuristic still answers the common questions from the computed
stats, so the feature works with no key. Conversations persist across reloads.

---

## How it maps to the design doc

| App piece | Doppl contract |
| --- | --- |
| The dial (diverge/converge) | one kernel; the schedule *is* the application |
| campaign auto-dial | converge to recover the problem, diverge to grow doppls |
| novelty / grounding bars | the two warring fitness axes, kept separate until selection |
| selection (Pareto → floor → directional rank, keep top N) | `select.ts` |
| regret siblings in the console | proof the dial actually changes the run |
| judge evaluation (5 axes) | the measurement→rating bridge (`round(m×5)`; Cost-efficiency & Relevance judge-only) |
| human slider + projection | the human-ratings ledger materialised as `scores.human` / `scores.n` |
| node markdown body | MarkScript: Trace (verbatim) · Discovery · Growth · Path |
| islands + reseed + campaign depth | the forest topology: trees with a leaf→root feedback edge, grown deep |
| Analyze → doppelgängers | the `doppelgangers` convergence signal made visible |
| IndexedDB | the node graph *is* the lineage memory |

---

## Notes & limits

- **Offline-demo candidates are intentionally simple** — they synthesise from your seed's vocabulary to
  exercise the pipeline at $0. Wire a real model for substantive ideas; the demo is for feeling the flow.
- **Campaign cost.** Each breeding round is one model call. A deep campaign on a paid API is many calls —
  the **Max nodes** cap is your budget brake; start small.
- **Scaling.** The force layout is comfortable into the high hundreds of nodes; analysis is local and fast.
  Beyond that, lean on islands, clustering, and export/prune.
- **Privacy.** No telemetry. Nothing leaves the page except your chosen provider's API calls.
- **Reset.** Clear the site's IndexedDB in your browser dev tools to wipe all data.
