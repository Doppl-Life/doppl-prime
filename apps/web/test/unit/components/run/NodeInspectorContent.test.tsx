// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  validCandidateIdeaCrossDomain,
  validEnergyEvent,
  validFitnessScore,
} from '@doppl/contracts';
import type { LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';
import { NodeInspectorContent } from '../../../../src/components/run/NodeInspectorContent';
import type { RunClient } from '../../../../src/data/runClient';
import { makeEvent } from '../../../fixtures/events';

afterEach(() => cleanup());

const lineage: LineageGraphProjection = {
  runId: 'run_1',
  nodes: [
    { id: 'a0', type: 'agenome', label: 'Agenome 0', status: 'active', dataRef: 'agn_0' },
    { id: 'c0', type: 'candidate', label: 'C0', status: 'scored', dataRef: 'cand_0' },
  ],
  edges: [],
  sequenceThrough: 10,
};

function client(): Pick<RunClient, 'getCandidate'> {
  return { getCandidate: vi.fn(() => Promise.resolve(validCandidateIdeaCrossDomain)) };
}

function fitnessEvent(candidateId: string, total: number): RunEventEnvelope {
  return makeEvent(2, 'fitness.scored', {
    runId: 'run_1',
    candidateId,
    payload: { ...validFitnessScore, candidateId, total, components: { grounding: 0.9 } },
  });
}
function energyEvent(agenomeId: string): RunEventEnvelope {
  return makeEvent(1, 'energy.spent', {
    runId: 'run_1',
    agenomeId,
    payload: { ...validEnergyEvent, agenomeId },
  });
}

describe('NodeInspectorContent — node-click drawer content router (FV.5a)', () => {
  // spec(§12): a CANDIDATE node composes CandidateInspector + the fitness breakdown + critic gauntlet +
  // subtype checks (all keyed by the node dataRef = candidateId).
  it('test_candidate_composition_renders', async () => {
    const rc = client();
    render(
      <NodeInspectorContent
        selectedNode={{ dataRef: 'cand_0', type: 'candidate' }}
        runId="run_1"
        runClient={rc}
        events={[]}
        lineage={lineage}
      />,
    );
    expect(await screen.findByLabelText('Candidate inspector')).toBeTruthy(); // getCandidate loaded
    expect(rc.getCandidate).toHaveBeenCalledWith('run_1', 'cand_0');
    expect(screen.getByLabelText('Candidate fitness breakdown')).toBeTruthy(); // the fitness subsection
    expect(screen.getByLabelText(/no reviews yet/i)).toBeTruthy(); // CriticGauntletPanel (empty-state)
    expect(screen.getByLabelText(/no checks yet/i)).toBeTruthy(); // SubtypeCheckPanel (empty-state)
  });

  // spec(rule #6 emit-only): the fitness subsection shows the candidate's fitness.scored total +
  // components VERBATIM (no recompute) — the score detail's new home after the score node drops.
  it('test_candidate_fitness_breakdown_verbatim', async () => {
    const rc = client();
    render(
      <NodeInspectorContent
        selectedNode={{ dataRef: 'cand_0', type: 'candidate' }}
        runId="run_1"
        runClient={rc}
        events={[fitnessEvent('cand_0', 0.84)]}
        lineage={lineage}
      />,
    );
    const section = await screen.findByLabelText('Candidate fitness breakdown');
    expect(section.textContent).toMatch(/total 0\.84/); // verbatim total
    expect(section.textContent).toMatch(/grounding 0\.9/); // verbatim component
  });

  // spec(§12, no dead clicks): an AGENOME node renders a basic summary (id + status + energy from the
  // node/events — no new API; deep persona/prompt/tools is a flagged later slice).
  it('test_agenome_summary_renders', () => {
    render(
      <NodeInspectorContent
        selectedNode={{ dataRef: 'agn_0', type: 'agenome' }}
        runId="run_1"
        runClient={client()}
        events={[energyEvent('agn_0')]}
        lineage={lineage}
      />,
    );
    expect(screen.getByLabelText('Agenome inspector')).toBeTruthy();
    expect(screen.getByText('agn_0')).toBeTruthy(); // the agenome id
    expect(screen.getByText('active')).toBeTruthy(); // status from the lineage-node lookup
    expect(screen.getByText(/doppl_energy/i)).toBeTruthy(); // energy from deriveEnergyByAgenome
  });

  // spec(drawer UX): a null selection renders nothing (the drawer shows its own placeholder); swapping
  // the selected node swaps the content type.
  it('test_inspector_swaps_and_null', async () => {
    const { rerender, container } = render(
      <NodeInspectorContent
        selectedNode={{ dataRef: 'cand_0', type: 'candidate' }}
        runId="run_1"
        runClient={client()}
        events={[]}
        lineage={lineage}
      />,
    );
    expect(await screen.findByLabelText('Candidate inspector')).toBeTruthy();

    rerender(
      <NodeInspectorContent
        selectedNode={{ dataRef: 'agn_0', type: 'agenome' }}
        runId="run_1"
        runClient={client()}
        events={[]}
        lineage={lineage}
      />,
    );
    expect(screen.getByLabelText('Agenome inspector')).toBeTruthy(); // swapped to agenome
    expect(screen.queryByLabelText('Candidate inspector')).toBeNull(); // candidate content gone

    rerender(
      <NodeInspectorContent
        selectedNode={null}
        runId="run_1"
        runClient={client()}
        events={[]}
        lineage={lineage}
      />,
    );
    expect(container.textContent).toBe(''); // null → renders nothing
  });
});
