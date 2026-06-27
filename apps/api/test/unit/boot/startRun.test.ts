import { describe, it, expect } from 'vitest';
import { validRunConfig } from '@doppl/contracts';
import { extractRunConfig } from '../../../src/boot/startRun';

/**
 * Islands pivot Increment A — extractRunConfig reconstructs the strict RunConfig from a run.configured
 * payload while TOLERATING extra run-level metadata (caseStudyId rides the generic payload, §107, zero
 * contract bump). A raw strict RunConfig.safeParse of the whole payload would REJECT the extra key; this
 * helper picks RunConfig's own fields first. Pure.
 */

describe('extractRunConfig', () => {
  it('parses a clean RunConfig payload unchanged', () => {
    expect(extractRunConfig({ ...validRunConfig })).toEqual(validRunConfig);
  });

  it('tolerates a caseStudyId sibling — strips it, returns the intact RunConfig', () => {
    const payload = { ...validRunConfig, caseStudyId: 'cs_er_flow' };
    const parsed = extractRunConfig(payload);
    expect(parsed).toEqual(validRunConfig); // caseStudyId is NOT a RunConfig field — dropped
    expect(parsed).not.toHaveProperty('caseStudyId');
  });

  it('tolerates arbitrary future run-level metadata (generic, not hardcoded to caseStudyId)', () => {
    const payload = {
      ...validRunConfig,
      caseStudyId: 'cs_1',
      problemRecoveryId: 'pr_1',
      extra: 42,
    };
    expect(extractRunConfig(payload)).toEqual(validRunConfig);
  });

  it('returns undefined when the picked fields do not form a valid RunConfig', () => {
    expect(extractRunConfig({ seed: 'only a seed', caseStudyId: 'cs_1' })).toBeUndefined();
  });

  it('returns undefined for a non-object payload', () => {
    expect(extractRunConfig(null)).toBeUndefined();
    expect(extractRunConfig('a string')).toBeUndefined();
    expect(extractRunConfig([validRunConfig])).toBeUndefined();
  });
});
