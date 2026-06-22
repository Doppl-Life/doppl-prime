# Kernel Memory

Active fork decisions that still constrain this kernel. Record only choices the
kernel owner must not accidentally undo.

## Entries

### Kernel-only project shape - 2026-06-21

- **Chose:** make this kernel project the only substantive surface.
- **Over:** duplicate planning docs, shadow hubs, parallel servers, and retired
  experiment shells.
- **Because:** fake authority had accumulated: many ways to read or run the same
  thing, most of them stale.
- **Revisit if:** a deploy target requires an explicit adapter boundary.

### Live viewer and deploy publisher are separate - 2026-06-21

- **Chose:** `pnpm serve` for local live views; `pnpm publish:html` for committed
  deploy pages plus generated deploy hub.
- **Over:** hub scripts, extra static servers, and `out/**` as a deploy input.
- **Because:** live rendering and deploy publishing can share render functions
  without sharing a server boundary.
- **Revisit if:** a deployment target cannot run the package commands directly.

### Trace is source of truth - 2026-06-21

- **Chose:** `buildRunTrace()` remains the canonical pipeline.
- **Over:** view-specific trace assembly, static narratives, or generated reports
  acting as truth.
- **Because:** every view must be a projection of one trace contract.
- **Revisit if:** a new artifact needs data not expressible in `RunTrace`; then
  extend the contract deliberately.

### Architecture v2 is a static design artifact - 2026-06-21

- **Chose:** keep `tools/microscope/architecture-v2.html` as explicitly static.
- **Over:** pretending it is trace-derived.
- **Because:** it is useful as a design fork, but it can drift from `/api/trace`.
- **Revisit if:** the map becomes a product surface; then bind it to trace data.

### Case-study access boundary - 2026-06-21

- **Chose:** generation reads case packets; judgment may read solution packets.
- **Over:** wholesale answer-key visibility.
- **Because:** leakage turns evaluation into answer coaching.
- **Revisit if:** the assay moves from local proof to a production evaluation
  harness with stricter roles.

### Skill lineage is registry, not storage - 2026-06-21

- **Chose:** skill expressions stay in their owning runtime dirs; `skills/LINEAGE.md` tracks
  pedigree.
- **Over:** moving every skill into one tree or symlinking external folders.
- **Because:** the durable object is lineage, not the expression path.
- **Revisit if:** a portable skill needs a real storage home.

### Bedrock signal is a contract, not a service - 2026-06-21

- **Chose:** keep Agora post/verdict schema, validators, and signal-label adapter
  in `tools/bedrock-signal.ts`.
- **Over:** building a Slack/Discord service before the kernel needs it.
- **Because:** the durable value now is the boundary and polarity mapping.
- **Revisit if:** human verdict capture becomes the next named vertical.

### Specs or memory, otherwise out - 2026-06-21

- **Chose:** distill raw conversations, comparison docs, panel notes, and legacy
  source archives into `specs/**`, `MEMORY.md`, and existing case fixtures; then
  delete the raw/archive copies.
- **Over:** preserving a live museum of transcripts, inherited planning docs,
  and source packets.
- **Because:** old source quickly becomes fake authority unless it is either a
  build contract or an explicit decision.
- **Revisit if:** a source file is legally or scientifically required as
  provenance for a promoted fixture; then make that provenance boundary explicit.

### This branch is Doppel Prime - 2026-06-22

- **Chose:** treat this branch as Doppel Prime without migration,
  compatibility, comparison, or derivative labels. `my-docs/**` belongs to this
  branch.
- **Over:** qualifying this branch, or letting original Prime docs under
  `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/planning/**`,
  `docs/prds/**`, and `docs/gap-audits/**` guide current architecture,
  requirements, repo shape, or implementation order by default.
- **Because:** this branch must be understood by what it is building now.
  Original Prime docs may be canonical elsewhere, but here they are quarantined
  reference material. Only promoted specs, memory decisions, `my-docs/**`, and
  current kernel behavior are authority.
- **Revisit if:** an inherited doc is deliberately promoted into an active
  contract; then move the specific claim into the owning spec or register rather
  than making the old doc authoritative again.

### Product comparison is demoted - 2026-06-21

- **Chose:** keep kernel contracts local and remove ongoing comparison docs.
- **Over:** measuring every kernel decision against the future product system while
  the kernel contract is still settling.
- **Because:** the kernel needs coherent contracts first; product integration is
  explicit migration work, not a standing doc frame.
- **Revisit if:** the user starts the product-branch migration.

### One canonical front door per job - 2026-06-22

- **Chose:** package scripts expose only blessed workflows; projection renderers
  stay implementation details behind `pnpm serve` and `pnpm publish:html`.
- **Over:** many top-level scripts for local static views, aliases, and
  exploration scaffolding.
- **Because:** single source of truth needs one operational entry point per job,
  or old doors become fake authority.
- **Revisit if:** a renderer gets a named user who needs it outside the local
  server or deploy publisher.

### Object-level operating docs - 2026-06-22

- **Chose:** operational docs state commands, contracts, boundaries, and
  forbidden duplicates.
- **Over:** placement language, transfer posture, provenance notes, and
  tautological instructions about location.
- **Because:** placement language makes fake authority: future agents inherit
  the old frame instead of the operating contract.
- **Revisit if:** a deployment or ownership boundary is truly active and must be
  named to prevent mistakes.

### Cleanup machinery does not survive cleanup - 2026-06-22

- **Chose:** after a cleanup pass, delete the temporary scans, dead-name lists,
  phrase blacklists, and one-off guards created to perform that cleanup.
- **Over:** preserving "not this" machinery inside the kernel after the old
  surface is gone.
- **Because:** remembering the rejected frame turns cleanup residue into a new
  source of fake authority. Durable checks should enforce what exists, not what
  used to be wrong.
- **Revisit if:** a cleanup check becomes an object-level contract with a named
  owner and failure mode.

### Conversation captures are retired - 2026-06-21

- **Chose:** move the durable ideas from raw conversation captures and source
  archives into specs and memory.
- **Over:** keeping transcripts as fallback context.
- **Because:** if the detail matters, it must appear in a spec, fixture, or
  register before the raw source disappears.
- **Revisit if:** a deleted raw source contained a missing constraint; recover it
  only into the owning spec or fixture, not as a restored archive.
