// The two generation verbs, via the configured reasoning provider, plus adapters that map generated
// content into the engine's Candidate shape so fitness + dial selection (the agenome process) run on
// real ideas exactly as they do on fixtures. No dependency on evolving skills — direct idea generation.
import type { Candidate, CandidatePool, Seed } from '../contracts/index.ts';
import { askJSON } from './cognition.ts';
import { loadConfig } from './config.ts';
import { slugId, type Doppl, type ProblemFrame } from './compile-node.ts';

function context(discovery: string[]): string {
  return discovery.length ? discovery.map((d) => `- ${d}`).join('\n') : '(none)';
}

// generate: case_study -> problem_recovery
export function generateProblemRecovery(focus: string, discovery: string[], n: number): { frames: ProblemFrame[]; note: string } {
  const prompt = `Recover the ACTUAL problem behind this case study — the real constraint under the surface complaint.
Case study:
"""
${focus}
"""
Admitted discovery context:
${context(discovery)}
Generate ${n} DISTINCT problem-recovery candidates. Each object:
{ "title": one line, "surfaceComplaint": the obvious reading, "deletedAssumption": the false assumption to delete, "hiddenVariable": the hidden driver, "actualProblem": the recovered real problem, "candidateResponse": what to do, "skinInTheGame": [2-3 cheap real-world validation nudges], "temporal": boolean }
Return a JSON array of ${n}.`;
  const { value, note } = askJSON<ProblemFrame[]>(loadConfig().cognition.reasoning, prompt);
  return { frames: Array.isArray(value) ? value : [], note };
}

// generate doppls: problem_recovery -> doppl
export function generateDoppls(focus: string, discovery: string[], n: number): { doppls: Doppl[]; note: string } {
  const prompt = `Given a recovered problem, generate the doppls — the unlocks / solutions / opportunities it opens.
Recovered problem:
"""
${focus}
"""
Admitted discovery context:
${context(discovery)}
Generate ${n} DISTINCT doppls. Each object:
{ "title": one line, "claim": the core unlock, "implications": [who or what wins or loses], "opportunities": [where to deploy / build / position], "temporal": boolean }
Return a JSON array of ${n}.`;
  const { value, note } = askJSON<Doppl[]>(loadConfig().cognition.reasoning, prompt);
  return { doppls: Array.isArray(value) ? value : [], note };
}

export function frameToCandidate(frame: ProblemFrame, seedId: string): Candidate {
  return {
    id: slugId(frame.title), parentId: seedId, parent: { kind: 'seed', id: seedId },
    generation: 1, operatorId: 'reasoning', operatorLabel: 'reasoning', sourcePacketIds: ['reasoning'],
    temporal: !!frame.temporal, title: frame.title, thesis: frame.actualProblem || frame.title,
    substrate: frame.hiddenVariable || '', mechanism: frame.candidateResponse || '',
    delta: { summary: `recovered: ${(frame.actualProblem || frame.title).slice(0, 100)}`, changes: ['operator:reasoning', `deleted:${(frame.deletedAssumption || '').slice(0, 60)}`] },
    claims: [frame.surfaceComplaint, frame.deletedAssumption].filter(Boolean), evidence: frame.skinInTheGame || [],
  };
}

export function dopplToCandidate(doppl: Doppl, parentId: string): Candidate {
  return {
    id: slugId(doppl.title), parentId, parent: { kind: 'candidate', id: parentId },
    generation: 1, operatorId: 'reasoning', operatorLabel: 'reasoning', sourcePacketIds: ['reasoning'],
    temporal: !!doppl.temporal, title: doppl.title, thesis: doppl.claim || doppl.title,
    substrate: (doppl.implications || []).join('; '), mechanism: (doppl.opportunities || []).join('; '),
    delta: { summary: `doppl: ${(doppl.claim || doppl.title).slice(0, 100)}`, changes: ['operator:reasoning'] },
    claims: doppl.implications || [], evidence: doppl.opportunities || [],
  };
}

export function poolOf(seed: Seed, candidates: Candidate[]): CandidatePool {
  return { seed, candidates, rejected: [] };
}
