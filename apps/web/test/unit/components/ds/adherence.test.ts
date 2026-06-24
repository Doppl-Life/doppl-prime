import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ds from '../../../../src/components/ds';

const DS_DIR = resolve(process.cwd(), 'src/components/ds');
const BASE_CSS = resolve(process.cwd(), 'src/styles/tokens/base.css');

function dsFiles(): string[] {
  return readdirSync(DS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

describe('ds — design-system adherence (the five DS rules)', () => {
  // spec(_adherence / rule #3 / #5): colors + spacing are var(--token) only — no raw hex, no raw px
  // strings. (Bare numeric geometry — fontSize/width/height — is layout, EXEMPT per LESSONS §5/§6.)
  it('test_no_raw_hex_or_px_in_ds', () => {
    const files = dsFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${DS_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} contains a raw px string`).not.toMatch(/\b\d+px\b/);
    }
  });

  // spec(rule #4): motion is meaningful — any animation/transition declaration references a named
  // var(--motion-*)/var(--ease-*) token, never a hardcoded ms/s duration.
  it('test_motion_via_named_tokens', () => {
    for (const f of dsFiles()) {
      const src = readFileSync(`${DS_DIR}/${f}`, 'utf8');
      expect(src, `${f} hardcodes an animation/transition duration`).not.toMatch(
        /(animation|transition):[^,;}\n]*\b\d+(\.\d+)?m?s\b/,
      );
    }
  });

  // spec(rule #4): the global prefers-reduced-motion guard (tokens/base.css) neutralizes every
  // animation/transition — meaning survives without motion (asserted structurally).
  it('test_reduced_motion_guard_present', () => {
    const base = readFileSync(BASE_CSS, 'utf8');
    expect(base).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(base).toMatch(/animation-duration:\s*0/);
    expect(base).toMatch(/transition-duration:\s*0/);
  });

  // spec(Step 7.5 wiring): the ds/index.ts barrel is the canonical FV.1+ import surface — every
  // ported component + the reconciled StatusBadge/ModeBanner resolve from it.
  it('test_ds_barrel_exports_resolve', () => {
    const expected = [
      'Button',
      'Meter',
      'EmptyState',
      'LoadingState',
      'ErrorState',
      'DegradedState',
      'CandidateCard',
      'AgenomeCard',
      'ActivityTicker',
      'HealthIndicator',
      'RunEnergyGauge',
      'StatusBadge',
      'ModeBanner',
    ];
    const bag = ds as Record<string, unknown>;
    for (const name of expected) {
      expect(typeof bag[name], `ds barrel missing ${name}`).toBe('function');
    }
  });
});
