# Doppl Calibrator

Calibrator is a vault-first review workbench for rating Doppl solution artifacts. The markdown files under `../calibration-vault/` are the source of truth; the React app reads those files through a local Vite middleware and writes submitted human ratings back as markdown plus an append-only JSONL ledger.

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

Host `published/calibrator/` to show the calibrator online. The `calibration` branch includes a GitHub Pages workflow for deploying the committed `published/` folder. Static preview supports browsing cases, solutions, scores, and verdict controls; saving ratings requires the local dev API or a future hosted backend.

## Calibration History

The app reads existing rating markdown from each case's `ratings/` folder and attaches those records to the matching solution in the generated index. The solution panel shows the current human average, rating count, judge-score delta, and verdict distribution so reviewers can see calibration evidence without leaving the workbench.

In local writable mode, submitting a rating writes markdown plus the JSONL ledger event, then refreshes the vault index so the new rating appears immediately. In static preview mode, the same history is visible from the committed export, but the submit button stays disabled.

## Comparison Provenance

Apples-to-apples comparison is represented explicitly in markdown. Comparison sets live under `calibration-vault/comparison-sets/` and solution frontmatter records the shared input hash, input paths, source status, source branch, source commit, and adapter version.

The current `fsd-accident-economy-v0` set is marked `fixture_only`. The Cody-, Melissa-, and Michael-labeled artifacts are useful for testing the calibration workflow, but they are not presented as live kernel outputs. Future importers should promote a solution to `imported` or `live_run` only when they can record the branch, commit, source artifact or run id, and the exact shared comparison input hash.

## Review Controls

Reviewers can filter the solution list by source status: fixture, imported, live run, pending, or unavailable. This prevents calibration sessions from mixing true candidate outputs with provenance-only artifacts unless the reviewer chooses to see all records.

Blind review mode masks kernel/source labels, provenance metadata, adapter notes, and obvious branch names in solution text. It is intended for lower-bias human rating sessions; reviewers can turn it off when they need audit context.

## Vault Shape

Seed case:

```text
calibration-vault/
  cases/
    fsd-accident-economy/
      case.md
      problem.md
      solutions/
        cody-accident-economy-map.md
        michael-accident-economy-assay.md
        melissa-accident-economy-map.md
      ratings/
        .gitkeep
```

Rating submissions are written to:

```text
calibration-vault/cases/<case_id>/ratings/rating_<timestamp>_<solution_id>.md
calibration-vault/ratings-ledger.jsonl
```

Generated local rating files and the JSONL ledger are ignored by git by default. Promote them deliberately when a review should become shared project evidence.

Future auth can add reviewer identity enforcement, but the MVP already preserves an optional `reviewer_email` field so Gauntlet-email sign-in can map cleanly onto the vault contract later.

## Michael Branch Influence

The `michael` branch frames calibration as an outcome assay over kernel branches, not only as numeric grading of a final answer. The calibrator now preserves that shape in three ways:

- Michael's `fsd-accident-economy` assay fixture is represented as a third solution artifact.
- Solution artifacts can declare `output_class`, `phase`, and `subtype` fields so candidates can later become Pepsis, many-Pepsis packets, or solution-discovery records.
- Human ratings can include both a `-5` to `+5` score and a categorical verdict: `dead`, `obvious`, `interesting`, `investigate`, or `keeper`.

The score says how strong the artifact is. The verdict says what Doppl should do with it next.
