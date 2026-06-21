---
title: "feat: Layperson explanation for surviving ideas"
type: feat
status: design
created: 2026-06-20
owner: melissa
depth: small
spec_anchors:
  - apps/api/src/runtime/generation-loop.ts (str() parser + candidate.created emission)
  - apps/api/src/runtime/seeds/gen-0-agenomes.ts (5 persona system prompts)
  - packages/contracts/src/domain/candidate-idea.ts (baseCandidateFields)
  - apps/web/src/panels/FinalIdeaPanel.tsx (winner header)
  - apps/web/src/panels/CandidateInspector.tsx (per-candidate overview)
  - apps/web/src/state/reducer.ts (CandidateView + candidate.created reducer case)
---

## Summary

Add a model-generated, layperson-friendly `explanation` field to every candidate
idea so the **Final surviving idea** panel and the **Candidate inspector** can
describe the winning idea in plain English instead of jargon-loaded prose.

Today the panels render the model's `title` ("APPLY SURGE TANKS TO CONGESTION
SHOCKWAVES") and `summary` ("Cross-domain transfer from hydraulic engineering
(surge tanks) to urban traffic: pressure-equalization + buffered intersections.")
— accurate but inaccessible. The new `explanation` field is written for a smart
non-expert: 1–2 sentences, no jargon, no abbreviations, analogies allowed. The
existing `summary` is retained alongside as a "technical summary" so the expert
content isn't lost.

## Out of scope

- A separate "winner-only post-run summarization" pipeline stage. (Rejected
  during brainstorm: every candidate gets the field at proposal time, cheaper
  by stage count and useful in the inspector even for non-winning candidates.)
- Backfilling `explanation` onto already-recorded runs. The field is optional;
  old replays render the existing `summary` line unchanged.
- Extending the `GET /runs/:id/candidates/:cid` projection
  (`apps/api/src/projections/current-state.ts:51` `CandidateRow`) to carry
  `title` / `summary` / `subtypePayload` / `explanation`. That projection is
  lossy today — the inspector's typed `title`/`summary` fields render empty at
  runtime against a live API. This design works around that by reading from the
  client-side store (which already has the candidate fields populated by the
  SSE-fed reducer); fixing the projection is filed as a follow-up.

## Design

### Contract — new field

`packages/contracts/src/domain/candidate-idea.ts` — extend `baseCandidateFields`:

```ts
explanation: z.string().min(1).optional(),
```

Optional so:
- Historical `candidate.created` events still parse.
- The U6 repair-state path doesn't fail when the model omits it.
- Tests with hand-built fixtures don't all need updating in one go.

The `CandidateIdea` discriminated union picks this up transitively. The
`candidate.created` event payload (`CandidateCreatedPayload`, defined in
`packages/contracts/src/events/payloads/verification.ts`) carries the full
`CandidateIdea`, so no separate event payload change is required.

### API — generation loop

`apps/api/src/runtime/generation-loop.ts` (around line 236):

In the existing JSON-parse + `str()`-extract block, add:

```ts
explanation: str("explanation", str("summary", "")),
```

Falling back through `summary` rather than a placeholder so the visible UI never
empties. (If both are missing, the empty string causes Zod's `.min(1)` to fail
the optional path; we'll instead omit the field if the model produced nothing —
implementation detail for the plan.)

### API — agenome system prompts

`apps/api/src/runtime/seeds/gen-0-agenomes.ts` — append to each of the 5
persona system prompts a uniform output-contract paragraph that names the
expected JSON fields including `explanation`. The other JSON fields
(`title`, `summary`, `subtype`, `sourceDomain`, …) are also implicitly defined
by the parser today — the prompts in the bundle do not currently mention any
JSON contract at all, which means live runs depend on the model inferring it.
Adding a short contract paragraph **also covers `explanation`** and incidentally
strengthens the implicit contract for the existing fields.

Suggested contract paragraph (shared across all 5 personas):

> Respond with a single JSON object containing: `subtype` (one of
> `"cross_domain_transfer"`, `"zeitgeist_synthesis"`), `title` (short noun
> phrase), `summary` (1-sentence technical summary using domain terms), and
> `explanation` (1–2 sentences a smart non-expert could understand: no jargon,
> no abbreviations, analogies welcome). For `cross_domain_transfer`, also
> include `sourceDomain`, `sourceTechnique`, `targetDomain`, `targetProblem`,
> `transferMapping`, `expectedMechanism`.

### Web — store

`apps/web/src/state/reducer.ts`:

1. Add `explanation?: string` to `CandidateView` (currently lines 56–64).
2. In the `candidate.created` reducer case (lines 377–405), populate from the
   event's `cand.explanation` with the same type guard pattern used for `title`.

### Web — FinalIdeaPanel

`apps/web/src/panels/FinalIdeaPanel.tsx`:

Reorder the header block from:

1. Title
2. Summary (jargon-y)

to:

1. Title
2. **Explanation** (layperson, primary)
3. **Technical summary** (existing `summary`, smaller, labeled, secondary)

If `explanation` is missing (replays of old runs), keep current behavior —
render `summary` as the primary description with no "Technical summary" label.

### Web — CandidateInspector

`apps/web/src/panels/CandidateInspector.tsx`:

Today the inspector reads `c.title` / `c.summary` from the API response
(`getCandidate`), which actually returns `undefined` for those fields because of
the lossy projection. To wire `explanation` in **without** scope-creeping into a
projection fix, switch the title/summary/explanation render to read from the
client store instead:

```tsx
const stored = state.candidates[candidateId];
const title = stored?.title ?? c.title;
const summary = stored?.summary ?? c.summary;
const explanation = stored?.explanation;
```

The rest of the inspector (critic reviews, check results, novelty, fitness,
subtypePayload) keeps reading from `c` / the API response.

Render `explanation` between the title row and the technical summary `<p>`,
with the same labeled-secondary treatment as in the FinalIdeaPanel.

### Tests

1. **Contract fieldset test** — `packages/contracts/src/domain/__tests__/`:
   confirm `explanation` is optional and parses both presence and absence.

2. **Recorded fixture** —
   `apps/api/__fixtures__/recorded-responses/openrouter/population_generator/default.json`:
   add an `explanation` value to the placeholder output so replays show the new
   field rendering through.

3. **`FinalIdeaPanel.test.tsx`**:
   - Existing tests still pass (heading h2 `title` attr unchanged; agent line
     unchanged; 6 link rows unchanged).
   - Add: when winner candidate carries `explanation`, both the explanation and
     the labeled technical summary render.
   - Add: when winner candidate has no `explanation`, the panel falls back to
     the current single-summary rendering (no broken "Technical summary" label
     orphan).

4. **`CandidateInspector.test.tsx`** (if absent, add minimal test):
   - When the store has `title` / `summary` / `explanation` for the selected
     candidate, the inspector renders all three even if the API response
     `candidate` payload doesn't carry them.

## Backward compatibility

- Contract change is additive + optional. All historical fixtures, replay
  packs, and existing tests continue to parse.
- UI fallbacks ensure no panel renders empty if `explanation` is missing.
- No event-type change. No projection change required for this feature.

## Open follow-ups (not in this design)

- Fix the lossy `CandidateRow` projection so `GET /runs/:id/candidates/:cid`
  actually returns the full `CandidateIdea` instead of an `id/agenomeId/
  generationId/subtype/status` skeleton.
- Decide whether to also surface `explanation` on the lineage hover-card.
