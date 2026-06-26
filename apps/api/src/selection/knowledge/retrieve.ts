import { cosineSimilarity } from '../novelty/cosine';
import { jaccardSimilarity } from '../novelty/lexical-fallback';

/**
 * In-run retrieval (KB slice ①, ARCHITECTURE.md §8 / shared-knowledge-space.md) — the PURE kNN an agenome
 * runs against the shared knowledge base (the accumulated {@link RetrievalNote}s folded from the run's
 * `tool_call.finished` events) at generation time. STIGMERGY: `near` follows the pheromone trail (converge),
 * `far` anti-retrieves the most-dissimilar notes (diverge); the FB.4 `generationBias` dial picks the
 * direction (a caller concern — this fn is dial-agnostic).
 *
 * KEY SAFETY RULE #7 — replay-safe BY CONSTRUCTION: no gateway, no clock, no `Math.random`. The retrieved
 * note-id SET is persisted at run time (the loop's `candidate.generation_started` payload), so replay reads
 * the identical set back and this math is never re-run against a provider. Reuses the existing
 * {@link cosineSimilarity} (embedding path) and {@link jaccardSimilarity} (lexical fallback — needs NO
 * embeddings, so the recorded demo retrieves without a fixture change), mirroring the novelty degrade path.
 */

export type RetrievalDirection = 'near' | 'far';
export type RetrievalMethod = 'cosine' | 'lexical_jaccard';

/** A candidate note as the retriever sees it: a normalized snippet + (when persisted, rule #7) its vector. */
export interface RetrievalNote {
  readonly id: string;
  readonly snippet: string;
  /** Persisted embedding (rule #7) when available; absent → this note rides the lexical fallback. */
  readonly vector?: readonly number[];
}

export interface RetrieveQuery {
  /** The query text (the agenome's lens / the per-run problem) — always present (the lexical fallback). */
  readonly text: string;
  /** Present → the cosine path (scored against vector-bearing notes of the same dimension). */
  readonly vector?: readonly number[];
}

export interface RetrieveArgs {
  readonly query: RetrieveQuery;
  readonly notes: readonly RetrievalNote[];
  readonly direction: RetrievalDirection;
  /** Top-k to return (`near`) or bottom-k (`far`). `k <= 0` → empty. */
  readonly k: number;
}

export interface RetrievedNote {
  readonly id: string;
  readonly snippet: string;
  /** The cosine OR Jaccard similarity to the query — `[0,1]`, higher = nearer. */
  readonly similarity: number;
}

export interface RetrieveResult {
  readonly method: RetrievalMethod;
  readonly direction: RetrievalDirection;
  readonly notes: readonly RetrievedNote[];
}

/** Dedupe by id, keeping the FIRST occurrence (note ids are unique upstream; defensive + deterministic). */
function dedupeById(notes: readonly RetrievalNote[]): RetrievalNote[] {
  const seen = new Set<string>();
  const out: RetrievalNote[] = [];
  for (const n of notes) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
  }
  return out;
}

/**
 * retrieveNotes — score every note vs the query, then take the `k` NEAREST (`near`, descending similarity)
 * or `k` FARTHEST (`far`, ascending similarity). The method is COSINE when the query carries a vector AND at
 * least one note carries a same-dimension vector (vector-less / mismatched-dimension notes are excluded from
 * the cosine set — `cosineSimilarity` would otherwise throw on a dimension mismatch); otherwise it falls back
 * to lexical Jaccard over the snippets, so a query embedded against an un-embedded KB still retrieves rather
 * than silently returning nothing. Ties break by note id ascending (deterministic — rule #7).
 */
export function retrieveNotes(args: RetrieveArgs): RetrieveResult {
  const { query, direction, k } = args;
  const notes = dedupeById(args.notes);

  const queryVector = query.vector;
  const cosineNotes =
    queryVector !== undefined
      ? notes.filter((n) => n.vector !== undefined && n.vector.length === queryVector.length)
      : [];
  const useCosine = queryVector !== undefined && cosineNotes.length > 0;

  const method: RetrievalMethod = useCosine ? 'cosine' : 'lexical_jaccard';
  const scorable = useCosine ? cosineNotes : notes;

  if (k <= 0 || scorable.length === 0) {
    return { method, direction, notes: [] };
  }

  const scored = scorable.map((n) => ({
    id: n.id,
    snippet: n.snippet,
    // `useCosine` guarantees the cosine notes carry a same-dimension vector (no throw).
    similarity: useCosine
      ? cosineSimilarity(queryVector as readonly number[], n.vector as readonly number[])
      : jaccardSimilarity(query.text, n.snippet),
  }));

  // `near` = descending similarity (the trail); `far` = ascending (anti-retrieve). Ties → id ascending so
  // the selected set is byte-stable for replay.
  const sign = direction === 'near' ? -1 : 1;
  scored.sort((a, b) => {
    if (a.similarity !== b.similarity) return sign * (a.similarity - b.similarity);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { method, direction, notes: scored.slice(0, k) };
}
