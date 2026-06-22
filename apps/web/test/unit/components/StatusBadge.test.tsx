// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../../../src/components/core/StatusBadge';

// happy-dom rewrites import.meta.url to a non-file URL, so resolve from the vitest cwd (apps/web).
const CORE_DIR = resolve(process.cwd(), 'src/components/core');

describe('StatusBadge — accessible status primitive', () => {
  // spec(§12): status renders with shape (glyph) AND text label (never color alone).
  it('test_renders_shape_icon_label', () => {
    const { container } = render(<StatusBadge domain="agenome" status="active" />);
    expect(container.textContent).toContain('active'); // text label present
    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toBe('◐'); // shape/icon glyph present
  });

  // spec(§12): the glyph is aria-hidden; the status is programmatically determinable via title/label.
  it('test_glyph_aria_hidden_status_in_title', () => {
    const { container } = render(<StatusBadge domain="check" status="passed" />);
    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    const titled = container.querySelector('[title]');
    expect(titled?.getAttribute('title')).toContain('passed');
  });

  // spec(§12): an unknown status renders the neutral indicator without throwing or rendering blank.
  it('test_unknown_status_renders_neutral_not_throw', () => {
    expect(() => render(<StatusBadge domain="agenome" status="bogus" />)).not.toThrow();
    const { container } = render(<StatusBadge domain="agenome" status="bogus" />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('?');
  });

  // spec(_adherence): no raw hex / no raw px in the component (tokens via var() only).
  it('test_component_no_raw_hex_or_px', () => {
    const files = readdirSync(CORE_DIR).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${CORE_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} contains a raw px value`).not.toMatch(/\b\d+px\b/);
    }
  });

  // spec(rule #9): the component imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(CORE_DIR).filter((n) => n.endsWith('.ts') || n.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${CORE_DIR}/${f}`, 'utf8');
      expect(src).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src).not.toMatch(/@doppl\/api/);
    }
  });
});
