import { describe, expect, it } from 'vitest';
import type { KnowledgeGraph } from '../../../src/data/knowledge';
import { generationIndexOf, knowledgeToFlow } from '../../../src/knowledge/knowledgeToFlow';

/**
 * knowledgeToFlow — the PURE ResearchNote-projection → React Flow mapping. Generations become columns,
 * agenomes hubs, notes leaves; the projection's researched edges + a synthesized generation→agenome
 * backbone connect the tree. Dangling edges are dropped (RF breaks on them).
 */

function note(
  over: Partial<KnowledgeGraph['state']['notes'][string]>,
): KnowledgeGraph['state']['notes'][string] {
  return {
    id: over.id ?? 'research-note:run_1:1',
    runId: 'run_1',
    generationId: over.generationId ?? 'run_1-gen0',
    agenomeId: over.agenomeId ?? 'agn_0',
    toolName: over.toolName ?? 'web_search',
    snippet: over.snippet ?? 'snippet',
    sourceUrls: over.sourceUrls ?? [],
    sequence: over.sequence ?? 1,
    eventId: over.eventId ?? 'evt-1',
    ...(over.query !== undefined ? { query: over.query } : {}),
  };
}

function graph(
  notes: KnowledgeGraph['state']['notes'][string][],
  edges: KnowledgeGraph['state']['edges'][string][] = [],
): KnowledgeGraph['state'] {
  return {
    notes: Object.fromEntries(notes.map((n) => [n.id, n])),
    edges: Object.fromEntries(edges.map((e) => [e.id, e])),
  };
}

describe('generationIndexOf', () => {
  it('parses the gen ordinal; null/non-matching → undefined', () => {
    expect(generationIndexOf('run_1-gen3')).toBe(3);
    expect(generationIndexOf('run_1-gen0')).toBe(0);
    expect(generationIndexOf(null)).toBeUndefined();
    expect(generationIndexOf('nope')).toBeUndefined();
  });
});

describe('knowledgeToFlow — generations→columns, agenomes→hubs, notes→leaves', () => {
  it('builds generation, agenome-hub, and note nodes with parsed generation indices', () => {
    const flow = knowledgeToFlow(
      graph(
        [
          note({
            id: 'research-note:run_1:1',
            generationId: 'run_1-gen0',
            agenomeId: 'agn_0',
            query: 'a',
          }),
          note({
            id: 'research-note:run_1:2',
            generationId: 'run_1-gen1',
            agenomeId: 'agn_1',
            query: 'b',
          }),
          note({
            id: 'research-note:run_1:3',
            generationId: 'run_1-gen1',
            agenomeId: 'agn_1',
            query: 'c',
          }),
        ],
        [
          {
            id: 'researched:agn_0->research-note:run_1:1',
            source: 'agn_0',
            target: 'research-note:run_1:1',
            type: 'researched',
          },
          {
            id: 'researched:agn_1->research-note:run_1:2',
            source: 'agn_1',
            target: 'research-note:run_1:2',
            type: 'researched',
          },
          {
            id: 'researched:agn_1->research-note:run_1:3',
            source: 'agn_1',
            target: 'research-note:run_1:3',
            type: 'researched',
          },
        ],
      ),
    );
    const byKind = (kind: string) => flow.nodes.filter((n) => n.data.kind === kind);
    // two generation columns
    expect(
      byKind('generation')
        .map((n) => n.data.generationIndex)
        .sort(),
    ).toEqual([0, 1]);
    // two agenome hubs, with note counts
    const hubs = byKind('agenome');
    expect(hubs.map((n) => n.id).sort()).toEqual(['agn_0', 'agn_1']);
    expect(hubs.find((n) => n.id === 'agn_1')?.data.noteCount).toBe(2);
    // three note leaves, each carrying its generation index
    expect(byKind('note')).toHaveLength(3);
    expect(flow.nodes.find((n) => n.id === 'research-note:run_1:2')?.data.generationIndex).toBe(1);
  });

  it('synthesizes a generation→agenome backbone edge + carries the researched edges', () => {
    const flow = knowledgeToFlow(
      graph(
        [note({ id: 'research-note:run_1:1', generationId: 'run_1-gen0', agenomeId: 'agn_0' })],
        [
          {
            id: 'researched:agn_0->research-note:run_1:1',
            source: 'agn_0',
            target: 'research-note:run_1:1',
            type: 'researched',
          },
        ],
      ),
    );
    const types = flow.edges.map((e) => e.data?.edgeType).sort();
    expect(types).toEqual(['researched', 'spawned']);
    const spawned = flow.edges.find((e) => e.data?.edgeType === 'spawned');
    expect(spawned).toMatchObject({ source: 'run_1-gen0', target: 'agn_0' });
  });

  it('drops a dangling edge (endpoint with no node)', () => {
    const flow = knowledgeToFlow(
      graph(
        [note({ id: 'research-note:run_1:1', agenomeId: 'agn_0' })],
        [
          {
            id: 'cited:ghost->research-note:run_1:1',
            source: 'ghost-candidate',
            target: 'research-note:run_1:1',
            type: 'cited',
          },
        ],
      ),
    );
    // the only edges are the synthesized spawned backbone + researched (auto from the note's agenome is
    // absent here since we passed no researched edge); the cited edge with a ghost source is dropped.
    expect(flow.edges.some((e) => e.data?.edgeType === 'cited')).toBe(false);
  });

  it('handles an empty graph without throwing', () => {
    const flow = knowledgeToFlow(graph([]));
    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
  });
});
