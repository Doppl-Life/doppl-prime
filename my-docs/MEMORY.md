# Kernel Memory

Active fork decisions that still constrain this kernel. Record only choices the
kernel owner must not accidentally undo.

## Entries

### Product I/O is the configured agarden - 2026-06-23

- **Chose:** product input and output are configured agarden node files.
  The local default is the sibling `../agarden` Obsidian vault.
  `case_study` seeds, generated `problem_recovery` nodes, generated `doppl` nodes, reseeded `case_study` nodes, admitted `stock`, and the ratings ledger live there.
  In-repo deterministic fixtures live under `test/fixtures/**` and are only a harness for repeatable tests and demos.
  doppl-prime is the kernel, contracts, compiler, and dashboard; agarden is the durable node and stock surface.
- **Over:** keeping product seed material vendored in this repo, treating JSON fixtures as product input, or writing product outputs to local drill-down folders.
- **Because:** the product loop is nodes in, nodes out.
  The kernel may inspect and use existing stock before research, then write only stock that supports surviving output nodes.
  Agenomes are inner runtime candidates under selection; only survivors compile into agarden nodes.
- **Revisit if:** the kernel still needs test fixture bridges for live product paths.
  Delete or isolate the bridge once generation and stock retrieval read directly from the configured agarden.

### Fixture generation is test-harness only - 2026-06-26

- **Chose:** product runs require live, replay, or CLI model generation providers.
  The kernel no longer falls back to deterministic fixture generation unless a test explicitly enables the fixture harness with `allowTestFixtureProviders` or `DOPPL_ALLOW_TEST_FIXTURE_PROVIDERS=true`.
  HTTP product routes also reject test fixture seed paths unless that harness gate is enabled.
- **Over:** silent fixture-backed product demos.
- **Because:** a product run must prove whether the agenome process works against configured agarden input and real/replayed model output.
  Fixture providers are regression scaffolding, not a substitute product engine.
- **Revisit if:** fixture generation appears in a non-test product path.
  Treat that as boundary drift and cut it back behind the harness gate.

### The hut is canon - 2026-06-22

- **Chose:** `my-docs/the-hut/**` is the protected inner source of truth for the
  model. A decision shaped in the hut is the truth carried outward; when the hut and
  the running kernel disagree, the hut wins and the kernel follows. Canon here means
  authoring authority, not a runtime role — the hut produces no nodes and sits outside
  the run chain (seed → discovery → engine → compile → sink → agarden).
- **Over:** treating the kernel code/specs as the source of truth, or letting the
  garden's standing assumptions and the jungle's calcified legacy drift back into an
  unfrozen decision.
- **Because:** the model is shaped deliberately in the hut; the kernel is legacy
  reconciled on purpose, not bedrock. The insulation is the point — it keeps a wet
  decision clean before it freezes.
- **Revisit if:** the hut is deliberately frozen into the kernel; then the
  frozen contract moves into `contracts/**` and the kernel.

### Burn-and-rebuild: old surface cut, engine promoted first - 2026-06-22

- **Chose:** burn the pepsi pipeline, the verdict/judgment stack, the
  viewer/deploy/microscope surface, the superseded engine specs, the original-Prime
  `docs/**` quarantine, and the old eval fixtures. Before burning, promote the
  generate→select engine contract into `mechanics/kernel/engine.md`.
- **Over:** surgically de-vocabularying dead surfaces, or burning the engine without
  first salvaging its contract.
- **Because:** the hut holds the model's spirit but not the engine internals; the
  engine had to be written down before the fire so it could regrow.
- **Revisit if:** a burned surface is deliberately replanted; build it from the
  hut, not by restoring the old file.

### subtype is now temporal - 2026-06-22

- **Chose:** replace the candidate `subtype` flavor with a `temporal` boolean.
  `true` = zeitgeist (180-day decay half-life); `false` = transfer (no decay).
- **Over:** the old multi-value subtype as decay driver, and the 730-day transfer
  half-life in the kernel.
- **Because:** the hut cut subtype to its one load-bearing axis — time decay.
- **Revisit if:** a second decay regime is genuinely needed; add it to `engine.md`
  first.

### Seed carries no classification - 2026-06-22

- **Chose:** the case_study seed is minimal — no subtype/classification field. The
  case-study corpus surfaces title and status only.
- **Over:** extracting and projecting a per-case subtype.
- **Because:** the hut seed template is minimal; classification is the judge's
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

### Distill, do not bulk import - 2026-06-21

- **Chose:** distill raw conversations, comparison docs, and legacy source into the
  hut, `contracts/**`, `MEMORY.md`, or fixtures; then delete the raw copies. Old
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

### The trace is the SSOT; views own their taxonomies - 2026-06-25

- **Chose:** the kernel does NOT adopt melissa's candidate taxonomy. The trace is the
  specimen; melissa's dashboard, michael's node, and cody's organism-view are sibling
  *projections* of it. A creativity-subtype (`cross_domain_transfer` | `zeitgeist_synthesis`)
  is melissa's *view model*, so it lives in her projection — derived cheaply at render time
  from the candidate the trace already carries — not in canon. The only canon question is
  "what must the trace record": a rich-enough candidate (mechanism, claim, lineage, scores)
  that any view can project from.
- **Over:** importing a view's model into the specimen — letting melissa's dashboard shape
  dictate the kernel's contracts. Also over: a paid, recorded, model-call classification that
  over-invests in one view's lens.
- **Because:** "every human surface is a projection of the trace." Classification is only
  kernel-and-canon work if deciding the subtype needs *compute you don't want to repeat* (an
  LLM call → call once, record on trace). A cheap heuristic does not — it's a projection
  concern, so the kernel stays view-agnostic and canon grows by zero. (Lean: keep it cheap or
  skip it; don't canonize a label.)
- **Live canon question (reframed onto the trace):** dalton's trace *events* are thin (ids);
  the rich candidate sits in the run aggregate / `run-index`. So the real `run-trace.md`
  question is whether the trace carries rich candidates, or whether views read the aggregate.
  That — not melissa's subtype — is what to settle. Lifecycle-event reshaping
  (`dashboard-envelope.ts`) already lands the non-rich slice.
- **Revisit if:** subtype classification turns out to genuinely need a model call (then it
  becomes a recorded trace field — and only then does canon grow by one field).
- **Supersedes:** the earlier same-day "kernel adopts melissa's taxonomy" call — reversed by
  first-principles ([[the hut]]): michael's contracts are I/O artifact shapes, the trace is
  the boundary record, and a view's taxonomy is not canon.

### Trace richness stops at projection-neutral machine facts - 2026-06-25

- **Chose:** `RunTrace` carries the machine facts needed to explain and project a run: generated candidates, measurements, selection decisions, lens result, judge result, and compiler output.
  Rich dashboard objects are built at the dashboard adapter boundary from those trace or aggregate facts.
  A view-owned taxonomy is recorded only when the derivation requires non-repeatable compute, and even then the trace records the neutral fact, not the view's object model.
- **Over:** treating the current run aggregate / `run-index` as a second source of truth for
  facts the trace must explain, or inflating `RunTrace` with dashboard payload shapes.
- **Because:** trace truth has to support multiple projections without adopting any one projection's model.
  The dashboard needs rich objects for rendering, but that is a view contract; the kernel needs enough trace facts for every projection to rebuild its view deterministically.
- **Revisit if:** a projection needs a fact that cannot be derived from the trace and is not merely display shape.
  Add that fact to `contracts/run-trace.md` first, then update the kernel and adapters.
