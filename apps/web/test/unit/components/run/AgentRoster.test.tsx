// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { LineageGraphProjection } from '@doppl/contracts';
import { AgentRoster } from '../../../../src/components/run/AgentRoster';

afterEach(() => cleanup());

const lineage: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [
    { id: 'g0', type: 'generation', label: 'Generation 0', dataRef: 'gen_0' },
    { id: 'a0', type: 'agenome', label: 'Agenome 0', status: 'active', dataRef: 'agn_0' },
    { id: 'a1', type: 'agenome', label: 'Agenome 1', status: 'eligible_parent', dataRef: 'agn_1' },
    { id: 'c0', type: 'candidate', label: 'Cand', status: 'scored', dataRef: 'cand_0' },
  ],
  edges: [],
  sequenceThrough: 10,
};

describe('AgentRoster — left-rail roster derived from lineage agenome nodes (FV.4)', () => {
  // spec(§12): one row per agenome lineage node with a StatusBadge (shape+icon+label, not color alone);
  // non-agenome nodes (generation/candidate) are excluded. Derived from the projection — no API call.
  it('test_agent_roster_derived_from_lineage', () => {
    render(<AgentRoster lineage={lineage} />);
    expect(screen.getByText('agn_0')).toBeTruthy();
    expect(screen.getByText('agn_1')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy(); // a0 status label (shape+label)
    expect(screen.getByText('eligible')).toBeTruthy(); // a1 status label
    expect(screen.queryByText('cand_0')).toBeNull(); // candidate node not in the roster
    expect(screen.queryByText('gen_0')).toBeNull(); // generation node not in the roster
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy(); // a glyph
  });

  // spec(§12 honesty): a lineage with no agenome nodes (or null) renders an honest empty state, never blank.
  it('test_agent_roster_empty_state', () => {
    render(<AgentRoster lineage={null} />);
    expect(screen.getByText(/no agenomes yet/i)).toBeTruthy();
    cleanup();
    render(<AgentRoster lineage={{ runId: 'run_1', nodes: [], edges: [], sequenceThrough: 0 }} />);
    expect(screen.getByText(/no agenomes yet/i)).toBeTruthy();
  });
});
