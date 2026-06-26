# The Hut — the proposal space (still wet)

Where unfrozen decisions are shaped before they freeze out into canon. The frozen model lives in
[`../../src/contracts/`](../../src/contracts) (typed shapes), [`../../src/mechanics/`](../../src/mechanics) (kernel
behavior), and [`../GLOSSARY.md`](../GLOSSARY.md) (vocabulary). This folder holds only what is still
being decided.

**Provisional by design.** Decisions here are live until frozen on purpose. When a decision settles,
it moves out to contracts/mechanics and its hut draft is deleted — don't let the hut grow a second
copy of something that already froze.

## Rule of the hut

- **A live proposal beats the kernel.** When a hut decision and the running kernel (`src/kernel/`)
  disagree, the decision wins once frozen; the kernel follows, deliberately.
- **Decide here in writing, then freeze out.** Change the decision here first; freeze it into
  contracts/mechanics; the kernel catches up as its own step.
- **No panic runs into the jungle.** The kernel differs on purpose. Reconciliation is planned.

## The files

- `PROPOSAL.md` — the current frame and open proposals. **Start here.**
- `README.md` — this file.
- `flow.svg` — the flow diagram.

## Reconciling the kernel

The kernel still differs from canon in places; bringing it in line is a planned step, not a fact to memorize. Why each decision was made lives in [`../MEMORY.md`](../MEMORY.md); what canon *is* lives in [`../../src/contracts/`](../../src/contracts) and [`../../src/mechanics/`](../../src/mechanics).
