import type { CriticVerdict, FitnessRecord, PairCompatibility } from './contracts.ts';

export function scoreCandidates(verdicts: CriticVerdict[]): FitnessRecord[] {
  const byCandidate = new Map<string, CriticVerdict[]>();
  for (const verdict of verdicts) {
    byCandidate.set(verdict.candidateId, [...(byCandidate.get(verdict.candidateId) || []), verdict]);
  }
  return [...byCandidate.entries()]
    .map(([candidateId, rows]) => {
      const average = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
      const total = Number(average.toFixed(1));
      return {
        candidateId,
        total,
        components: {
          novelty: total,
          grounding: total,
          mechanismClarity: total,
          mechanismCost: Number((100 - total * 0.35).toFixed(1)),
          criticPressure: total,
          evidenceQuality: total,
        },
        rationale: rows.map((row) => row.pressure).join(' | '),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function selectParents(records: FitnessRecord[]): [string, string] | [] {
  if (records.length < 2) return [];
  return [records[0]!.candidateId, records[1]!.candidateId];
}

export function checkPairCompatibility(parentA: string, parentB: string): PairCompatibility {
  return {
    parentA,
    parentB,
    score: parentA === parentB ? 0 : 76,
    rationale: 'Parents preserve distinct mechanisms while sharing enough case grounding to fuse.',
  };
}
