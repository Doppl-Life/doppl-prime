# Doppl Calibrator

Calibrator is a vault-first review workbench for rating Doppl solution artifacts. The markdown files under `../calibration-vault/` are the source of truth; the React app reads those files through a local Vite middleware and writes submitted human ratings back as markdown.

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
        melissa-accident-economy-map.md
      ratings/
        .gitkeep
```

Rating submissions are written to:

```text
calibration-vault/cases/<case_id>/ratings/rating_<timestamp>_<solution_id>.md
```

Future auth can add reviewer identity enforcement, but the MVP already preserves an optional `reviewer_email` field so Gauntlet-email sign-in can map cleanly onto the vault contract later.
