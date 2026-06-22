import { readFile } from 'node:fs/promises';
import type { CandidateSolution, CriticVerdict, ProblemRecovery } from './contracts.ts';

export type KernelFixture = {
  caseId: string;
  problemRecovery: Omit<ProblemRecovery, 'id' | 'caseId'>;
  candidates: Array<Omit<CandidateSolution, 'caseId' | 'generation'>>;
  critics: CriticVerdict[];
};

export async function loadKernelFixture(filePath: string): Promise<KernelFixture> {
  const fixture = JSON.parse(await readFile(filePath, 'utf8')) as KernelFixture;
  if (!fixture.caseId) throw new Error('fixture.caseId is required');
  if (!fixture.problemRecovery) throw new Error('fixture.problemRecovery is required');
  if (!Array.isArray(fixture.candidates) || fixture.candidates.length < 2) {
    throw new Error('fixture.candidates must contain at least two candidates');
  }
  if (!Array.isArray(fixture.critics) || fixture.critics.length === 0) {
    throw new Error('fixture.critics must contain critic verdicts');
  }
  return fixture;
}
