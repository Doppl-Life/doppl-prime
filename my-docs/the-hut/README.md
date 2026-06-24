# The Hut — where we scheme (single source of truth, still wet)

These files define the model we are building. This folder is the safe space. We operate from here.

**Canon, but provisional.** This is where we scheme together; it is not solidified. We shape the
hut — the hut does not shape us. Beware the inverse of the jungle trap: don't let the hut
quietly grow back into what it "wants" to be. Decisions here are live until we freeze them on purpose.

## Rule of the hut

- **This folder beats the kernel.** When these files and the live kernel (`src/`, `tools/`, `contracts/`)
  disagree, this folder wins. The kernel is the jungle: legacy, reconciled later, deliberately.
- **"It's still in the kernel" is not an argument.** A concept being load-bearing there doesn't make
  it true here. A sprout in the kernel may be a weed here.
- **Decisions are made here, in writing.** Change the decision here first; the kernel follows.
- **No panic runs into the jungle.** It differs on purpose. Reconciliation is its own planned step.

## The files

- `PROPOSAL.md` — the proposed changes, for the team's review. **Start here.**
- `LEXICON.md` — the vocabulary we've legitimized (add to it as we coin terms).
- `object-model.md` — stages, the node, dependencies, the diagram.
- `case-study-template.md` — the seed node (minimal).
- `node-template.md` — **the** node: one shape for every non-seed stage (shown as a full leaf).
- `stock-template.md` — the stock field.
- `rating-model.md` — the single source of truth for scoring.
- `rating-inventory.md` — every scoring system, hut + jungle, and the conflicts to settle.
- `markscript.md` — the markdown-plus-TypeScript contract idiom used by the draft contracts.
- `discovery-skill.md` — kernel function: gather context (round trip).
- `compiler-skill.md` — kernel function: render a stage's output into a node.
- `engine.md` — the generate→select crucible behind each spine arrow, promoted from the
  kernel so the hut can regrow it after the burn.
- `flow.svg` — the flow diagram.

## Known divergences from the kernel (reconcile later, deliberately)

- `subtype` — kernel: 9-value flavor + decay driver. Here: cut, except `temporal` (boolean) for decay.
- Verdicts `dead/obvious/interesting/investigate/keeper` — kernel: live. Here: dead; one −5…+5 human score.
- Decay — here: active decay is `0`; `temporal` preserves the seam for a later mechanism.
- Leaf name — here: `doppl` (was `pepsi`).
- Identity — kernel: UUIDv4 `id` + `root` + `prev` in frontmatter. Here: `SlugId` (`{slug}-{shortId}`), lineage as a body `prev_id` wikilink, no stored `root` (walk `prev_id` to find it).
- Reseed — kernel: `case_study` is always a root. Here: a doppl may be reseeded into a fresh `case_study` (the forest loop), so a case study may carry a non-null `prev_id`.
