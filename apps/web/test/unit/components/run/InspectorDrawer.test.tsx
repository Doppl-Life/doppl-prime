// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InspectorDrawer } from '../../../../src/components/run/InspectorDrawer';

afterEach(() => cleanup());

describe('InspectorDrawer — right-pane inspector slot (FV.4; content = FV.5)', () => {
  // spec(§12 / FV.5 slot): closed (selectedId null) → the drawer unmounts entirely so the parent
  // grid can collapse its third column; opened (selectedId set) → the panel + a close affordance
  // whose click calls onClose; children (FV.5 content) render when provided.
  it('test_inspector_drawer_empty_then_open_close', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<InspectorDrawer selectedId={null} onClose={onClose} />);
    // closed → unmounted; no aside, no close button.
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();

    // opened → close affordance present; clicking it calls onClose.
    rerender(
      <InspectorDrawer selectedId="cand_1" onClose={onClose}>
        <div>FV5_CONTENT</div>
      </InspectorDrawer>,
    );
    expect(screen.getByText('FV5_CONTENT')).toBeTruthy(); // FV.5 content slot
    const close = screen.getByRole('button', { name: /close/i });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // spec(DS rule #4): the open drawer's animation uses a named motion token (no hardcoded duration);
  // the global prefers-reduced-motion guard (tokens/base.css) neutralizes it. Asserted structurally
  // (the file references a var(--motion-*) token — pinned by the adherence test) + here that an opened
  // drawer carries an animation style at all.
  it('test_reduced_motion_drawer', () => {
    const { container } = render(<InspectorDrawer selectedId="cand_1" onClose={() => undefined} />);
    const panel = container.querySelector('[data-testid="inspector-drawer"]') as HTMLElement;
    expect(panel.style.animation).toContain('var(--motion'); // named token, not a hardcoded ms
  });
});
