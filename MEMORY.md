# Kernel Memory

Active fork decisions that still constrain this kernel. Record only choices the
kernel owner must not accidentally undo.

## Entries

### The garden is canon - 2026-06-22

- **Chose:** make `my-docs/garden/**` the operating canon for the model. When the
  garden and the running kernel disagree, the garden wins; the kernel follows.
- **Over:** treating the kernel code/specs as the source of truth for the model.
- **Because:** the model is being shaped deliberately in the hut; the kernel is
  legacy reconciled on purpose, not bedrock.
- **Revisit if:** the garden is deliberately frozen into the kernel; then the
  frozen contract moves into `specs/**` and the kernel.

### Burn-and-rebuild: old surface cut, engine promoted first - 2026-06-22

- **Chose:** burn the pepsi pipeline, the verdict/judgment stack, the
  viewer/deploy/microscope surface, the superseded engine specs, the original-Prime
  `docs/**` quarantine, and the old eval fixtures. Before burning, promote the
  generate→select engine contract into `my-docs/garden/engine.md`.
- **Over:** surgically de-vocabularying dead surfaces, or burning the engine without
  first salvaging its contract.
- **Because:** the hut holds the model's spirit but not the engine internals; the
  engine had to be written down before the fire so it could regrow.
- **Revisit if:** a burned surface is deliberately replanted; build it from the
  garden, not by restoring the old file.

### subtype is now temporal - 2026-06-22

- **Chose:** replace the candidate `subtype` flavor with a `temporal` boolean.
  `true` = zeitgeist (180-day decay half-life); `false` = transfer (no decay).
- **Over:** the old multi-value subtype as decay driver, and the 730-day transfer
  half-life in the kernel.
- **Because:** the garden cut subtype to its one load-bearing axis — time decay.
- **Revisit if:** a second decay regime is genuinely needed; add it to `engine.md`
  first.

### Seed carries no classification - 2026-06-22

- **Chose:** the case_study seed is minimal — no subtype/classification field. The
  case-study corpus surfaces title and status only.
- **Over:** extracting and projecting a per-case subtype.
- **Because:** the garden seed template is minimal; classification is the judge's
  `temporal`, set on later nodes, not the seed's.
- **Revisit if:** a downstream consumer needs a seed-level classification; add it as
  explicit case metadata.

### Trace is source of truth - 2026-06-21

- **Chose:** `buildRunTrace()` remains the canonical pipeline; every view is a
  projection of one trace contract.
- **Over:** view-specific trace assembly, static narratives, or generated reports
  acting as truth.
- **Revisit if:** a new artifact needs data not expressible in `RunTrace`; then
  extend the contract deliberately.

### Kernel-only project shape - 2026-06-21

- **Chose:** make this kernel project the only substantive surface.
- **Over:** duplicate planning docs, shadow hubs, parallel servers, and retired
  experiment shells.
- **Because:** fake authority accumulates — many stale ways to read or run the same
  thing.
- **Revisit if:** a deploy target requires an explicit adapter boundary.

### Case-study access boundary - 2026-06-21

- **Chose:** generation reads case packets; judgment may read solution packets.
- **Over:** wholesale answer-key visibility.
- **Because:** leakage turns evaluation into answer coaching. Enforced by the seed
  leakage guard (`pnpm case-study:lint`).
- **Revisit if:** the corpus moves to a production evaluation harness with stricter
  roles.

### Skill lineage is registry, not storage - 2026-06-21

- **Chose:** skill expressions stay in their owning runtime dirs; `skills/LINEAGE.md`
  tracks pedigree.
- **Over:** moving every skill into one tree or symlinking external folders.
- **Revisit if:** a portable skill needs a real storage home.

### Distill, do not bulk import - 2026-06-21

- **Chose:** distill raw conversations, comparison docs, and legacy source into the
  garden, `specs/**`, `MEMORY.md`, or fixtures; then delete the raw copies. Old
  source is raw material, not operating authority.
- **Over:** preserving a live museum of transcripts and inherited planning docs.
- **Because:** old source becomes fake authority unless it is a build contract or an
  explicit decision.
- **Revisit if:** a source is legally/scientifically required as provenance for a
  promoted fixture; then make that boundary explicit.

### Object-level operating docs - 2026-06-22

- **Chose:** operational docs state commands, contracts, boundaries, and forbidden
  duplicates — not placement language or tautological location notes.
- **Over:** placement/transfer/provenance framing that makes future agents inherit
  the old frame instead of the operating contract.
- **Revisit if:** a deployment or ownership boundary is truly active.

### Cleanup machinery does not survive cleanup - 2026-06-22

- **Chose:** after a cleanup pass, delete the temporary scans, dead-name lists, and
  one-off guards created to perform it.
- **Over:** preserving "not this" machinery inside the kernel after the old surface
  is gone.
- **Because:** remembering the rejected frame turns cleanup residue into new fake
  authority.
- **Revisit if:** a cleanup check becomes an object-level contract with a named owner
  and failure mode.
