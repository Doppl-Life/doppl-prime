import { readFile } from 'node:fs/promises';
import { assertCandidateSolution, assertCriticVerdict, type CandidateSolution, type CriticVerdict } from './boundary.ts';

// The seed the problem_recovery arrow breeds from: a recovered problem, its hidden
// constraint, and the falsifier that would break the frame. The arrow breeds problem-frame
// variants of this seed, scores them, and selects — it is not a one-shot answer.
export type ProblemFrameSeed = {
  title: string;
  recoveredProblem: string;
  hiddenConstraint: string;
  falsifier: string;
};

export type KernelFixture = {
  caseId: string;
  problemRecovery: ProblemFrameSeed;
  candidates: Array<Omit<CandidateSolution, 'caseId' | 'generation'>>;
  critics: CriticVerdict[];
};

function assertProblemFrameSeed(seed: unknown, caseId: string): ProblemFrameSeed {
  if (!seed || typeof seed !== 'object') throw new Error(`fixture.problemRecovery is required for ${caseId}`);
  const record = seed as Record<string, unknown>;
  for (const field of ['title', 'recoveredProblem', 'hiddenConstraint', 'falsifier']) {
    const value = record[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`fixture.problemRecovery.${field} is required`);
    }
  }
  return {
    title: String(record.title),
    recoveredProblem: String(record.recoveredProblem),
    hiddenConstraint: String(record.hiddenConstraint),
    falsifier: String(record.falsifier),
  };
}

export async function loadKernelFixture(filePath: string): Promise<KernelFixture> {
  const fixture = JSON.parse(await readFile(filePath, 'utf8')) as Partial<KernelFixture>;
  if (!fixture.caseId) throw new Error('fixture.caseId is required');
  const problemRecovery = assertProblemFrameSeed(fixture.problemRecovery, fixture.caseId);
  if (!Array.isArray(fixture.candidates) || fixture.candidates.length < 2) {
    throw new Error('fixture.candidates must contain at least two candidates');
  }
  if (!Array.isArray(fixture.critics) || fixture.critics.length === 0) {
    throw new Error('fixture.critics must contain critic verdicts');
  }
  const candidates = fixture.candidates;
  candidates.forEach((candidate) => {
    assertCandidateSolution({ ...candidate, caseId: fixture.caseId, generation: 0 });
  });
  const critics = fixture.critics;
  critics.forEach(assertCriticVerdict);
  return { caseId: fixture.caseId, problemRecovery, candidates, critics };
}
