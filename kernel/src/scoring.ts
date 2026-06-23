import type { CriticVerdict, FitnessRecord, PairCompatibility } from './contracts.ts';

export type FitnessSchedule = {
  generation: number;
  noveltyWeight: number;
  groundingWeight: number;
  dial: 'diverge' | 'balanced' | 'converge';
};

export type FitnessLens = {
  name: string;
  multiplier: number;
  notes: string[];
};

export type ScoreCandidateOptions = {
  generation?: number;
  schedule?: FitnessSchedule;
  lens?: FitnessLens;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals = 3): number {
  return Number(value.toFixed(decimals));
}

export function scheduleForGeneration(generation: number): FitnessSchedule {
  const normalizedGeneration = Math.max(0, generation);
  const noveltyWeight = clamp(0.65 - normalizedGeneration * 0.07, 0.35, 0.65);
  const groundingWeight = round(1 - noveltyWeight, 3);
  const dial =
    noveltyWeight > groundingWeight ? 'diverge' : noveltyWeight < groundingWeight ? 'converge' : 'balanced';
  return {
    generation: normalizedGeneration,
    noveltyWeight: round(noveltyWeight, 3),
    groundingWeight,
    dial,
  };
}

function engineDecayForGeneration(generation: number): number {
  return round(clamp(1 - Math.max(0, generation) * 0.03, 0.85, 1), 3);
}

function projectedProposalRating(total: number): number {
  return round(clamp(total / 10 - 5, -5, 5), 1);
}

function average(rows: CriticVerdict[]): number {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
}

function averageByCritic(rows: CriticVerdict[], patterns: RegExp[]): number | undefined {
  const matches = rows.filter((row) => patterns.some((pattern) => pattern.test(row.criticId)));
  if (!matches.length) return undefined;
  return average(matches);
}

function defaultLens(): FitnessLens {
  return {
    name: 'none',
    multiplier: 1,
    notes: ['No feasibility lens applied after fitness scoring.'],
  };
}

function boundedLens(lens: FitnessLens): FitnessLens {
  return {
    name: lens.name,
    multiplier: round(clamp(lens.multiplier, 0, 1), 3),
    notes: lens.notes,
  };
}

export function scoreCandidates(
  verdicts: CriticVerdict[],
  options: ScoreCandidateOptions = {},
): FitnessRecord[] {
  const generation = Math.max(0, options.generation ?? 0);
  const schedule = options.schedule || scheduleForGeneration(generation);
  const decay = engineDecayForGeneration(generation);
  const lens = boundedLens(options.lens || defaultLens());
  const byCandidate = new Map<string, CriticVerdict[]>();
  for (const verdict of verdicts) {
    byCandidate.set(verdict.candidateId, [...(byCandidate.get(verdict.candidateId) || []), verdict]);
  }
  return [...byCandidate.entries()]
    .map(([candidateId, rows]) => {
      const fallback = average(rows);
      const novelty = averageByCritic(rows, [/novel/i, /distinct/i, /surpris/i]) ?? fallback;
      const grounding =
        averageByCritic(rows, [/ground/i, /evidence/i, /mechanism/i, /falsifi/i]) ?? fallback;
      const noveltyAxis = round(clamp(novelty / 100, 0, 1));
      const groundingAxis = round(clamp(grounding / 100, 0, 1));
      const weightedAxis =
        noveltyAxis * schedule.noveltyWeight + groundingAxis * schedule.groundingWeight;
      const total = round(clamp(weightedAxis * decay * 100, 0, 100), 1);
      return {
        candidateId,
        total,
        components: {
          novelty: round(noveltyAxis * 100, 1),
          grounding: round(groundingAxis * 100, 1),
          mechanismClarity: total,
          mechanismCost: round(100 - total * 0.35, 1),
          criticPressure: round(fallback, 1),
          evidenceQuality: round(groundingAxis * 100, 1),
        },
        selection: {
          axes: {
            novelty: noveltyAxis,
            grounding: groundingAxis,
          },
          weights: {
            novelty: schedule.noveltyWeight,
            grounding: schedule.groundingWeight,
          },
          dial: schedule.dial,
          generation,
          decay,
          lens,
          proposalRating: {
            scale: '-5_to_5',
            judge: projectedProposalRating(total),
            source: 'projected_from_internal_selection_fitness',
          },
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
