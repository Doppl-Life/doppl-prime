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

const scoredOnlyLineage = lineageWith([
  { id: 'c', type: 'candidate', label: 'c', status: 'scored', dataRef: 'cand_x' },
]);

describe('FinalIdeaPanel — PD.7 evidence-rung label + terminal zero-survivors', () => {
  // spec(§17/§12, rule #4): a LIVE run labels the transfer-evidence rung "live allowlisted
  // (non-executing)" — derived from the run mode (zero new contract surface), text not color-only.
  it('test_evidence_rung_labeled_live', async () => {
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[checkEvent(4, 'math_check')]}
        runClient={client(WIN)}
        mode="live"
      />,
    );
    await screen.findByText(WIN.title);
    expect(screen.getByText(/live allowlisted \(non-executing\)/i)).toBeTruthy();
  });

  // spec(§17): a REPLAY run labels the rung "replay-backed" (the labeled state is unambiguous on the projector).
  it('test_evidence_rung_labeled_replay', async () => {
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[checkEvent(4, 'math_check')]}
        runClient={client(WIN)}
        mode="replay"
      />,
    );
    await screen.findByText(WIN.title);
    expect(screen.getByText(/replay-backed/i)).toBeTruthy();
  });

  // spec(§9/LESSON 7): the winner's evidenceRefs render via the shared EvidenceRefLink IN-TIER (kind +
  // label present; NO <a>/[href]) — realizing the not-yet-done final-idea reuse.
  it('test_winner_evidence_refs_render_in_tier', async () => {
    const { container } = render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[]}
        runClient={client(WIN)} // WIN.evidenceRefs = [{ kind: 'prior_art', label: 'AIRS 2003' }]
        mode="live"
      />,
    );
    await screen.findByText(WIN.title);
    expect(screen.getByText('prior_art')).toBeTruthy();
    expect(screen.getByText('AIRS 2003')).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
  });

  // spec(§12 partial-data): a winner with EMPTY evidenceRefs → graceful (no EvidenceRefLink, no crash).
  it('test_no_evidence_refs_graceful', async () => {
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[]}
        runClient={client({ ...WIN, evidenceRefs: [] })}
        mode="live"
      />,
    );
    await screen.findByText(WIN.title); // renders without crashing
    expect(screen.queryByText('prior_art')).toBeNull(); // empty refs → no EvidenceRefLink rendered
  });

  // spec(§12 acceptance #3): no selected winner + a TERMINAL run → reflect the terminal state, never
  // fabricate an idea; getCandidate is NOT called.
  it('test_terminal_zero_survivors_reflects_failed', () => {
    const c = client(WIN);
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={scoredOnlyLineage}
        events={[]}
        runClient={c}
        runStatus="run.failed"
      />,
    );
    expect(screen.getByText(/no surviving idea — run failed/i)).toBeTruthy();
    expect(screen.queryByText(/appears once a candidate is selected/i)).toBeNull();
    expect(c.getCandidate).not.toHaveBeenCalled();
  });

  // spec(backward-compat): no winner + NON-terminal (runStatus undefined) → the EXISTING in-progress
  // affordance — the terminal branch must not swallow the in-progress case.
  it('test_no_winner_in_progress_unchanged', () => {
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={scoredOnlyLineage}
        events={[]}
        runClient={client(WIN)}
      />,
    );
    expect(screen.getByText(/appears once a candidate is selected/i)).toBeTruthy();
  });

  // spec(rule #8): displayed energy = successful productive spend only — a provider_call_failed event
  // contributes NOTHING (only energy.spent.actual does).
  it('test_energy_excludes_failed_calls', async () => {
    render(
      <FinalIdeaPanel
        runId="run_1"
        lineage={winnerLineage}
        events={[
          makeEvent(1, 'provider_call_failed', { agenomeId: 'agn_1', payload: {} }),
          energyEvent(2, 120),
        ]}
        runClient={client(WIN)}
        mode="live"
      />,
    );
    await screen.findByText(WIN.title);
    expect(screen.getByText('120 doppl_energy')).toBeTruthy(); // ONLY the energy.spent.actual
  });
});
