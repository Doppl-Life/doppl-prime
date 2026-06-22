---
artifact_type: comparison_set
comparison_set_id: fsd-accident-economy-v0
case_id: fsd-accident-economy
title: FSD Accident Economy Kernel Comparison v0
status: fixture_only
input_hash: sha256:fixture-fsd-accident-economy-v0
input_paths:
  - calibration-vault/cases/fsd-accident-economy/case.md
  - calibration-vault/cases/fsd-accident-economy/problem.md
adapter_version: calibrator-comparison-v0
created_at: 2026-06-22T00:00:00.000Z
---

# FSD Accident Economy Kernel Comparison v0

This comparison set uses the same normalized case and problem statement for the Cody-, Melissa-, and Michael-labeled solution artifacts.

The current set is fixture-only. It proves the calibrator's apples-to-apples review surface, but it does not claim that the three artifacts were produced by live kernel runs. Future importer or live-run adapters should replace fixture status with imported or live-run provenance only when the source artifact was actually generated from the same input.

## Current Source Status

- Cody: seeded fixture shaped from Cody's candidate, held-out judge, and fitness architecture.
- Melissa: seeded fixture shaped from Melissa's runtime problem-threading and scoring architecture.
- Michael: seeded fixture shaped from Michael's assay framing and verdict workflow.

## Promotion Rule

A solution can move from fixture to imported only when the adapter records a source branch, source commit, source artifact path or run id, and the shared comparison input hash.
