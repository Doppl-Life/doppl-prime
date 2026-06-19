# PRD 12: Novelty / Prior-Art Radar Prototype

## Prototype Question

Can Doppl show whether an idea is genuinely new relative to prior candidates, known prior art, and current signals, while making degraded retrieval or embedding states explicit?

## Audience Moment

Within 10 seconds, a viewer should understand what the candidate is similar to, what makes it distinct, and whether novelty is well-supported or degraded.

## User Workflow

- Select a candidate idea.
- View nearest prior candidates in the run.
- View known prior-art matches.
- View current-signal matches for zeitgeist ideas.
- Inspect novelty score components and degraded states.

## Required Data / Events

- `CandidateIdea`
- `NoveltyScore`
- `novelty.scored`
- embeddings and cosine similarities
- retrieval results persisted in events
- `novelty_scoring_degraded`
- prior-art evidence refs

## Acceptable Fixture

Use a fixed candidate set with precomputed embedding similarities and a small static prior-art/signals corpus.

## Convincing Demo Bar

- Similarity is concrete, not just a score.
- The radar distinguishes "new wording" from genuinely new mechanism.
- Prior-art and current-signal evidence is visible.
- Degraded retrieval or embedding failures are labeled.
- Novelty feeds fitness without overpowering feasibility.

## Falsification Bar

This prototype fails if novelty feels like a magic number, if users cannot inspect nearest neighbors, or if retrieval failures silently produce confident scores.

## Graduation Path

Connect to OpenAI embeddings and retrieval adapters through ModelGateway. Production can start with app-level cosine and later optimize with pgvector without changing the prototype's mental model.

