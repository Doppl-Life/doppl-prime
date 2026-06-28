# Agarden / Kernel Reconciliation

Working branch: `dalton-outer-view`

## Goal

The Agarden outer view displays durable outer artifacts: case studies, problem recoveries, and Doppls. The kernel produces append-only inner run events: candidates, agenomes, generations, fitness, novelty, judge results, and terminal winner signals.

Those are different layers. The reconciler must not treat a raw inner `CandidateIdea` as an Agarden node. It must compile selected inner outputs into the MarkScript node shape that Agarden, the calibrator, and future exports can display.

## Source Of Truths

| Layer | Source | Purpose |
| --- | --- | --- |
| Inner runtime | `run_events` in Postgres | Authoritative event log for organism generation, scoring, selection, energy, and replay. |
| Inner projection | `buildCurrentState(events)` | Derived winner/candidate/score view for a single run. Rebuildable. |
| Outer campaign | `outer_campaigns`, `outer_campaign_child_runs` | Server-owned orchestration bridge for a case-study bloom. |
| Outer artifacts | `outer_campaign_artifacts` | Durable Agarden display nodes compiled from case-study input or selected inner winners. |
| Imported Agarden | `outer_bloom_artifacts` | Existing markdown/aGarden import fallback. |

## What Agarden Expects

Agarden nodes are markdown files with YAML frontmatter and predictable sections.

### Case Study

- Frontmatter: `id`, `stage: case_study`, `name`, `next`.
- Body:
  - `# Title`
  - `## Context`
  - `## Synopsis`

### Problem Recovery

- Frontmatter: `id`, `stage: problem_recovery`, `root`, `prev`, `kernel`, `temporal`, `next: doppl`, `scores`, `doppelgangers`.
- Body:
  - `# Title`
  - `## Trace`
  - `## Discovery`
  - `## Growth - Problem recovery`
  - `## Path`

### Doppl

- Frontmatter: `id`, `stage: doppl`, `root`, `prev`, `kernel`, `temporal`, `next: null`, `scores`, `doppelgangers`.
- Body:
  - `# Title`
  - `## Trace`
  - `## Discovery`
  - `## Growth - Doppl`
  - `## Path`

## What The Kernel Produces Today

The inner kernel does not produce MarkScript directly. It emits:

- `candidate.created` payloads as `CandidateIdea`.
- `fitness.scored` payloads as `FitnessScore`.
- `novelty.scored` payloads as `NoveltyScore`.
- `judge.reviewed` payloads as `JudgeResult`.
- `run.completed` payload with `finalIdeaRef`, the authoritative selected winner signal.

The current-state reducer marks `finalIdeaRef` as `CandidateIdea.status = selected`. This is the deterministic promotion hook.

## Reconciliation Rule

`selected inner winner + parent outer artifact + source metrics -> compiled MarkScript outer artifact`

The compiler lives at:

`apps/api/src/markscript/compiler.ts`

It owns the display/export translation:

| Agarden field/section | Kernel or campaign source |
| --- | --- |
| `id` | New outer artifact id. |
| `stage` | Campaign child-run stage: `problem_recovery` or `doppl`. |
| `root` | Root case-study artifact id. |
| `prev` | Parent outer artifact id(s). |
| `scores.judge` | `JudgeResult.acceptance` scaled to Agarden score, fallback to `FitnessScore.total`. |
| `Trace` | Case-study summary plus parent artifact summary. |
| `Discovery` | Candidate claims and evidence references. |
| `Growth` | Candidate title/summary/claims/subtype payload, shaped by outer stage. |
| `Evaluation` | Persisted novelty, judge axes/rationales, and fitness explanation. |
| `Path` | `doppl` for problem recoveries, `null` for Doppls. |

## Current Implementation

- `POST /outer-campaigns` compiles the root case study into MarkScript before persisting it.
- `GET /bloom` calls the promotion sync before returning the projection.
- The sync reads running child runs, detects terminal runs, folds current state, finds the selected winner, compiles MarkScript, and persists a promoted outer artifact with:
  - `sourceRunId`
  - `sourceCandidateId`
  - `sourceSequenceThrough`
  - score/novelty/judge acceptance snapshots

## Remaining Work

- Launch the next child run after promoting a problem recovery so the campaign grows into Doppls.
- Add a dedicated campaign worker/stream instead of opportunistic `/bloom` materialization.
- Add tests for root compilation, winner promotion, no-winner terminalization, and imported/campaign coexistence.
- Decide when stable outer artifact events should graduate into shared contracts.
