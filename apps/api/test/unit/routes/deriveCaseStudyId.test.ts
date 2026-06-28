import { describe, it, expect } from 'vitest';
import { deriveCaseStudyId } from '../../../src/routes/_support/deriveCaseStudyId';

/**
 * deriveCaseStudyId — the stable, readable case-study id derived from a run's seed (Islands pivot A4). Pure +
 * deterministic so re-running the same prompt groups runs under one case study (and replay re-derives).
 */

describe('deriveCaseStudyId', () => {
  it('is deterministic — the same seed yields the same id', () => {
    const seed = 'Reduce 30-day hospital readmissions via a cross-domain transfer.';
    expect(deriveCaseStudyId(seed)).toBe(deriveCaseStudyId(seed));
  });

  it('normalizes a leading "Problem:" label, whitespace, and case so trivial variants group', () => {
    const a = deriveCaseStudyId('Problem:   Smooth ER patient flow');
    const b = deriveCaseStudyId('smooth er patient flow');
    expect(a).toBe(b);
  });

  it('gives different seeds different ids', () => {
    expect(deriveCaseStudyId('reduce hospital readmissions')).not.toBe(
      deriveCaseStudyId('cut recycling contamination'),
    );
  });

  it('produces a readable cs-<slug>-<hash> id', () => {
    const id = deriveCaseStudyId('Reframe educational assessment for durable understanding');
    expect(id).toMatch(/^cs-[a-z0-9-]+$/);
    expect(id.startsWith('cs-')).toBe(true);
  });

  it('falls back to cs-<hash> when the seed has no slug-able characters', () => {
    const id = deriveCaseStudyId('!!! ??? ...');
    expect(id).toMatch(/^cs-[a-z0-9]+$/);
  });
});
