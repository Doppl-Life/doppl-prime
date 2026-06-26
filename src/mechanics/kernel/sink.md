# The Sink — the output destination

Compiled flow nodes and admitted stock discoveries are the durable artifacts a run produces. The
**sink** is the single thing that writes them. Pure `src/*.ts` stays compute-only; the sink is the
I/O edge. Nothing writes the vault except the sink.

## The interface

A sink persists the two durable artifacts and reads stock back so discovery can use it:

- `readStock(fieldId)` — what discovery reads before reaching outward.
- `writeStock(fieldId, markdown)` — admitted discoveries, in the [`../../contracts/stock.md`](../../contracts/stock.md) shape.
- `writeNode(node)` — the compiled flow node, in the [`../../contracts/node.md`](../../contracts/node.md) shape.
- `publish(message)` — push the vault to its remote. A seam; not built.

## The vault

One destination is one **vault** directory: `flow/<slug>/<slug>.md` for nodes, `stock/<slug>.md` for
fields, in the shapes the contracts define. Lineage is the body `prev_id` wikilink, not the directory.
The vault is also a git repo, so `publish` is just commit + push — an outward side effect built
deliberately, never on every write.

## Configuration

The destination is one config value: `doppl.config.json` → `vault`, defaulting to `../agarden`.
Change that one value to retarget every producer. The kernel writes through the sink directly.

## Producers

One thing produces vault content:

- **Kernel** (`pnpm grow`, Node) — runs a seed end-to-end (discovery → engine → compile) and writes
  the survivor and discoveries through the sink, directly into the configured vault.
