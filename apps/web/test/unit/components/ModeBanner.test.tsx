// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModeBanner, deriveMode } from '../../../src/components/feedback/ModeBanner';

// happy-dom rewrites import.meta.url to a non-file URL, so resolve from the vitest cwd (apps/web).
const FEEDBACK_DIR = resolve(process.cwd(), 'src/components/feedback');

describe('ModeBanner — live/replay mode indicator', () => {
  // spec(§12): banner state is DERIVED from store mode (live|replay) + the run's RunStatus; replay
  // overrides; the status mapping is total over all 8 frozen RunStatus values.
  it('test_derive_mode_from_store_and_status', () => {
    expect(deriveMode('replay', 'running')).toBe('replay'); // replay overrides status
    expect(deriveMode('live', 'configured')).toBe('live');
    expect(deriveMode('live', 'running')).toBe('live');
    expect(deriveMode('live', 'completing')).toBe('live');
    expect(deriveMode('live', 'completed')).toBe('complete');
    expect(deriveMode('live', 'stopping')).toBe('stopped');
    expect(deriveMode('live', 'stopped')).toBe('stopped');
    expect(deriveMode('live', 'cancelled')).toBe('stopped');
    expect(deriveMode('live', 'failed')).toBe('failed');
  });

  // spec(REQ-UX-002): replay is clearly marked REPLAY + shows the recorded-at stamp / original time.
  it('test_replay_clearly_marked', () => {
    const { container } = render(<ModeBanner mode="replay" recordedAt="2026-06-18" />);
    expect(container.textContent).toContain('REPLAY');
    expect(container.textContent).toContain('recorded run');
    expect(container.textContent).toContain('2026-06-18');
  });

  // spec(§12 / forbidden #4): live vs replay differ by LABEL + ICON/SHAPE, not color alone. (The
  // amber hatch is the redundant 3rd channel but is a real-browser CSS feature happy-dom can't
  // serialize, so the testable invariant is the distinct label + the aria-hidden shape/icon.)
  it('test_not_color_alone', () => {
    const live = render(<ModeBanner mode="live" />).container;
    const replay = render(<ModeBanner mode="replay" />).container;
    expect(live.textContent).toContain('LIVE');
    expect(live.textContent).not.toContain('REPLAY');
    expect(replay.textContent).toContain('REPLAY');
    // each carries a non-color SHAPE/ICON channel (aria-hidden glyph / breathing dot).
    expect(live.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(replay.querySelector('[aria-hidden="true"]')?.textContent).toBe('⏮');
  });

  // spec(§17 fallback ladder): a live→replay mode change updates the banner.
  it('test_mode_updates_on_live_to_replay_fallback', () => {
    const { container, rerender } = render(<ModeBanner mode={deriveMode('live', 'running')} />);
    expect(container.textContent).toContain('LIVE');
    rerender(<ModeBanner mode={deriveMode('replay', 'running')} />);
    expect(container.textContent).toContain('REPLAY');
    expect(container.textContent).not.toContain('LIVE');
  });

  // spec(_adherence): no raw hex / no raw px in the component (tokens via var() only).
  it('test_no_raw_hex_or_px', () => {
    const files = readdirSync(FEEDBACK_DIR).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${FEEDBACK_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} contains a raw px value`).not.toMatch(/\b\d+px\b/);
    }
  });

  // spec(rule #9): the component imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(FEEDBACK_DIR).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${FEEDBACK_DIR}/${f}`, 'utf8');
      expect(src).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src).not.toMatch(/@doppl\/api/);
    }
  });
});
