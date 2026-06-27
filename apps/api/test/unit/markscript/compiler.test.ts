import { describe, expect, test } from 'vitest';
import {
  validCandidateIdeaCrossDomain,
  validFitnessScore,
  validJudgeResult,
  validNoveltyScore,
} from '@doppl/contracts';
import { compileCaseStudyNode, compilePromotedNode } from '../../../src/markscript/compiler';

describe('MarkScript compiler - Agarden display contract', () => {
  test('compiles a case study into the Agarden case-study section shape', () => {
    const compiled = compileCaseStudyNode({
      id: 'case_1',
      title: 'When the Crashes Do Not Come',
      synopsis: 'Autonomy collapses crash-dependent markets.',
      context: 'A case study about downstream crash economics.',
      next: 'problem_recovery',
    });

    expect(compiled.stage).toBe('case_study');
    expect(compiled.summary).toBe('Autonomy collapses crash-dependent markets.');
    expect(compiled.markdown).toContain('stage: "case_study"');
    expect(compiled.markdown).toContain('## Context');
    expect(compiled.markdown).toContain('## Synopsis');
  });

  test('compiles an inner winner into a problem recovery, not raw candidate-only text', () => {
    const compiled = compilePromotedNode({
      id: 'pr_1',
      stage: 'problem_recovery',
      rootId: 'case_1',
      parentIds: ['case_1'],
      parentTitle: 'When the Crashes Do Not Come',
      parentSummary: 'Autonomy collapses crash-dependent markets.',
      caseTitle: 'When the Crashes Do Not Come',
      caseSummary: 'Autonomy collapses crash-dependent markets.',
      candidate: validCandidateIdeaCrossDomain,
      metrics: {
        fitness: validFitnessScore,
        novelty: validNoveltyScore,
        judge: validJudgeResult,
      },
    });

    expect(compiled.stage).toBe('problem_recovery');
    expect(compiled.judgeScore).toBe(4);
    expect(compiled.markdown).toContain('stage: "problem_recovery"');
    expect(compiled.markdown).toContain('## Trace');
    expect(compiled.markdown).toContain('## Discovery');
    expect(compiled.markdown).toContain('## Growth - Problem recovery');
    expect(compiled.markdown).toContain('### Evaluation');
    expect(compiled.markdown).not.toContain('sourceSequenceThrough');
    expect(compiled.markdown).toContain('next: "doppl"');
  });
});
