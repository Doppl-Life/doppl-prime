# The Hut — the proposal space (still wet)

Where unfrozen decisions are shaped before they freeze out into canon. The frozen model lives in
[`../../contracts/`](../../contracts) (typed shapes), [`../../mechanics/`](../../mechanics) (kernel
behavior), and [`../GLOSSARY.md`](../GLOSSARY.md) (vocabulary). This folder holds only what is still
being decided.

**Provisional by design.** Decisions here are live until frozen on purpose. When a decision settles,
it moves out to contracts/mechanics and its hut draft is deleted — don't let the hut grow a second
copy of something that already froze.

## Rule of the hut

- **A live proposal beats the kernel.** When a hut decision and the running kernel (`src/`, `tools/`)
  disagree, the decision wins once frozen; the kernel follows, deliberately.
- **Decide here in writing, then freeze out.** Change the decision here first; freeze it into
  contracts/mechanics; the kernel catches up as its own step.
- **No panic runs into the jungle.** The kernel differs on purpose. Reconciliation is planned.

## The files

- `PROPOSAL.md` — the current frame and open proposals. **Start here.**
- `README.md` — this file.
- `flow.svg` — the flow diagram.

## Known divergences from the kernel (reconcile later, deliberately)

- Decay — canon: active decay is `0`; `temporal` preserves the seam for a later mechanism.
- Leaf name — canon: `doppl` (was `pepsi`).
- Identity — canon: `SlugId` (`{slug}-{shortId}`), lineage as a body `prev_id` wikilink, no stored `root` (walk `prev_id`).
- Reseed — canon: a doppl may reseed into a fresh `case_study` (the forest loop), carrying a non-null `prev_id`.
- Lineage memory — canon: the node graph is the memory (`doppelgangers` + derived `convergence`); no separate ledger.
