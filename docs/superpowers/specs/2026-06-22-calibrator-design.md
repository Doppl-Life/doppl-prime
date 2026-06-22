# Calibrator Design

Date: 2026-06-22
Branch: `calibration`
Status: Approved for implementation planning

## Purpose

Calibrator is a human review layer for Doppl outputs. It lets reviewers read a case study, inspect a proposed solution from a Doppl kernel or manual source, rate that solution on a `-5` to `+5` scale, and preserve the rating as a durable markdown artifact.

The markdown vault is the source of truth. The web app, API, database indexes, search, analytics, and future ingestion jobs are all derived from vault files.

## Context From Cody And Melissa Branches

The `cody` and `melissa` branches both treat `CandidateIdea` as the core output unit. A run produces candidates, reviewers or judges evaluate them, scoring policy produces fitness, and projections render lineage and observability.

Relevant findings:

- Both branches use case-study/problem input to seed runs, then generate structured candidate ideas.
- Both branches preserve machine evaluation through events such as `candidate.created`, `critic.reviewed`, `judge.reviewed`, `novelty.scored`, and `fitness.scored`.
- Cody has the stronger persisted judge output seam: `JudgeResult` records axis scores, acceptance, provider metadata, rubric policy version, and candidate id.
- Melissa has clear problem-text threading in generation: `RunConfig.problemText` and `problemTitle` are passed into candidate generation.
- Neither branch has a first-class human rating contract.
- Existing case-study docs already define a useful future split between `problem_recovery` and `solution_generation`, but MVP calibration should rate solutions only.

Design implication: Calibrator should not become a competing kernel. It should normalize outputs from Cody-style, Melissa-style, manual, or future kernels into a shared vault format and collect human ratings against those normalized solution artifacts.

## Product Scope

### MVP

The MVP supports solution-quality ratings only.

A reviewer can:

- Select a case study.
- Read case details and problem statement.
- Expand or collapse case details.
- Browse one or more solutions for that case.
- Expand or collapse solution details.
- See solution provenance, including source kernel when known.
- Choose a score from `-5` to `+5`.
- Add optional notes.
- Submit a rating.
- Persist the rating as a markdown file in the vault.

### Later

Later versions may add:

- Gauntlet email sign-in.
- Hosted submission API.
- Problem recovery ratings.
- Multi-axis rating rubrics.
- Reviewer assignment queues.
- Judge-vs-human comparison views.
- Downstream ingestion into Doppl runs, knowledge space, or analytics.
- Database/search indexes derived from the vault.

## Non-Goals

MVP will not:

- Build authentication.
- Require a database.
- Rate problem recovery separately.
- Merge Cody and Melissa branches.
- Run a Doppl kernel.
- Replace the event log or lineage graph.
- Make the UI state authoritative.

## Vault Model

The vault is a directory of markdown files with structured YAML frontmatter.

Recommended root:

```text
calibration-vault/
  cases/
    <case-id>/
      case.md
      problem.md
      solutions/
        <solution-id>.md
      ratings/
        <rating-id>.md
```

The app may also read existing source case studies from `case-studies/` and `case-studies-revised/`, then materialize normalized case files into `calibration-vault/`.

### Case Artifact

`calibration-vault/cases/<case-id>/case.md`

```yaml
---
artifact_type: case
case_id: fsd-accident-economy
title: When the Crashes Don't Come
source_paths:
  - case-studies/fsd-accident-economy/problem-statement.md
  - case-studies-revised/fsd-accident-economy/case-study.md
visibility: internal
created_at: 2026-06-22T00:00:00.000Z
---
```

Body contains reviewer-visible case context.

### Problem Artifact

`calibration-vault/cases/<case-id>/problem.md`

```yaml
---
artifact_type: problem
case_id: fsd-accident-economy
rating_target: context_only
source: case-study
---
```

Body contains the problem statement, problem discovery, or recovered problem. In MVP it is displayed for context but not rated.

### Solution Artifact

`calibration-vault/cases/<case-id>/solutions/<solution-id>.md`

```yaml
---
artifact_type: solution
case_id: fsd-accident-economy
solution_id: cand_rich_accident
title: Accident Economy Dependency Map
source_type: kernel
kernel: cody
branch: cody
run_id: run_123
generation_id: gen_2
agenome_id: age_7
candidate_id: cand_rich_accident
judge_score: 3.7
fitness_score: 0.81
created_at: 2026-06-22T00:00:00.000Z
---
```

Body contains the solution summary, details, claims, evidence, and any machine-generated explanation.

For manual or unknown sources, `source_type` can be `manual` or `unknown`, and kernel/run fields may be omitted.

### Rating Artifact

`calibration-vault/cases/<case-id>/ratings/<rating-id>.md`

```yaml
---
artifact_type: human_rating
rating_id: rating_20260622_001
rating_target: solution
case_id: fsd-accident-economy
solution_id: cand_rich_accident
score: 4
scale_min: -5
scale_max: 5
reviewer_email: reviewer@gauntletai.com
reviewer_name: Optional Name
submitted_at: 2026-06-22T00:00:00.000Z
app_version: calibrator-v0
---
```

Body:

```markdown
## Notes

Reviewer notes.

## Strengths

## Concerns

## What Would Improve It
```

For local MVP, `reviewer_email` and `reviewer_name` may be omitted or filled manually. Hosted versions should require authenticated reviewer identity.

## Data Flow

1. Importer reads existing case-study markdown and optional kernel output fixtures.
2. Importer writes normalized case, problem, and solution markdown into `calibration-vault/`.
3. UI reads the vault and builds a review queue.
4. Reviewer selects a case and solution.
5. UI displays case and problem context, solution details, and provenance.
6. Reviewer submits a score and notes.
7. Local MVP writes a rating markdown file directly to the vault.
8. Hosted beta posts the same rating payload to an API, which writes the markdown file to the vault-backed storage.
9. Downstream scripts ingest rating markdown for analysis, knowledge space, or future Doppl runs.

## UI Design

The user-facing app should be a review workbench, not a dashboard of internals.

Primary layout:

- Left rail: case selector, solution selector, rating progress.
- Center: case/problem context and solution details.
- Right rail or lower panel: rating controls and notes.

Core interactions:

- Case navigation uses previous/next controls and a searchable selector.
- Solution navigation uses previous/next controls and a searchable selector.
- Case details are expandable/collapsible.
- Solution details are expandable/collapsible.
- Rating is a stable `-5` to `+5` segmented or slider control with clear current value.
- Submit button is disabled until a score is selected.
- Submitted state shows the vault path of the saved rating.

The provided sketch maps naturally to this flow, but implementation should use a more review-friendly layout with readable text widths, strong provenance labels, and no hidden controls.

## Hosted App Readiness

The MVP should not require sign-in, but the schema must be ready for it.

Future hosted mode:

- Reviewers sign in with Gauntlet email.
- The app sends rating submissions to an API.
- The API validates identity, score range, solution id, and case id.
- The API writes rating markdown into vault storage.
- The API may maintain a database index, but the markdown rating remains authoritative.

Auth is provenance, not storage truth. If a database row disagrees with a rating markdown file, the markdown file wins.

## Integration With Doppl

Calibrator integrates with Doppl at the artifact boundary:

- Kernel outputs become solution markdown.
- Machine judge outputs become solution metadata.
- Human ratings become rating markdown.
- Future Doppl runs can ingest rating markdown as evaluation memory, training data, or selection feedback.

The calibrator should preserve source lineage when available: branch, kernel, run id, generation id, agenome id, candidate id, judge score, fitness score, and source paths.

## Error Handling

The app should handle:

- Missing case files: show an import error and skip the case.
- Missing solution files: show an empty solution state for that case.
- Invalid frontmatter: show validation errors with file path.
- Duplicate rating ids: generate a new id or ask before overwrite.
- Invalid scores: reject values outside `-5` to `+5`.
- Unknown reviewer in local mode: allow submission with `reviewer_email` omitted.
- Unknown reviewer in hosted mode: reject submission until authenticated.

## Testing Strategy

MVP tests should cover:

- Parsing valid case, problem, solution, and rating markdown.
- Rejecting invalid score range.
- Creating a rating markdown artifact from a submission.
- Preserving frontmatter fields needed for downstream ingestion.
- Loading existing `fsd-accident-economy` case context.
- Rendering collapsed and expanded case/solution details.
- Preventing submit without a selected score.

## MVP Defaults

- App location: use `calibrator/` at repo root unless a monorepo scaffold is adopted first.
- Local persistence: write rating markdown directly through a local dev-server API.
- Vault fixtures: commit normalized seed artifacts for the first reviewed cases so the demo works without running an import step.
- First case: use `fsd-accident-economy`.
- First solution set: include two sample solution artifacts, one labeled `cody` and one labeled `melissa`, even if the initial body text is fixture/manual until live kernel exports are available.

## Deferred Decisions

- Hosted storage backend for vault files.
- Gauntlet email auth provider.
- Whether database indexes are Postgres tables, search indexes, or generated JSON manifests.
- Whether problem recovery becomes a separate rating target or a multi-axis dimension of solution review.

## Recommended First Implementation Slice

Build a local static review workbench with a small file-backed Node script:

1. Normalize one case, `fsd-accident-economy`, into `calibration-vault/`.
2. Add two sample solutions, one Cody-labeled and one Melissa-labeled.
3. Build a simple UI that reads a generated JSON index from the vault.
4. Submit ratings by generating markdown locally through a small script or dev API.
5. Add tests for vault parsing and rating creation.

This slice proves the product loop without blocking on auth, hosting, database choices, or kernel merge strategy.
