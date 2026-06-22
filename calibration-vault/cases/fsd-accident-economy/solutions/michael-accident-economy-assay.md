---
artifact_type: solution
case_id: fsd-accident-economy
solution_id: michael-accident-economy-assay
title: Accident Economy Assay Branches
stage: doppl
temporal: true
next: terminal
source_type: kernel
comparison_set_id: fsd-accident-economy-v0
comparison_input_hash: sha256:fixture-fsd-accident-economy-v0
comparison_input_paths:
  - calibration-vault/cases/fsd-accident-economy/case.md
  - calibration-vault/cases/fsd-accident-economy/problem.md
source_status: fixture
source_branch: michael
source_commit: unavailable-for-fixture
adapter_version: calibrator-comparison-v0
adapter_notes: "Seeded assay fixture; Michael's branch marks this specific case solution as pending."
output_class: doppl
phase: solution_discovery
subtype: consequence
kernel: michael
branch: michael
run_id: seed-fsd-accident-economy
generation_id: assay-fixture
agenome_id: michael-kernel-assay
candidate_id: fae-c1/fae-c2/fae-c3/fae-c4/fae-c2a
created_at: 2026-06-22T00:00:00.000Z
---

# Accident Economy Assay Branches

Michael's branch treats this case as an outcome assay rather than a single final solution. The useful output is a set of inspectable branches that show what the run noticed, what hidden dependents it surfaced, and which branches deserve human judgment.

## Proposed Response

1. Treat accident volume as the removed substrate, not merely a safety improvement. The crash event feeds insurance pricing, legal intake, repair demand, trauma workflows, advertising, and organ-supply edges.
2. Split the case into many Pepsis rather than forcing one converged answer. At minimum, preserve accident-volume substrate loss, insurer advertising demand, trauma donor supply, product-stack liability migration, and media demand sink.
3. Use verdicts as bedrock signals. Human reviewers should mark each branch as dead, obvious, interesting, investigate, or keeper before the branch becomes memory, fixture, or trash.
4. Preserve lineage deltas. A branch only matters if it changes something besides wording, such as safety outcome to missing event stream, insurance pool to customer-acquisition spend, mortality reduction to donor-supply constraint, or driver fault to autonomy-stack liability.

## Why This Fits

This solution is less polished as a final recommendation, but it is strong calibration material because it shows the kernel's working surface. It asks reviewers to judge whether each branch is fertile, non-obvious, grounded, and worth preserving.

## Branches To Judge

1. Accident volume is the substrate: safer roads remove the recurring event stream that feeds crash-linked institutions.
2. Crash removal hits ad-supported media: insurer customer-acquisition spend becomes a hidden downstream dependency.
3. Organ supply loses a concentrated source: fewer young trauma deaths can tighten a high-quality donor edge.
4. Fault moves from driver to stack: residual claims migrate toward autonomy software, fleet operations, logs, and manufacturer risk pools.
5. Insurer ads are a demand sink: the advertising branch sharpens into a media-market replacement-buyer problem.

## Calibrator Implication

Numeric ratings remain useful, but Michael's branch argues that calibrator should also collect categorical human verdicts. A `+4` says quality; `investigate` or `keeper` says what the system should do with the branch next.
