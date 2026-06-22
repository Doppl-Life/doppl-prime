// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validCandidateIdeaCrossDomain } from '@doppl/contracts';
import type { CandidateIdea, LineageGraphProjection, RunEventEnvelope } from '@doppl/contracts';
import { FinalIdeaPanel } from '../../../src/panels/FinalIdeaPanel';
import { makeEvent } from '../../fixtures/events';

const PANELS_DIR = resolve(process.cwd(), 'src/panels');
const WIN = validCandidateIdeaCrossDomain;
afterEach(() => cleanup());

function lineageWith(nodes: LineageGraphProjection['nodes']): LineageGraphProjection {
  return { runId: 'run_1', nodes, edges: [], sequenceThrough: 30 };
}
const winnerLineage = lineageWith([
  { id: 'w', type: 'candidate', label: 'Winner', status: 'selected', dataRef: 'cand_1' },
]);
function client(result: CandidateIdea | Error) {
  return {
    getCandidate: vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    ),
  };
}
function fitnessEvent(
  seq: number,
  total: number,
  components: Record<string, number>,
): RunEventEnvelope {
  return makeEvent(seq, 'fitness.scored', {
    candidateId: 'cand_1',
    payload: {
      id: `fit_${seq}`,
      candidateId: 'cand_1',
      total,
      components,
      policyVersion: 'scoring-v1',
      explanation: 'x',
    },
  });
}
function energyEvent(seq: number, actual: number): RunEventEnvelope {
  return makeEvent(seq, 'energy.spent', {
    agenomeId: 'agn_1',
    payload: {
      id: `en_${seq}`,
      runId: 'run_1',
      agenomeId: 'agn_1',
      eventType: 'llm',
      estimate: actual,
      actual,
      unit: 'doppl_energy',
      reason: 'gen',
    },
  });
}
function reviewEvent(seq: number, mandate: string): RunEventEnvelope {
  return makeEvent(seq, 'critic.reviewed', {
    candidateId: 'cand_1',
    payload: {
      id: `crev_${seq}`,
      candidateId: 'cand_1',
      mandate,
      scores: { rigor: 0.8 },
      critique: `crit ${seq}`,
      confidence: 0.8,
      evidenceRefs: [],
    },
  });
}
function checkEvent(seq: number, checkType: string): RunEventEnvelope {
  return makeEvent(seq, 'check.completed', {
    candidateId: 'cand_1',
    payload: {
      id: `chk_${seq}`,
      candidateId: 'cand_1',
      checkType,
      status: 'passed',
      evidenceRefs: [],
    },
  });
}

describe('FinalIdeaPanel — final surviving-idea proof (capstone)', () => {
  // spec(§12 defensibility): renders the winner idea + the proof sections (fitness/energy/critics/checks).
  it('test_renders_idea_and_proof_links', async () => {
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[
          fitnessEvent(1, 0.84, { critic: 0.7 }),
          energyEvent(2, 120),
          reviewEvent(3, 'feasibility'),
          checkEvent(4, 'math_check'),
        ]}
        runClient={client(WIN)}
      />,
    );
    await screen.findByText(WIN.title);
    expect(screen.getByText(WIN.summary)).toBeTruthy();
    expect(screen.getByText(/0\.84/)).toBeTruthy(); // fitness total
    expect(screen.getByText(/120/)).toBeTruthy(); // energy
    expect(screen.getByText(/feasibility/)).toBeTruthy(); // critic mandate (defensibility evidence)
    expect(screen.getByText(/math_check/)).toBeTruthy(); // subtype check (defensibility evidence)
  });

  // spec(§9/§4/rule #9): traces (langfuseTraceId/observationId) render IN-TIER — never an external href.
  it('test_traces_in_tier', async () => {
    const { container } = render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[
          makeEvent(1, 'candidate.created', {
            candidateId: 'cand_1',
            langfuseTraceId: 'tr_42',
            langfuseObservationId: 'ob_7',
            payload: {},
          }),
        ]}
        runClient={client(WIN)}
      />,
    );
    await screen.findByText(WIN.title);
    expect(screen.getByText(/tr_42/)).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
  });

  // spec(§12 partial-data): no selected winner (run in progress) → graceful affordance; getCandidate NOT called.
  it('test_no_winner_graceful', () => {
    const c = client(WIN);
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={lineageWith([
          { id: 'c', type: 'candidate', label: 'c', status: 'scored', dataRef: 'cand_x' },
        ])}
        events={[]}
        runClient={c}
      />,
    );
    expect(screen.getByText(/no final idea yet/i)).toBeTruthy();
    expect(c.getCandidate).not.toHaveBeenCalled();
  });

  // spec(§12): a winner-load failure surfaces an accessible error.
  it('test_load_failure_surfaces_error', async () => {
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[]}
        runClient={client(new Error('boom'))}
      />,
    );
    await screen.findByRole('alert');
  });

  // spec(rule #6): no apps/api import.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(PANELS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${PANELS_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src, f).not.toMatch(/@doppl\/api/);
    }
  });

  // spec(_adherence): no raw hex.
  it('test_no_raw_hex', () => {
    const files = readdirSync(PANELS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${PANELS_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
