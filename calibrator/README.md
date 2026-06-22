# Doppl Calibrator

Calibrator is a vault-first review workbench for rating Doppl problem recovery and solution artifacts. The markdown files under `../calibration-vault/` are the source of truth; the React app reads those files through a local Vite middleware and writes submitted human ratings back as markdown plus an append-only JSONL ledger.

## Run Locally

```bash
npm install --prefix calibrator
npm --prefix calibrator run generate:index
npm --prefix calibrator run dev -- --port 5178
```

Open `http://127.0.0.1:5178`.

## Verify

```bash
npm --prefix calibrator run test
npm --prefix calibrator run build
```

## Static Preview

The app can run as a read-only static build because it falls back from `/api/index` to `calibration-index.json`.

```bash
npm --prefix calibrator run export:static
```

Host `published/calibrator/` to show the calibrator online. The `calibration` branch includes a GitHub Pages workflow for deploying the committed `published/` folder. Static preview supports browsing cases, problem recoveries, solutions, and score history; saving ratings requires the local dev API or a future hosted backend.

## Calibration History

The app reads existing rating markdown from each case's `ratings/` folder and attaches those records to the matching problem recovery or solution in the generated index. Review panels show the current human average, rating count, judge-score delta when applicable, and recent notes so reviewers can see calibration evidence without leaving the workbench.

In local writable mode, submitting a rating writes markdown plus the JSONL ledger event, then refreshes the vault index so the new rating appears immediately. In static preview mode, the same history is visible from the committed export, but the submit button stays disabled.

## Canonical Markdown Input

The preferred input shape for future kernel exports is one markdown artifact with frontmatter followed by these top-level sections:

```markdown
---
artifact_type: kernel_case_run
case_id: fsd-accident-economy
run_artifact_id: cody-fsd-accident-economy-001
source_type: kernel
source_status: imported
kernel: cody
source_mapping_version: cody-runtime-importer-v1
created_at: 2026-06-22T00:00:00.000Z
---

# Trace

# Case Study

# Discovery

# Problem Recovery

# Solution
```

`Solution` is optional. Calibrator indexes `Problem Recovery` as its own rateable output because a kernel can recover the right problem and still propose a weak solution, or solve the wrong problem well.

## Comparison Provenance

Apples-to-apples comparison is represented explicitly in markdown. Comparison sets live under `calibration-vault/comparison-sets/` and solution frontmatter records the shared input hash, input paths, source status, source branch, source commit, and source mapping version.

The current `fsd-accident-economy-v0` set is marked `fixture_only`. The Cody-, Melissa-, and Michael-labeled artifacts are useful for testing the calibration workflow, but they are not presented as live kernel outputs. Future importers should promote a solution to `imported` or `live_run` only when they can record the branch, commit, source artifact or run id, and the exact shared comparison input hash.

## Review Controls

Reviewers first choose a case study, then choose whether they are rating the recovered problem or one of the proposed solutions. The review surface is a single-column trace: case context, stated context, selected artifact, then hidden provenance details for audits.

Problem recovery and solution artifacts both use the same bottom-docked `-5` to `+5` score slider plus optional notes. The active reviewer should be able to move through a calibration session without managing separate verdict categories or provenance filters.

Blind review mode masks kernel/source labels, provenance metadata, source mapping notes, and obvious branch names in review text. Source details are collapsed by default and can be revealed with one audit toggle when reviewers need traceability.

## Vault Shape

Seed case:

```text
calibration-vault/
  cases/
    fsd-accident-economy/
      case.md
      problem.md
      problem-recoveries/
        fsd-accident-economy-recovered-problem.md
      solutions/
        cody-accident-economy-map.md
        michael-accident-economy-assay.md
        melissa-accident-economy-map.md
      ratings/
        .gitkeep
```

Rating submissions are written to:

```text
calibration-vault/cases/<case_id>/ratings/rating_<timestamp>_<target_id>.md
calibration-vault/ratings-ledger.jsonl
```

Generated local rating files and the JSONL ledger are ignored by git by default. Promote them deliberately when a review should become shared project evidence.

Future auth can add reviewer identity enforcement, but the MVP already preserves an optional `reviewer_email` field so Gauntlet-email sign-in can map cleanly onto the vault contract later.

## Michael Branch Influence

The `michael` branch frames calibration as an outcome assay over kernel branches, not only as numeric grading of a final answer. The calibrator now preserves that shape in three ways:

- Michael's `fsd-accident-economy` assay fixture is represented as a third solution artifact.
- Solution artifacts can declare `output_class`, `phase`, and `subtype` fields so candidates can later become Pepsis, many-Pepsis packets, or solution-discovery records.
- Human ratings focus on a shared `-5` to `+5` scale so kernels can be compared across recovered problems and proposed solutions.

The score says how strong the artifact is. Notes capture the reviewer rationale without forcing a second categorical decision.
