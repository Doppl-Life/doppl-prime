# Contracts

The MarkScript contracts for the model — what each durable artifact must contain so a human can read it and a parser can recover it. The **model** is defined in the hut ([`my-docs/the-hut/**`](../my-docs/the-hut)); a contract here is where a hut decision lands once it is deliberately frozen into the kernel. `MEMORY.md` records fork decisions.

> Not to be confused with the kernel's **boundary contracts** — the runtime module-I/O packets — which live beside their code at [`src/kernel/contracts.ts`](../src/kernel/contracts.ts). These are *model artifact* contracts; those are *runtime boundary* contracts.

## Cross-document links

Every cross-document reference in these artifacts is an **Obsidian-compatible wikilink**: `[[slug-id]]` to address a file, `[[slug-id#^block-anchor]]` to address a specific block within it. Plain slug strings (`field: battery-supply`) are not links — Obsidian will not resolve them in the graph view. When a contract names a field, source, or discovery, render it as a wikilink. Lineage (`prev_id`) and any other link-bearing values live in the markdown body, never frontmatter, because Obsidian does not resolve `[[...]]` inside YAML.

## The model in one breath

Two object classes: the **flow** (the chain, folded one immutable node per step) and **stock** (durable domain memory the flow reads and writes). The spine is `case_study → problem_recovery → doppl`; each arrow is one pass of the engine, and **discovery** is a tool the growth stages call, not a stage. A doppl can be reseeded into a fresh case study — the forest loop. The contracts below are the typed shapes these objects take; how the kernel *behaves* (engine, discovery, compiler) lives in [`../mechanics/kernel/`](../mechanics/kernel).

## MarkScript

[`markscript.md`](./markscript.md) is the self-contained framework these contracts are written in. It also owns the structural standard library — the types (`MarkdownFile`, `MarkdownSection`, `MarkdownSubsection`, `NonEmptyArray`, `SlugId`, `Iso8601`) every contract imports rather than redeclares. One concept gets one owner: each type is declared in a single contract and pulled in elsewhere by `@`-referencing the owning file in an **External contracts** section.

## Draft MarkScript contracts

These are working contracts, not frozen kernel contracts yet:

- [`node.md`](./node.md) — the markdown node file shape.
- [`run-trace.md`](./run-trace.md) — the machine trace for one engine pass and compiler handoff.
- [`projection.md`](./projection.md) — the field-by-field map from `RunTrace` to a compiled node.
- [`rating.md`](./rating.md) — the rating scale, judge evaluation, human score projection, and temporal policy.
- [`human-ratings-ledger.md`](./human-ratings-ledger.md) — the human rating source and projection contract.
- [`stock.md`](./stock.md) — the stock field source/projection contract.

If a new doctrine affects how the kernel runs or is judged, freeze it here. If it only records
why we chose a fork, put it in [`../my-docs/MEMORY.md`](../my-docs/MEMORY.md).
