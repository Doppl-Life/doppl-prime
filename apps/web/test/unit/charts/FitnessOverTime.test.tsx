// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { validFitnessScore } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { FitnessOverTime } from '../../../src/charts/FitnessOverTime';
import { MARKER_GLYPH } from '../../../src/charts/chartTheme';
import { makeEvent } from '../../fixtures/events';

afterEach(() => cleanup());

function fitnessEvent(sequence: number, generationId: string, total: number): RunEventEnvelope {
  return makeEvent(sequence, 'fitness.scored', {
    generationId,
    candidateId: `cand_${sequence}`,
    payload: { ...validFitnessScore, candidateId: `cand_${sequence}`, total },
  });
}

describe('FitnessOverTime — fitness-over-generation chart', () => {
  // spec(rule #4 / §12): the series carries a marker + a text label, not color alone.
  it('test_charts_encode_beyond_color', () => {
    render(
      <FitnessOverTime events={[fitnessEvent(1, 'gen_0', 0.4), fitnessEvent(2, 'gen_1', 0.7)]} />,
    );
    expect(screen.getByText(/fitness \(best\)/i)).toBeTruthy(); // the text-label channel
    expect(screen.getAllByText(MARKER_GLYPH.circle).length).toBeGreaterThan(0); // the marker channel
  });

  // spec(§12 partial-data): zero data → an empty-state affordance (no throw/blank); one generation → renders.
  it('test_charts_render_partial_data', () => {
    const { rerender } = render(<FitnessOverTime events={[]} />);
    expect(screen.getByText(/no fitness data/i)).toBeTruthy(); // empty-state affordance

    rerender(<FitnessOverTime events={[fitnessEvent(1, 'gen_0', 0.5)]} />);
    expect(screen.queryByText(/no fitness data/i)).toBeNull(); // now has data
    expect(screen.getByText(/fitness \(best\)/i)).toBeTruthy();
  });
});
