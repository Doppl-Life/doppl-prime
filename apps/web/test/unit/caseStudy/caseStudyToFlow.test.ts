import { describe, it, expect } from 'vitest';
import type { CaseStudyGraph } from '../../../src/data/caseStudy';
import { caseStudyToFlow } from '../../../src/caseStudy/caseStudyToFlow';

/**
 * caseStudyToFlow — the PURE CaseStudyGraph → React Flow mapping for the Islands bloom (case study → runs →
 * doppels). Storage-agnostic, no provider.
 */

function graph(): CaseStudyGraph {
  return {
    caseStudyId: 'cs_er_flow',
    runs: [
      {
        runId: 'run_a',
        status: 'completed',
        problem: 'smooth ER patient flow',
        createdAt: '2026-06-26T10:00:00.000Z',
        doppels: [
          { candidateId: 'a1', title: 'Doppel A1', summary: 's1' },
          { candidateId: 'a2', title: 'Doppel A2', summary: 's2' },
        ],
      },
      {
        runId: 'run_b',
        status: 'completed',
        problem: 'smooth ER patient flow',
        createdAt: '2026-06-27T10:00:00.000Z',
        doppels: [{ candidateId: 'b1', title: 'Doppel B1', summary: 's3' }],
      },
    ],
  };
}

describe('caseStudyToFlow', () => {
  it('emits a root, a hub per run, and a petal per doppel with the right tiers', () => {
    const flow = caseStudyToFlow(graph());
    expect(flow.nodes).toHaveLength(1 + 2 + 3); // root + 2 runs + 3 doppels
    const root = flow.nodes.find((n) => n.type === 'caseStudy')!;
    expect(root.data.tier).toBe(0);
    expect(root.data.runCount).toBe(2);
    expect(root.data.doppelCount).toBe(3);
    expect(flow.nodes.filter((n) => n.type === 'run').every((n) => n.data.tier === 1)).toBe(true);
    expect(flow.nodes.filter((n) => n.type === 'doppel').every((n) => n.data.tier === 2)).toBe(
      true,
    );
  });

  it('branches runs off the root and blooms doppels off runs, all animated', () => {
    const flow = caseStudyToFlow(graph());
    const branches = flow.edges.filter((e) => e.data?.edgeType === 'branch');
    const blooms = flow.edges.filter((e) => e.data?.edgeType === 'bloom');
    expect(branches).toHaveLength(2); // root → each run
    expect(blooms).toHaveLength(3); // run → each doppel
    expect(flow.edges.every((e) => e.animated === true)).toBe(true);
    // a bloom edge connects its run to its doppel
    expect(blooms.some((e) => e.source === 'run_a' && e.target === 'doppel:run_a:a1')).toBe(true);
  });

  it('assigns a strictly increasing growOrder for the staggered grow-in (root first)', () => {
    const orders = caseStudyToFlow(graph())
      .nodes.map((n) => n.data.growOrder)
      .sort((a, b) => a - b);
    expect(orders[0]).toBe(0); // the root grows in first
    expect(new Set(orders).size).toBe(orders.length); // all distinct
  });

  it('an empty case study → just the root node, no edges', () => {
    const flow = caseStudyToFlow({ caseStudyId: 'cs_none', runs: [] });
    expect(flow.nodes).toHaveLength(1);
    expect(flow.nodes[0]!.type).toBe('caseStudy');
    expect(flow.edges).toEqual([]);
  });
});
