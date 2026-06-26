import { describe, expect, it } from 'vitest';
import { layoutKnowledge } from '../../../src/knowledge/layout';
import type { KnowledgeRfEdge, KnowledgeRfNode } from '../../../src/knowledge/knowledgeToFlow';

/**
 * layoutKnowledge — the deterministic per-generation COLUMN layout: generation N → column N (left→right),
 * the header chip atop, agenome hubs then their notes stacked beneath. Pure (sorts by id, no RNG/clock).
 */

function n(
  id: string,
  kind: KnowledgeRfNode['data']['kind'],
  generationIndex?: number,
): KnowledgeRfNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: { kind, label: id, ...(generationIndex !== undefined ? { generationIndex } : {}) },
  };
}

describe('layoutKnowledge — generation columns', () => {
  it('places generation N in column N (left→right) — later generations are further right', () => {
    const nodes = [n('run_1-gen0', 'generation', 0), n('run_1-gen1', 'generation', 1)];
    const out = layoutKnowledge(nodes, []);
    const x = (id: string) => out.find((node) => node.id === id)!.position.x;
    expect(x('run_1-gen1')).toBeGreaterThan(x('run_1-gen0'));
  });

  it('stacks header → agenome → its notes within a column (deterministic, top to bottom)', () => {
    const nodes = [
      n('run_1-gen0', 'generation', 0),
      n('agn_0', 'agenome', 0),
      n('research-note:run_1:1', 'note', 0),
    ];
    const edges: KnowledgeRfEdge[] = [
      {
        id: 'r1',
        source: 'agn_0',
        target: 'research-note:run_1:1',
        type: 'smoothstep',
        data: { edgeType: 'researched' },
      },
    ];
    const out = layoutKnowledge(nodes, edges);
    const y = (id: string) => out.find((node) => node.id === id)!.position.y;
    // same column (x equal), increasing y header → agenome → note
    expect(y('run_1-gen0')).toBeLessThan(y('agn_0'));
    expect(y('agn_0')).toBeLessThan(y('research-note:run_1:1'));
    const x = (id: string) => out.find((node) => node.id === id)!.position.x;
    expect(new Set([x('run_1-gen0'), x('agn_0'), x('research-note:run_1:1')]).size).toBe(1);
  });

  it('is deterministic (same input → same positions)', () => {
    const nodes = [n('run_1-gen0', 'generation', 0), n('agn_0', 'agenome', 0)];
    expect(layoutKnowledge(nodes, [])).toEqual(layoutKnowledge(nodes, []));
  });
});
