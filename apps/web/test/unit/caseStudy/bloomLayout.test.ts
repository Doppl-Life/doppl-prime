import { describe, it, expect } from 'vitest';
import type { CaseStudyGraph } from '../../../src/data/caseStudy';
import { caseStudyToFlow } from '../../../src/caseStudy/caseStudyToFlow';
import { layoutBloom } from '../../../src/caseStudy/bloomLayout';

/**
 * layoutBloom — the deterministic tiered tree layout: root (col 0) → runs (col 1) → doppels (col 2), each run
 * owning a vertical block sized to its doppels. Pure (no RNG / wall-clock).
 */

function graph(): CaseStudyGraph {
  return {
    caseStudyId: 'cs',
    runs: [
      {
        runId: 'run_a',
        status: 'completed',
        problem: 'p',
        createdAt: '2026-06-26T10:00:00.000Z',
        doppels: [
          { candidateId: 'a1', title: 'A1', summary: 's' },
          { candidateId: 'a2', title: 'A2', summary: 's' },
        ],
      },
      {
        runId: 'run_b',
        status: 'completed',
        problem: 'p',
        createdAt: '2026-06-27T10:00:00.000Z',
        doppels: [{ candidateId: 'b1', title: 'B1', summary: 's' }],
      },
    ],
  };
}

describe('layoutBloom', () => {
  it('places the three tiers in three left→right columns', () => {
    const flow = caseStudyToFlow(graph());
    const placed = layoutBloom(flow.nodes);
    const byId = new Map(placed.map((n) => [n.id, n]));
    const rootX = byId.get('cs:cs')!.position.x;
    const runX = byId.get('run_a')!.position.x;
    const doppelX = byId.get('doppel:run_a:a1')!.position.x;
    expect(rootX).toBeLessThan(runX); // root left of runs
    expect(runX).toBeLessThan(doppelX); // runs left of doppels
    // both runs share the run column; both of run_a's doppels share the doppel column
    expect(byId.get('run_b')!.position.x).toBe(runX);
    expect(byId.get('doppel:run_a:a2')!.position.x).toBe(doppelX);
  });

  it('stacks a run’s doppels vertically within the run’s block', () => {
    const placed = layoutBloom(caseStudyToFlow(graph()).nodes);
    const byId = new Map(placed.map((n) => [n.id, n]));
    expect(byId.get('doppel:run_a:a1')!.position.y).not.toBe(
      byId.get('doppel:run_a:a2')!.position.y,
    );
  });

  it('is deterministic — same graph lays out identically', () => {
    const a = layoutBloom(caseStudyToFlow(graph()).nodes).map((n) => n.position);
    const b = layoutBloom(caseStudyToFlow(graph()).nodes).map((n) => n.position);
    expect(a).toEqual(b);
  });
});
