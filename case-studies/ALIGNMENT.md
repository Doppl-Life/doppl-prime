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

## Flagged proposals (NOT yet applied to the binding architecture)

`ARCHITECTURE.md` is the governed source of truth and is intentionally left unchanged here. The items below are proposals for the orchestrator/governed cross-doc process, not implementer edits.

### P1 — Promote Problem Recovery into the runtime (original proposal)

If the team later wants Problem Recovery to be first-class in the runtime (rather than a harness/eval-only stage), the minimal change is:

- Add an optional, subtype-agnostic `problemRecovery` output to the candidate lifecycle — either as a pre-`CandidateIdea` reasoning artifact persisted on `agenome`/`candidate.created`, or as an optional field on `CandidateIdea` consumed by the `final_judge` before scoring the subtype payload.
- Extend `FinalJudgeRubric` (Appendix A) with a `frame_recovery` axis (today the harness scores this; the §7 judge does not).

### Zeitgeist-driven proposals (from authoring the first `zeitgeist_synthesis` fixtures)

The schema and Problem-Recovery model were shaped largely by the behavioral/transfer cases. Drafting `glp1-snack-demand-destruction` and `ai-overviews-zero-click-publishing` surfaced fields that fit zeitgeist poorly or are missing. P2–P4 are **local case-studies/ edits** (safe, no contract impact); P5–P7 are **contract-level**, flagged here, not applied to `ARCHITECTURE.md`.

#### P2 (local) — Add a "why-now / timing recovery" element to Problem Recovery

Problem Recovery has `hidden_variable` but no explicit timing slot. For zeitgeist the hidden variable almost always *is* a misread of why-now, and the discriminator is a timing test. Proposal: add an optional `why_now_recovery` field to the Generated Output Contract in `case-study-schema.md` ("what specifically changed recently that makes this the live problem now, and why the obvious timing story is wrong"). Subtype-agnostic — transfer cases may leave it empty — so it does not violate Decision 1.

#### P3 (local) — Add current-signal grounding + falsifiability slots to Evaluation Focus

`evaluation_focus` has no place to assert *which dated signals* a strong answer must ground in, or *which prediction* must be falsifiable. Proposal: add optional `required_current_signals[]` and `falsifiability_target` to the Evaluation Focus section so the held-out judge can score the zeitgeist subtype checks (grounding, falsifiability) precisely instead of via prose `scoring_notes`.

#### P4 (local) — Codify the zeitgeist `solution` convention

`solution.{summary, details, ...}` is transfer-shaped ("an intervention"). For zeitgeist the generated unit is a `ZeitgeistSynthesisPayload` (thesis/audience/currentSignals/whyNow/falsifiablePredictions/comparablePriorArt). The two drafted cases populate `solution.details` with those explicit payload fields; `case-study-schema.md` should note this convention so all zeitgeist cases render the payload consistently. Likewise note that for zeitgeist, `failed_attempts` ≈ "the consensus plays implied by the hype narrative" (mirroring how the yacht "open" case demoted the standard answer into Failed Attempts).

#### P5 (contract) — `frame_recovery` axis, now with zeitgeist evidence

P1's `frame_recovery` proposal is strengthened: the two zeitgeist cases show frame recovery ≈ why-now recovery, i.e. it is a genuinely cross-subtype axis worth promoting from the harness into the §7 `FinalJudgeRubric`.

#### P6 (contract/rubric) — Define the zeitgeist `subtype_check_pass` set

`evaluation-rubric.md` currently binds `subtype_check_pass` to "`cross_domain_transfer` checks for this corpus." With zeitgeist cases present, the rubric should enumerate the zeitgeist checks (grounding-in-current-signals, novelty, audience/market-timing, internal-coherence, falsifiability — from `DOMAIN_MODEL.md` §6) so the judge has a concrete checklist for both subtypes. This is a rubric edit (safe) plus a one-line note in Decision 3 that the single scoring model now covers both subtype check sets.

#### P7 (contract) — `CaseSeed` provenance must separate agent-visible signals from evaluator-only targets

`schema-to-contract-mapping.md` maps `source.fidelity` to `seed.provenance`. Zeitgeist cases live or die on dated, cited current signals, and those signals are partly *agent-visible input* (needed to synthesize) while the required-signal targets and the withheld thesis are *evaluator-only*. The importer's leakage check must therefore distinguish "agent-visible current signals" from "evaluator-only required-signal targets + withheld thesis" — a sharper boundary than the transfer cases needed.
