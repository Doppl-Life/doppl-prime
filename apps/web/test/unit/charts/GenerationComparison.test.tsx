// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { validFitnessScore, validNoveltyScore } from '@doppl/contracts';
import type { RunEventEnvelope } from '@doppl/contracts';
import { GenerationComparison } from '../../../src/charts/GenerationComparison';
import { makeEvent } from '../../fixtures/events';

const CHARTS_DIR = resolve(process.cwd(), 'src/charts');

afterEach(() => cleanup());

function fitnessEvent(sequence: number, generationId: string, total: number): RunEventEnvelope {
  return makeEvent(sequence, 'fitness.scored', {
    generationId,
    candidateId: `cand_${sequence}`,
    payload: { ...validFitnessScore, candidateId: `cand_${sequence}`, total },
  });
}
function noveltyEvent(sequence: number, generationId: string, score: number): RunEventEnvelope {
  return makeEvent(sequence, 'novelty.scored', {
    generationId,
    candidateId: `cand_${sequence}`,
    payload: { ...validNoveltyScore, candidateId: `cand_${sequence}`, score },
  });
}

describe('GenerationComparison — per-generation fitness/novelty comparison chart', () => {
  // spec(rule #4 / §12): the fitness + novelty series each carry a text label (not color alone).
  it('test_charts_encode_beyond_color', () => {
    render(
      <GenerationComparison
        events={[fitnessEvent(1, 'gen_0', 0.6), noveltyEvent(2, 'gen_0', 0.7)]}
      />,
    );
    expect(screen.getByText(/fitness \(best\)/i)).toBeTruthy();
    expect(screen.getByText(/novelty \(best\)/i)).toBeTruthy();
  });

  // spec(§12 partial-data): zero data → empty-state affordance; one generation → renders without throw.
  it('test_charts_render_partial_data', () => {
    const { rerender } = render(<GenerationComparison events={[]} />);
    expect(screen.getByText(/no generation data/i)).toBeTruthy();

    rerender(<GenerationComparison events={[fitnessEvent(1, 'gen_0', 0.6)]} />);
    expect(screen.queryByText(/no generation data/i)).toBeNull();
    expect(screen.getByText(/fitness \(best\)/i)).toBeTruthy();
  });

  // spec(rule #6): the charts module imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(CHARTS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${CHARTS_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src, f).not.toMatch(/@doppl\/api/);
    }
  });

  // spec(_adherence): styling colors come from chartTheme var() tokens — no raw hex. Chart geometry
  // (scale/coord numerics) is EXEMPT (non-styling), so only the hex channel is asserted here.
  it('test_no_raw_hex', () => {
    const files = readdirSync(CHARTS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${CHARTS_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
