import { buildResearchNotes } from '../projections/research-notes';
import {
  retrieveNotes,
  type RetrievalDirection,
  type RetrievalNote,
} from '../selection/knowledge/retrieve';
import type { EventStore } from '../event-store';
import type { RetrieveKnowledge } from '../runtime';

/**
 * Boot KB retriever (slice ④, shared-knowledge-space.md feature #1/#2) — composes the projections note-fold
 * ({@link buildResearchNotes}) + the pure selection kNN ({@link retrieveNotes}) into the loop's injected
 * `retrieveKnowledge` seam. This is the layering bridge: the runtime loop sees only the `RetrieveKnowledge`
 * port; this boot-layer closure reaches up into `projections` + `selection` (which the loop may not import).
 *
 * STIGMERGY: the seam reads the run's accumulated research notes (the pheromone trails prior agents left),
 * scores them against THIS agenome's persona (its `systemPrompt`), and returns the nearest (converge) or
 * farthest (diverge) k. The FB.4 `generationBias` dial picks the direction.
 *
 * MVP scope — LEXICAL (Jaccard) retrieval: no embedding call, so a recorded/keyless run retrieves with no
 * fixture change. A cosine path (persist note embeddings → `RetrievalNote.vector`) is a tracked follow-up;
 * {@link retrieveNotes} already upgrades automatically once notes carry vectors.
 *
 * Rule #7: the seam runs LIVE only — the loop persists the retrieved-note-id SET on
 * `candidate.generation_started`, and replay re-folds that, so this closure never runs on the replay path
 * (no provider, no re-query). Rule #6: the retrieval feeds the population_generator request ONLY (the loop's
 * single threading point); the judge/critic path never receives it. Rule #8: not a productive spend.
 */

/** Default notes retrieved per agenome — a small, prompt-budget-friendly k. */
const DEFAULT_RETRIEVAL_K = 3;
/** The neutral dead-band half-width — mirrors the FB.4 dial: |bias| ≤ this stays NEAR (the default trail). */
const BIAS_NEUTRAL_EDGE = 0.2;

/**
 * Map the FB.4 `generationBias` dial to the retrieval direction: a meaningful DIVERGE lean (bias above the
 * neutral dead-band) → `far` (anti-retrieve — steer away from the trodden trails); converge / neutral /
 * absent → `near` (follow the strongest pheromone trail, the default + most useful behavior).
 */
export function directionForBias(bias?: number): RetrievalDirection {
  return bias !== undefined && bias > BIAS_NEUTRAL_EDGE ? 'far' : 'near';
}

export interface KnowledgeRetrieverDeps {
  /** Read the run's authoritative log to fold the accumulated research notes (read-only; rule #2). */
  readonly readByRun: EventStore['readByRun'];
  /** The per-run FB.4 dial (converge/diverge) — picks near vs far. Absent → near. */
  readonly generationBias?: number;
  /** Notes retrieved per agenome. Default {@link DEFAULT_RETRIEVAL_K}. */
  readonly k?: number;
}

export function createKnowledgeRetriever(deps: KnowledgeRetrieverDeps): RetrieveKnowledge {
  const k = deps.k ?? DEFAULT_RETRIEVAL_K;
  const direction = directionForBias(deps.generationBias);
  return async ({ runId, agenome }) => {
    // Fold the run's research notes so far (the shared KB at this moment). Read-only; the loop persists the
    // outcome, so live timing (concurrent siblings) is captured faithfully for replay (rule #7).
    const events = await deps.readByRun(runId);
    if (events.length === 0) return undefined; // no log yet → nothing to fold (buildProjection rejects empty)
    const { state } = buildResearchNotes(events);
    const notes: RetrievalNote[] = Object.values(state.notes).map((note) => ({
      id: note.id,
      snippet: note.snippet,
    }));
    if (notes.length === 0) return undefined; // gen-0 / no research yet → no retrieval (baseline)

    const result = retrieveNotes({
      query: { text: agenome.systemPrompt }, // the persona is the query (per-agent stigmergic variation)
      notes,
      direction,
      k,
    });
    if (result.notes.length === 0) return undefined;

    return {
      noteIds: result.notes.map((n) => n.id),
      snippets: result.notes.map((n) => n.snippet),
      direction: result.direction,
      method: result.method,
    };
  };
}
