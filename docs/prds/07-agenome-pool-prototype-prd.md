# PRD 07: Agenome Pool / Mutagen Library Prototype

## Prototype Question

Can Doppl make the available agenomes understandable before a run: what each mutagen is for, how it behaves, what tools it can use, and how it tends to mutate or fuse?

## Audience Moment

Within 10 seconds, a viewer should understand that an agenome is not just a prompt. It has traits, permissions, strategy, prior performance, energy behavior, and reproduction metadata.

## User Workflow

- Browse the mutagen library.
- Inspect one agenome's role, prompt, traits, permissions, and history.
- Compare agenomes by novelty, fitness, energy efficiency, and subtype fit.
- Select a starting pool for a run.
- See warnings when the pool lacks diversity or required subtype coverage.

## Required Data / Events

- `Agenome`
- `RunConfig`
- `agenome.spawned`
- historical `fitness.scored`, `novelty.scored`, `energy.spent`
- tool permission metadata
- mutation and fusion metadata

## Acceptable Fixture

Use the seven existing mutagen agenomes from the prototype suite with fixture scores and descriptions. The first version can be read-only.

## Convincing Demo Bar

- Each agenome has a distinct strategic identity.
- Users can predict why one agenome belongs in the starting population.
- Pool diversity is visible.
- Tool permissions and caps are clear.
- Prior performance is helpful without implying guaranteed future success.

## Falsification Bar

This prototype fails if agenomes look like interchangeable prompt cards, if users cannot compose a sensible pool, or if performance history encourages premature collapse into one favorite mutagen.

## Graduation Path

Connect the library to real `Agenome` definitions and historical run projections. Later versions should support controlled editing, versioning, and mutation policy previews.

