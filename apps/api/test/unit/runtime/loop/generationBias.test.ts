import { describe, expect, test } from 'vitest';
import {
  BIAS_FRAGMENTS,
  biasToTemperature,
  composeBiasFraming,
} from '../../../../src/runtime/loop/generationBias';

/**
 * FB.4 — the diverge/converge dial (Option A+): a system-authored band fragment composed into the TRUSTED
 * generation framing + a clamped temperature nudge. Pure/deterministic (rule #7); rule-#6-clean (no
 * judge/scoring words). These pin the band selection + the temperature formula; whether a band/temp
 * actually shifts generation is a live-LLM /eval question (model-dependent), NOT a unit assertion.
 */
describe('FB.4 — BIAS_FRAGMENTS + composeBiasFraming + biasToTemperature (pure)', () => {
  test('test_bias_fragments_exhaustive', () => {
    // every band except neutral has a non-empty system-authored fragment; neutral is empty (no framing).
    expect(BIAS_FRAGMENTS.neutral).toBe('');
    for (const band of ['strong_converge', 'converge', 'diverge', 'strong_diverge'] as const) {
      expect(BIAS_FRAGMENTS[band].trim().length).toBeGreaterThan(0);
    }
  });

  test('test_bias_fragments_no_judge_or_scoring_reference', () => {
    // rule #6 hygiene — a band fragment steers GENERATION; it must never reference the judge/scoring anchor.
    const forbidden = [
      'judge',
      'rubric',
      'scoring',
      'score',
      'fitness',
      'weight',
      'acceptance',
      'reward',
    ];
    for (const fragment of Object.values(BIAS_FRAGMENTS)) {
      const lower = fragment.toLowerCase();
      for (const word of forbidden) expect(lower).not.toContain(word);
    }
  });

  test('test_compose_bias_framing_band_selection', () => {
    // representative bias values select the correct band fragment; boundaries (−0.6 → converge; +0.6 →
    // strong_diverge) per the ratified band edges.
    expect(composeBiasFraming(-1)).toContain(BIAS_FRAGMENTS.strong_converge);
    expect(composeBiasFraming(-0.6)).toContain(BIAS_FRAGMENTS.converge);
    expect(composeBiasFraming(-0.4)).toContain(BIAS_FRAGMENTS.converge);
    expect(composeBiasFraming(0.4)).toContain(BIAS_FRAGMENTS.diverge);
    expect(composeBiasFraming(0.6)).toContain(BIAS_FRAGMENTS.strong_diverge);
    expect(composeBiasFraming(1)).toContain(BIAS_FRAGMENTS.strong_diverge);
  });

  test('test_neutral_bias_empty_framing', () => {
    // |bias| < 0.2 (neutral band) → '' (byte-identical to the no-bias baseline); absent → '' too.
    expect(composeBiasFraming(0)).toBe('');
    expect(composeBiasFraming(0.1)).toBe('');
    expect(composeBiasFraming(-0.1)).toBe('');
    expect(composeBiasFraming()).toBe('');
  });

  test('test_bias_to_temperature_formula', () => {
    // clamp(0.7 + 0.3*bias): −1 → 0.4, 0 → 0.7, +1 → 1.0. Pure/deterministic (rule #7).
    expect(biasToTemperature(-1)).toBeCloseTo(0.4, 10);
    expect(biasToTemperature(0)).toBeCloseTo(0.7, 10);
    expect(biasToTemperature(1)).toBeCloseTo(1.0, 10);
    expect(biasToTemperature(0.5)).toBe(biasToTemperature(0.5)); // deterministic
  });

  test('test_bias_to_temperature_clamped', () => {
    // clamped to [0.4, 1.2] — an out-of-range bias never pushes the temperature past the research ceiling.
    expect(biasToTemperature(2)).toBeLessThanOrEqual(1.2);
    expect(biasToTemperature(-2)).toBeGreaterThanOrEqual(0.4);
    for (const b of [-3, -1, -0.5, 0, 0.5, 1, 3]) {
      const t = biasToTemperature(b);
      expect(t).toBeGreaterThanOrEqual(0.4);
      expect(t).toBeLessThanOrEqual(1.2);
    }
  });

  test('test_direction_consistency', () => {
    // diverge (bias>0) → higher temp AND a breadth/diverge fragment; converge (bias<0) → lower temp AND a
    // depth/converge fragment — the framing and the temperature move in the SAME direction.
    expect(biasToTemperature(0.8)).toBeGreaterThan(0.7);
    expect(composeBiasFraming(0.8)).toContain(BIAS_FRAGMENTS.strong_diverge);
    expect(biasToTemperature(-0.8)).toBeLessThan(0.7);
    expect(composeBiasFraming(-0.8)).toContain(BIAS_FRAGMENTS.strong_converge);
  });
});
