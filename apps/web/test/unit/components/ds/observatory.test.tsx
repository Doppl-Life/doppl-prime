// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  ActivityTicker,
  AgenomeCard,
  CandidateCard,
  HealthIndicator,
  RunEnergyGauge,
} from '../../../../src/components/ds';

afterEach(() => cleanup());

describe('ds/cards + observatory — composed panel vocabulary', () => {
  // spec(§12): CandidateCard composes StatusBadge + Meter; the selected winner gets the gold glow
  // treatment; ids/scores render as machine truth (0–1).
  it('test_candidate_card_composes_badge_meter_and_winner_glow', () => {
    const { container } = render(
      <CandidateCard
        candidate={{
          id: 'cand_g3_004',
          subtype: 'cross_domain_transfer',
          title: 'Cold-chain routing via epidemic-curve forecasting',
          status: 'selected',
          agenomeId: 'ag_a3',
        }}
        fitnessTotal={0.84}
        novelty={0.74}
        generation={3}
      />,
    );
    expect(screen.getByText('Cold-chain routing via epidemic-curve forecasting')).toBeTruthy();
    expect(screen.getByText('cand_g3_004')).toBeTruthy();
    expect(screen.getByText('selected')).toBeTruthy(); // StatusBadge composed in
    expect(screen.getByText('0.84')).toBeTruthy(); // Meter (fitness) number
    const card = container.querySelector('[data-testid="candidate-card"]') as HTMLElement;
    expect(card.getAttribute('style')).toContain('--glow-winner'); // selected → winner glow

    cleanup();
    const plain = render(
      <CandidateCard
        candidate={{ id: 'cand_x', subtype: 'zeitgeist_synthesis', title: 'X', status: 'scored' }}
      />,
    );
    const plainCard = plain.container.querySelector(
      '[data-testid="candidate-card"]',
    ) as HTMLElement;
    expect(plainCard.getAttribute('style')).not.toContain('--glow-winner'); // not selected → no glow
  });

  // spec(§12): AgenomeCard renders id + fusion parentage + energy spent (length-is-truth Meter).
  it('test_agenome_card_parentage_and_energy', () => {
    render(
      <AgenomeCard
        agenome={{ id: 'ag_a3', status: 'eligible_parent', parentIds: ['ag_a0', 'ag_a2'] }}
        energySpent={30}
        energyBudget={50}
        candidatesProduced={4}
      />,
    );
    expect(screen.getByText('ag_a3')).toBeTruthy();
    expect(screen.getByText(/child of ag_a0 × ag_a2/)).toBeTruthy(); // two-parent fusion parentage
    expect(screen.getByText('eligible')).toBeTruthy(); // StatusBadge composed in
  });

  // spec(§12): ActivityTicker renders the event feed newest-first by sequence; empty → an honest
  // "waiting" placeholder (never a blank panel).
  it('test_activity_ticker_feed_and_empty', () => {
    render(
      <ActivityTicker
        events={[
          { sequence: 1, type: 'agenome.spawned', phrase: 'ag_a0 spawned' },
          { sequence: 2, type: 'fitness.scored', phrase: 'cand_g3_004 → 0.84 (winner)' },
        ]}
      />,
    );
    expect(screen.getByText(/cand_g3_004 → 0.84/)).toBeTruthy();
    cleanup();
    render(<ActivityTicker events={[]} />);
    expect(screen.getByText(/waiting for events/i)).toBeTruthy();
  });

  // spec(§12): HealthIndicator surfaces the runtime status + the continue-vs-switch read.
  it('test_health_indicator_renders_status', () => {
    render(
      <HealthIndicator
        health={{ currentGeneration: 3, candidatesInFlight: 2, lastEventAgeMs: 500 }}
        status="healthy"
      />,
    );
    expect(screen.getByText('healthy')).toBeTruthy();
    expect(screen.getByText(/gen 3/)).toBeTruthy();
  });

  // spec(§12 / rule #5): RunEnergyGauge reflects spent/budget as machine truth with the unit.
  it('test_run_energy_gauge_spent_budget', () => {
    const { container } = render(<RunEnergyGauge spent={6420} budget={12000} />);
    expect(container.textContent).toContain('6,420');
    expect(container.textContent).toContain('12,000');
    expect(container.textContent).toContain('doppl_energy');
  });
});
