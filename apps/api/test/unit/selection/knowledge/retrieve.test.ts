import { describe, it, expect } from 'vitest';
import {
  retrieveNotes,
  type RetrievalNote,
  type RetrieveArgs,
} from '../../../../src/selection/knowledge/retrieve';

/**
 * In-run retrieval (KB slice ①) — the PURE kNN over ResearchNotes the shared-knowledge stigmergy seam
 * runs at generation time. No gateway / clock / Math.random (rule #7 by construction): on replay the
 * persisted retrieved-note-id set is re-threaded; this math never re-runs against a provider. Reuses the
 * existing `cosineSimilarity` (embedding path) + `jaccardSimilarity` (lexical fallback — works with NO
 * embeddings, e.g. the recorded demo). `near` follows the pheromone trail (converge); `far` anti-retrieves
 * the most-dissimilar notes (diverge) — the FB.4 dial picks which.
 */

const note = (id: string, snippet: string, vector?: readonly number[]): RetrievalNote =>
  vector !== undefined ? { id, snippet, vector } : { id, snippet };

const retrieve = (over: Partial<RetrieveArgs> & Pick<RetrieveArgs, 'notes'>): RetrieveArgs => ({
  query: over.query ?? { text: 'q' },
  direction: over.direction ?? 'near',
  k: over.k ?? 3,
  notes: over.notes,
});

describe('retrieveNotes — cosine path (embeddings present)', () => {
  const QV = [1, 0] as const; // query vector
  const cosineNotes: RetrievalNote[] = [
    note('a', 'identical direction', [1, 0]), // sim 1.0  (nearest)
    note('b', 'orthogonal', [0, 1]), //          sim 0.0  (farthest)
    note('c', 'diagonal', [1, 1]), //            sim ~0.707
  ];

  it('near → top-k by DESCENDING cosine similarity (follow the trail)', () => {
    const result = retrieveNotes(
      retrieve({ query: { text: 'q', vector: QV }, notes: cosineNotes, direction: 'near', k: 2 }),
    );
    expect(result.method).toBe('cosine');
    expect(result.direction).toBe('near');
    expect(result.notes.map((n) => n.id)).toEqual(['a', 'c']); // 1.0 then ~0.707
    expect(result.notes[0]?.similarity).toBeCloseTo(1);
  });

  it('far → bottom-k by ASCENDING cosine similarity (anti-retrieve / diverge)', () => {
    const result = retrieveNotes(
      retrieve({ query: { text: 'q', vector: QV }, notes: cosineNotes, direction: 'far', k: 2 }),
    );
    expect(result.method).toBe('cosine');
    expect(result.direction).toBe('far');
    expect(result.notes.map((n) => n.id)).toEqual(['b', 'c']); // 0.0 then ~0.707
    expect(result.notes[0]?.similarity).toBeCloseTo(0);
  });

  it('carries each retrieved note id + snippet + similarity', () => {
    const result = retrieveNotes(
      retrieve({ query: { text: 'q', vector: QV }, notes: cosineNotes, direction: 'near', k: 1 }),
    );
    expect(result.notes[0]).toMatchObject({ id: 'a', snippet: 'identical direction' });
    expect(typeof result.notes[0]?.similarity).toBe('number');
  });

  it('excludes a dimension-mismatched note from the cosine path (never throws)', () => {
    const mixed = [...cosineNotes, note('wrongdim', 'bad', [1, 2, 3])];
    const result = retrieveNotes(
      retrieve({ query: { text: 'q', vector: QV }, notes: mixed, direction: 'near', k: 5 }),
    );
    expect(result.notes.map((n) => n.id)).not.toContain('wrongdim');
  });

  it('breaks ties deterministically by note id ascending', () => {
    const ties = [
      note('d', 'same dir', [1, 0]),
      note('a', 'same dir', [1, 0]),
      note('b', 'ortho', [0, 1]),
    ];
    const result = retrieveNotes(
      retrieve({ query: { text: 'q', vector: QV }, notes: ties, direction: 'near', k: 2 }),
    );
    expect(result.notes.map((n) => n.id)).toEqual(['a', 'd']); // both sim 1.0 → id asc
  });
});

describe('retrieveNotes — lexical fallback (no embeddings)', () => {
  const lexNotes: RetrievalNote[] = [
    note('n1', 'solid state battery breakthrough'), // jaccard 0.75 vs the query
    note('n2', 'grocery food waste logistics'), //     jaccard 0.0
  ];

  it('uses Jaccard over snippets when the query carries no vector', () => {
    const result = retrieveNotes(
      retrieve({
        query: { text: 'solid state battery' },
        notes: lexNotes,
        direction: 'near',
        k: 1,
      }),
    );
    expect(result.method).toBe('lexical_jaccard');
    expect(result.notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('far retrieves the most lexically dissimilar note', () => {
    const result = retrieveNotes(
      retrieve({ query: { text: 'solid state battery' }, notes: lexNotes, direction: 'far', k: 1 }),
    );
    expect(result.notes.map((n) => n.id)).toEqual(['n2']);
  });

  it('falls back to lexical when a query vector is present but NO note carries one (robust, never silently empty)', () => {
    const result = retrieveNotes(
      retrieve({
        query: { text: 'solid state battery', vector: [1, 0] },
        notes: lexNotes,
        direction: 'near',
        k: 1,
      }),
    );
    expect(result.method).toBe('lexical_jaccard');
    expect(result.notes.map((n) => n.id)).toEqual(['n1']);
  });
});

describe('retrieveNotes — bounds + purity', () => {
  const notes = [note('a', 'x'), note('b', 'y'), note('c', 'z')];

  it('k <= 0 → empty', () => {
    expect(retrieveNotes(retrieve({ notes, k: 0 })).notes).toEqual([]);
    expect(retrieveNotes(retrieve({ notes, k: -3 })).notes).toEqual([]);
  });

  it('empty notes → empty', () => {
    expect(retrieveNotes(retrieve({ notes: [], k: 3 })).notes).toEqual([]);
  });

  it('k larger than the note count → clamps to all', () => {
    expect(retrieveNotes(retrieve({ notes, k: 99 })).notes).toHaveLength(3);
  });

  it('dedupes by note id (keeps the first occurrence)', () => {
    const dup = [note('a', 'first'), note('a', 'second'), note('b', 'other')];
    const result = retrieveNotes(retrieve({ notes: dup, k: 5 }));
    const aMatches = result.notes.filter((n) => n.id === 'a');
    expect(aMatches).toHaveLength(1);
    expect(aMatches[0]?.snippet).toBe('first');
  });

  it('is pure — identical inputs yield a structurally identical result', () => {
    const args = retrieve({
      query: { text: 'solid state', vector: [1, 0] },
      notes,
      direction: 'far',
      k: 2,
    });
    expect(retrieveNotes(args)).toEqual(retrieveNotes(args));
  });
});
