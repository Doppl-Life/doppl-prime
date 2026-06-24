# Doppl Calibrator

Calibrator is the Judgment UI for rating aGarden problem recovery and doppl nodes. The canonical shared data source is the sibling `../agarden/` checkout from `Doppl-Life/agarden`; the older `../calibration-vault/` reader remains as a compatibility fallback.

The aGarden ratings ledger is the source of truth for human ratings. Node markdown stores the materialized projection, currently `scores.human` and `scores.n`.

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

Host `published/calibrator/` to show the calibrator online. The `calibration` branch includes a GitHub Pages workflow for deploying the committed `published/` folder. Static preview supports browsing case studies, problem recoveries, doppls, and score history. Saving ratings requires the local dev API or a hosted backend configured through `calibrator-config.js`.

`calibrator-config.js` is intentionally public and must contain only non-secret browser configuration. To enable hosted writes later, set `window.DOPPL_CALIBRATOR_CONFIG.ratingsEndpoint` to the deployed ratings API URL. Do not put GitHub tokens, GitHub App keys, session secrets, or provider keys in this file.

Hosted write mode can also set `requiresAccessCode: true`. In that mode, reviewers enter a session access code in the rating dock and the browser sends it as a Bearer token. The access code must live only in the hosted API environment as `CALIBRATOR_WRITE_TOKEN`; it must not be committed or hardcoded into the static app.

The future hosted write path is specified in `../docs/calibrator-hosted-write-path.md`. It keeps aGarden markdown plus `ratings-ledger.json` as the durable source of truth while allowing a server deployment to validate, write, and index rating submissions without exposing GitHub credentials to browser code.

## Calibration History

In aGarden mode, the app reads root `ratings-ledger.json` and attaches each ledger entry to the matching problem recovery or doppl node in the generated index.

In local writable mode, submitting a rating upserts exactly one current rating for `(node_id, rater_id)`, recomputes `scores.human` and `scores.n`, materializes that projection into the selected node markdown, then refreshes the index so the new rating appears immediately. In static GitHub Pages mode, the same history is visible from the committed export; the submit button stays disabled until a hosted ratings API endpoint is configured.

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

## Kernel Run JSON Import

Kernels can also emit a JSON contract and let Calibrator write the canonical run markdown:

```json
{
  "schema_version": "calibrator-kernel-run-v1",
  "case_id": "fsd-accident-economy",
  "run_artifact_id": "dalton-fsd-run-001",
  "source_status": "live_run",
  "kernel": "dalton",
  "branch": "dalton",
  "run_id": "run_001",
  "trace": ["case loaded", "problem recovered", "solution drafted"],
  "discovery": "Research notes or discovery summary.",
  "problem_recovery": {
    "title": "Recovered problem title",
    "body": "Recovered problem text."
  },
  "solution": {
    "title": "Solution title",
    "body": "Solution text."
  }
}
```

Import one JSON object or an array of objects:

```bash
npm --prefix calibrator run import:kernel-runs -- --input path/to/kernel-output.json
npm --prefix calibrator run generate:index
```

The importer writes `calibration-vault/cases/<case_id>/runs/<run_artifact_id>.md`. Calibrator then indexes the run's `Problem Recovery` and optional `Solution` sections as separate rateable artifacts. This is the preferred contract for future full-kernel branches because it preserves trace, discovery, recovered problem, solution, source branch, commit, run id, and kernel labels in one durable artifact.

## Comparison Provenance

Apples-to-apples comparison is represented explicitly in markdown. Comparison sets live under `calibration-vault/comparison-sets/` and solution frontmatter records the shared input hash, input paths, source status, source branch, source commit, and source mapping version.

The current `fsd-accident-economy-v0` set is marked `fixture_only`. The Cody-, Melissa-, and Michael-labeled artifacts are useful for testing the calibration workflow, but they are not presented as live kernel outputs. Future importers should promote a solution to `imported` or `live_run` only when they can record the branch, commit, source artifact or run id, and the exact shared comparison input hash.

Importers should not create pseudo-solution artifacts when a branch has no case-specific output. Branch architecture/code provenance belongs in docs or importer logs, not in the review artifact selector.

The review queue shows primary rateable artifacts only: `source_status: imported` or `source_status: live_run`. Fixture, pending, and unknown-status artifacts stay out of the reviewer path because the Judgment UI should only present problem recoveries and doppls that can be rated.

## Review Controls

Reviewers first choose a case study, then use the vertical `Problem recoveries` / `Doppls` switch to choose the artifact type, then choose the specific rateable artifact from the matching dropdown.

The review surface shows full-width case context, supplemental discovery context when it is not a duplicate of the case text, the selected artifact, and hidden source details for provenance.

Problem recovery and doppl artifacts both use the same bottom-docked `-5` to `+5` score slider. The active reviewer should be able to move through a calibration session without managing verdict categories, notes fields, audit filters, or provenance/debug artifacts.

Source details are collapsed by default and can be revealed for the selected artifact when reviewers need traceability.

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
      runs/
        dalton-fsd-run-001.md
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
