// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReplayScrubber } from '../../../../src/components/run/ReplayScrubber';

afterEach(() => cleanup());

describe('ReplayScrubber — replay step control (FV.8)', () => {
  // spec(the control contract): a labeled range slider + a "step N of M" readout; onChange fires with
  // the new numeric index.
  it('test_replay_scrubber_renders_step_readout', () => {
    const onChange = vi.fn();
    render(<ReplayScrubber totalSteps={5} value={3} onChange={onChange} />);

    const slider = screen.getByLabelText(/replay step/i) as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.type).toBe('range'); // keyboard-steppable native control
    expect(screen.getByText(/step 3 of 5/i)).toBeTruthy(); // the readout

    fireEvent.change(slider, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2); // numeric index, not a string
  });
});
