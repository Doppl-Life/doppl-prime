# Case Studies — Alignment With Doppl

This folder was imported from another repo. This note records how it maps onto Doppl's binding contracts (`ARCHITECTURE.md`, `docs/planning/DOMAIN_MODEL.md`) and the prototype that consumes it (`docs/prds/06-case-study-intake-prototype-prd.md`). It is the alignment anchor for the folder; the schema, rubric, and individual case files conform to the decisions below.

## Decision 1 — Problem Recovery is a shared upstream stage, not a subtype

Doppl freezes `CandidateIdea` to exactly two subtypes (`ARCHITECTURE.md` §3 + Appendix A, `DOMAIN_MODEL.md`):

- `cross_domain_transfer` — map a technique/result/pattern from source domain A onto a target problem in domain B.
- `zeitgeist_synthesis` — a thesis/framing fitted to current signals that survives adversarial scrutiny.

The case-study harness adds a two-output contract: `problem_recovery` first, then `solution_generation`. These do **not** introduce a third subtype. Instead:

- **`solution_generation` maps directly onto `CandidateIdea`** (the canonical unit of work). The generated `solution` fields are the candidate.
- **`problem_recovery` is a shared, subtype-agnostic reasoning stage that runs *before* solution generation.** It applies equally to both subtypes and is judged first (see `evaluation-rubric.md`).
- **Every case is tagged with the subtype its solution represents** (see Decision 2). Most behavioral cases in this folder are `cross_domain_transfer` — they transfer a behavioral / physical / psychological technique onto a target operational problem.

This keeps the imported material compatible with the frozen contracts without expanding subtype scope.

## Decision 2 — Subtype tagging

Each case study declares a `subtype` (`cross_domain_transfer` | `zeitgeist_synthesis`) in its problem-statement / withheld / with-solution files, so that the §7 / PRD 11 subtype-specific checks have something to bind to when a case becomes a run seed. The per-case assignments and rationale live in `subtype-index.md`.

## Decision 3 — One scoring model

The harness rubric (`evaluation-rubric.md`) and the §7 held-out judge are reconciled so there is a single scoring definition: Problem Recovery is a gating pre-stage, and Solution Generation is scored on the §7 axes. See `evaluation-rubric.md` for the reconciled mapping.

## Decision 4 — Packet → seed contract mapping

The markdown packets are fixtures (PRD 06). `schema-to-contract-mapping.md` defines how each schema field maps onto `RunConfig` / the agent-visible seed packet and onto the evaluator-only boundary, so the PRD 06 graduation path (promote packets into first-class run seed records) has a concrete target.

## Decision 5 — Folder placement

`ARCHITECTURE.md` §2.5 describes a pnpm monorepo (`packages/contracts`, `apps/api`, `apps/web`, `packages/observability`) with replay fixtures under `fixtures/replay/`. That scaffold does **not exist yet** — the repo is currently planning-stage (`docs/`, `case-studies/`, architecture/plan docs only).

Resolution: keep `case-studies/` at the repo root as the canonical fixture source for now. It is a distinct asset class (case-packet fixtures consumed by PRD 06), not replay event artifacts, so it does not belong under `fixtures/replay/`. When the monorepo scaffold lands, relocate to `fixtures/cases/` (sibling of `fixtures/replay/`) and update the PRD 06 / system-map references in the same change. Moving now would only relocate one root dir to another and break relative paths for no functional benefit.

## Decision 6 — File conventions and source handling

Per-case files:

- `problem-statement.md` — canonical case description (all 12 cases have one; carries the subtype tag).
- `*-withheld-solution.md` — agent-visible packet (Problem Recovery + Solution sections left blank for the run).
- `*-with-solution.md` — evaluator packet with `evaluation_focus` + known `solution`.
- `*-unsolved.md` — evaluator packet for an **intentionally open** case (no known solution to withhold). Used in place of `*-with-solution.md`; currently only `jack-yacht-connectivity-continuity`. This naming is intentional, not an inconsistency.

Source handling: public cases consolidate their raw source inline in `sources.md` (Lists A/B). The NDA-constrained superyacht transcript is the exception — it is retained as a separate restricted file and cataloged as Source C in `sources.md` rather than reproduced inline. Named client/vendor/owner identifiers in that transcript have been redacted to generic descriptors; the derived `jack-*` case files are separately anonymized.

## Flagged proposal (NOT yet applied to the binding architecture)

`ARCHITECTURE.md` is the governed source of truth and is intentionally left unchanged here. If the team later wants Problem Recovery to be first-class in the runtime (rather than a harness/eval-only stage), the minimal change is:

- Add an optional, subtype-agnostic `problemRecovery` output to the candidate lifecycle — either as a pre-`CandidateIdea` reasoning artifact persisted on `agenome`/`candidate.created`, or as an optional field on `CandidateIdea` consumed by the `final_judge` before scoring the subtype payload.
- Extend `FinalJudgeRubric` (Appendix A) with a `frame_recovery` axis (today the harness scores this; the §7 judge does not).

This is a proposal for the orchestrator/governed cross-doc process, not an implementer edit.
