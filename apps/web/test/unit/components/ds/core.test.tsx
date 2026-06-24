// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button, Meter, StatusBadge } from '../../../../src/components/ds';
import { resolveStatus } from '../../../../src/components/core/status-map';

afterEach(() => cleanup());

describe('ds/core — StatusBadge + status-map + Meter + Button', () => {
  // spec(rule #4 / §12): status is encoded as SHAPE (glyph) + LABEL + color — never color alone.
  it('test_status_badge_encodes_shape_and_label', () => {
    render(<StatusBadge domain="candidate" status="selected" />);
    expect(screen.getByText('selected')).toBeTruthy(); // the text-label channel
    const glyph = document.querySelector('[aria-hidden="true"]'); // the shape channel
    expect(glyph?.textContent).toBe('♔');
  });

  // spec(LESSONS §3): the status map is exhaustive over the frozen enums; an unmapped status resolves
  // to the neutral handler (label preserved) and NEVER throws.
  it('test_status_map_unknown_status_neutral', () => {
    const spec = resolveStatus('candidate', 'totally_unknown_xyz');
    expect(spec.glyph).toBe('?');
    expect(spec.label).toBe('totally_unknown_xyz');
    expect(spec.colorToken).toBe('var(--fg-muted)');
    expect(() => resolveStatus('agenome', 'nope')).not.toThrow();
  });

  // spec(rule #1 / #5 / §12): Meter renders a 0–1 value with the number shown AND the bar length
  // encoding the value (length is truth); out-of-range is clamped, never rendered raw.
  it('test_meter_value_0_1_and_number_shown', () => {
    const { container } = render(<Meter value={0.42} kind="fitness" />);
    expect(screen.getByText('0.42')).toBeTruthy(); // the number is shown
    const fill = container.querySelector('[data-testid="meter-fill"]') as HTMLElement;
    expect(fill.style.width).toBe('42%'); // length encodes the value
    cleanup();

    const over = render(<Meter value={1.8} kind="fitness" />);
    const overFill = over.container.querySelector('[data-testid="meter-fill"]') as HTMLElement;
    expect(overFill.style.width).toBe('100%'); // clamped to [0,1]
  });

  // spec(rule #5): a degraded Meter is visually distinct (striped fill) AND carries a text flag —
  // the system tells the truth about estimated data, never silently.
  it('test_meter_degraded_state_labeled', () => {
    const { container } = render(<Meter value={0.5} kind="novelty" degraded />);
    expect(screen.getByText(/~est/)).toBeTruthy(); // the honest-degradation text flag
    const fill = container.querySelector('[data-testid="meter-fill"]') as HTMLElement;
    expect(fill.style.backgroundImage).toContain('repeating-linear-gradient'); // distinct stripe
  });

  // spec(§12): the Button primitive renders each variant + disabled; onClick fires only when enabled.
  it('test_button_variants_render', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" glyph="▶" onClick={onClick}>
        Start
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /start/i });
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBe('▶'); // leading glyph
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      cleanup();
      render(<Button variant={variant}>X</Button>);
      expect(screen.getByRole('button')).toBeTruthy();
    }

    cleanup();
    const onDisabled = vi.fn();
    render(
      <Button disabled onClick={onDisabled}>
        Y
      </Button>,
    );
    const disabled = screen.getByRole('button');
    expect(disabled.hasAttribute('disabled')).toBe(true);
    disabled.click();
    expect(onDisabled).not.toHaveBeenCalled(); // a disabled button dispatches no click
  });
});
