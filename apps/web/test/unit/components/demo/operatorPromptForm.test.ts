import { describe, expect, test } from 'vitest';
import {
  buildDemoSeed,
  validateOperatorPrompt,
  type OperatorPromptFormValues,
} from '../../../../src/components/demo/operatorPromptForm';

/**
 * PD.5b — operatorPromptForm pure logic (ARCHITECTURE.md §17). The operator picks a prepared problem OR
 * types a freeform prompt; both resolve to the run's `seed` (→ RunConfig.seed via the existing POST /runs
 * deep-merge). validate fails closed when no seed can be formed (RunConfig.seed is min(1)).
 */

const PREPARED = {
  id: 'demo-1',
  title: 'Cross-domain transfer demo',
  prompt: 'Find a technique from one domain that solves a problem in another.',
};

describe('operatorPromptForm (PD.5b — prepared/freeform → seed)', () => {
  // §17 prepared path — source=prepared + a selected problem → the problem's prompt is the seed.
  test('build_demo_seed_from_prepared', () => {
    const form: OperatorPromptFormValues = { source: 'prepared', prepared: PREPARED, freeformText: '' };
    expect(buildDemoSeed(form)).toBe(PREPARED.prompt);
  });

  // §17 operator-prompt path — source=freeform + typed text → the freeform text is the seed.
  test('build_demo_seed_from_freeform', () => {
    const form: OperatorPromptFormValues = {
      source: 'freeform',
      prepared: null,
      freeformText: 'Design a low-cost off-grid water filter.',
    };
    expect(buildDemoSeed(form)).toBe('Design a low-cost off-grid water filter.');
  });

  // RunConfig.seed min(1) — fail closed: no prepared chosen / empty or whitespace-only freeform → error;
  // a valid form → { ok, seed }.
  test('validate_rejects_empty_or_no_source', () => {
    expect(validateOperatorPrompt({ source: 'prepared', prepared: null, freeformText: '' }).ok).toBe(
      false,
    ); // prepared source but nothing selected
    expect(
      validateOperatorPrompt({ source: 'freeform', prepared: null, freeformText: '' }).ok,
    ).toBe(false); // empty freeform
    expect(
      validateOperatorPrompt({ source: 'freeform', prepared: null, freeformText: '   ' }).ok,
    ).toBe(false); // whitespace-only freeform
    expect(validateOperatorPrompt({ source: 'prepared', prepared: PREPARED, freeformText: '' })).toEqual({
      ok: true,
      seed: PREPARED.prompt,
    });
  });
});
