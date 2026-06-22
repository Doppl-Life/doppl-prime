# The Garden — where we scheme (single source of truth, still wet)

These files define the model we are building. This folder is the safe space. We operate from here.

**Canon, but provisional.** This is where we scheme together; it is not solidified. We shape the
garden — the garden does not shape us. Beware the inverse of the jungle trap: don't let the garden
quietly grow back into what it "wants" to be. Decisions here are live until we freeze them on purpose.

## Rule of the hut

- **This folder beats the kernel.** When these files and the live kernel (`src/`, `tools/`, `specs/`)
  disagree, this folder wins. The kernel is the jungle: legacy, reconciled later, deliberately.
- **"It's still in the kernel" is not an argument.** A concept being load-bearing there doesn't make
  it true here. A sprout in the kernel may be a weed here.
- **Decisions are made here, in writing.** Change the decision here first; the kernel follows.
- **No panic runs into the jungle.** It differs on purpose. Reconciliation is its own planned step.

## The files

- `object-model-draft.md` — stages, the node, dependencies, the diagram.
- `case-study-template-draft.md` — the seed node (minimal).
- `node-template-draft.md` — **the** node: one shape for every non-seed stage (shown as a full leaf).
- `stock-template-draft.md` — the stock field.
- `rating-model-draft.md` — the single source of truth for scoring.

## Known divergences from the kernel (reconcile later, deliberately)

- `subtype` — kernel: 9-value flavor + decay driver. Here: cut, except `temporal` (boolean) for decay.
- Verdicts `dead/obvious/interesting/investigate/keeper` — kernel: live. Here: dead; one −5…+5 human score.
- Decay — here: zeitgeist only; transfers don't decay.
- Leaf name — here: `doppl` (was `pepsi`).
