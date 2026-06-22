# Calibrator Problem Recovery Design

Date: 2026-06-22
Branch: `calibration`
Status: Drafted after solution-only MVP

## Purpose

Calibrator should evaluate more than final solutions. A Doppl kernel first receives a case study, searches outward through discovery, and converges on a recovered problem. That recovered problem is itself an output that humans need to rate.

The next calibrator slice makes `problem_recovery` a first-class rateable target beside `solution`. Both use the same `-5` to `+5` rating scale so reviewers can compare kernel quality across stages without learning a second scoring system.

## Vocabulary

`adapter` is an implementation word. It currently means importer code that maps a branch- or runtime-specific artifact into the calibrator vault format. Reviewers should not need that word.

Use these terms instead:

- Code: `importer` or `source_mapper`
- Frontmatter: `source_mapping_version`
- UI: `Source mapping`, shown only in technical provenance details

The user-facing review language should be `Case Study`, `Discovery`, `Problem Recovery`, `Solution`, `Trace`, `Source`, and `Rating`.

## Kernel Flow

The intended kernel chain is:

```text
Case Study -> Discovery -> Problem Recovery -> Solution
```

`Discovery` is the outward search stage: evidence, hypotheses, adjacent systems, hidden dependency maps, branch exploration, and failed or retained leads.

`Problem Recovery` is the converged statement of the actual problem pulled from the stated context. It should be judged independently because a kernel can recover the right problem and still produce a weak solution, or produce an appealing solution to the wrong problem.

`Solution` is optional. Some markdown inputs will stop at problem recovery, especially early branch outputs or pending cases.

## Canonical Input Markdown

The preferred file shape is one markdown artifact per kernel case run:

```markdown
---
artifact_type: kernel_case_run
case_id: fsd-accident-economy
run_artifact_id: cody-fsd-accident-economy-001
source_type: kernel
source_status: imported
kernel: cody
source_branch: cody
source_commit: abc123
source_mapping_version: cody-runtime-importer-v1
created_at: 2026-06-22T00:00:00.000Z
---

# Trace

Ordered list of prior steps, source files, prompts, model calls, judge calls, or notable branch decisions.

# Case Study

The stated case context given to the kernel.

# Discovery

The outward search work. This may include hypotheses, evidence, linked context, dead ends, adjacent systems, and branch notes.

# Problem Recovery

The kernel's best recovered statement of the real problem.

# Solution

Optional final solution, candidate, assay branch, or response plan.
```

The vault may still materialize sections into separate indexed records for the app, but this complete markdown shape is the preferred import boundary because it preserves the journey from case to discovery to recovered problem to solution.

## Rating Targets

Human ratings should support:

- `problem_recovery`: rates the recovered problem statement.
- `solution`: rates the proposed solution, when present.

Both targets use:

- `score`: integer from `-5` to `+5`
- `scale_min`: `-5`
- `scale_max`: `5`
- optional verdict
- optional notes
- reviewer identity fields when available

Problem recovery and solution ratings should be separate markdown files. They may share a run artifact id, case id, reviewer, and trace path, but they should not collapse into one rating because they answer different calibration questions.

## Rating Artifact Shape

Problem recovery rating:

```yaml
---
artifact_type: human_rating
rating_id: rating_20260622_001
rating_target: problem_recovery
case_id: fsd-accident-economy
run_artifact_id: cody-fsd-accident-economy-001
problem_recovery_id: pr_cody_fsd_001
score: 4
scale_min: -5
scale_max: 5
reviewer_email: reviewer@gauntletai.com
submitted_at: 2026-06-22T00:00:00.000Z
app_version: calibrator-v0
---
```

Solution rating:

```yaml
---
artifact_type: human_rating
rating_id: rating_20260622_002
rating_target: solution
case_id: fsd-accident-economy
run_artifact_id: cody-fsd-accident-economy-001
solution_id: sol_cody_fsd_001
score: 3
scale_min: -5
scale_max: 5
reviewer_email: reviewer@gauntletai.com
submitted_at: 2026-06-22T00:00:00.000Z
app_version: calibrator-v0
---
```

## UI Model

The review workbench should make stage switching explicit:

- Case Study: collapsible context panel.
- Discovery: collapsible research/provenance panel.
- Problem Recovery: rateable panel with `-5` to `+5` controls.
- Solution: rateable panel when a solution exists.
- Trace: technical lineage panel, collapsed by default.

The reviewer should be able to choose whether they are rating `Problem Recovery` or `Solution`. The score widget can remain the same, but the submit action must write the selected `rating_target`.

Blind review mode should hide kernel names, branch names, and source mapping metadata for both problem recovery and solution review.

## Data Flow

1. Importer reads a branch export, runtime output, or manual markdown file.
2. Importer parses frontmatter and sections: `Trace`, `Case Study`, `Discovery`, `Problem Recovery`, optional `Solution`.
3. Vault reader indexes the run artifact and creates rateable child records for problem recovery and solution.
4. UI displays the case journey and lets the reviewer select a rating target.
5. Rating writer saves markdown with `rating_target: problem_recovery` or `rating_target: solution`.
6. Ledger appends the rating event for downstream ingestion.
7. Future Doppl runs can ingest human-rated problem recovery records separately from solution quality records.

## Implementation Implications

The existing solution-only MVP should evolve without losing old ratings:

- Keep reading legacy `problem.md` and `solutions/*.md`.
- Add support for `runs/*.md` or `artifacts/*.md` containing the complete canonical section structure.
- Rename `adapter_version` to `source_mapping_version` in new artifacts, while accepting legacy `adapter_version`.
- Extend rating schemas so `solution_id` is required only for solution ratings and `problem_recovery_id` is required only for problem recovery ratings.
- Update the UI from “Problem Context” to “Problem Recovery” when the content is a recovered kernel output.
- Keep static GitHub Pages read-only and local dev write-enabled.

## Success Criteria

- A markdown input with `Trace`, `Case Study`, `Discovery`, `Problem Recovery`, and optional `Solution` is indexed.
- The app displays problem recovery as a rateable output.
- Reviewers can submit `-5` to `+5` ratings for problem recovery.
- Existing solution ratings continue to work.
- Legacy solution-only vault files remain readable.
- User-facing UI does not use the word `adapter` except inside an expanded technical provenance section.
