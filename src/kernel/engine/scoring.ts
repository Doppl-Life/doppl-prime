import type { CriticVerdict, FitnessRecord, PairCompatibility } from '../boundary.ts';

export type FitnessSchedule = {
  generation: number;
  noveltyWeight: number;
  groundingWeight: number;
  dial: 'diverge' | 'balanced' | 'converge';
};

export type FitnessScheduleMode = 'auto' | 'diverge' | 'balanced' | 'converge';

export type FitnessLens = {
  name: string;
  multiplier: number;
  notes: string[];
};

export type FitnessLensId = 'none' | 'feasibility' | 'novelty';

export type ScoreCandidateOptions = {
  generation?: number;
  schedule?: FitnessSchedule | FitnessScheduleMode;
  lens?: FitnessLens | FitnessLensId;
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
  let dial: 'diverge' | 'balanced' | 'converge' = 'balanced';
  if (noveltyWeight > groundingWeight) dial = 'diverge';
  else if (noveltyWeight < groundingWeight) dial = 'converge';
  return {
    generation: normalizedGeneration,
    noveltyWeight: round(noveltyWeight, 3),
    groundingWeight,
    dial,
  };
}

export function scheduleForMode(
  mode: FitnessScheduleMode | FitnessSchedule | undefined,
  generation: number,
): FitnessSchedule {
  if (!mode || mode === 'auto') return scheduleForGeneration(generation);
  if (typeof mode === 'object') return mode;
  const normalizedGeneration = Math.max(0, generation);
  if (mode === 'diverge') {
    return {
      generation: normalizedGeneration,
      noveltyWeight: 0.72,
      groundingWeight: 0.28,
      dial: 'diverge',
    };
  }
  if (mode === 'converge') {
    return {
      generation: normalizedGeneration,
      noveltyWeight: 0.28,
      groundingWeight: 0.72,
      dial: 'converge',
    };
  }
  return {
    generation: normalizedGeneration,
    noveltyWeight: 0.5,
    groundingWeight: 0.5,
    dial: 'balanced',
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

function boundedLens(lens: FitnessLens): FitnessLens {
  return {
    name: lens.name,
    multiplier: round(clamp(lens.multiplier, 0, 1), 3),
    notes: lens.notes,
  };
}

function lensForAxes(
  lens: FitnessLens | FitnessLensId | undefined,
  axes: { novelty: number; grounding: number },
): FitnessLens {
  if (!lens || lens === 'none') {
    return {
      name: 'none',
      multiplier: 1,
      notes: ['No operator lens applied after engine fitness.'],
    };
  }
  if (lens === 'feasibility') {
    return boundedLens({
      name: 'feasibility',
      multiplier: 0.82 + axes.grounding * 0.18,
      notes: ['Post-fitness lens: favors grounded mechanisms without changing novelty/grounding axes.'],
    });
  }
  if (lens === 'novelty') {
    return boundedLens({
      name: 'novelty',
      multiplier: 0.88 + axes.novelty * 0.12,
      notes: ['Post-fitness lens: preserves wilder candidates during exploratory selection.'],
    });
  }
  return boundedLens(lens);
}

function dominates(left: FitnessRecord, right: FitnessRecord): boolean {
  const leftAxes = left.selection?.axes;
  const rightAxes = right.selection?.axes;
  if (!leftAxes || !rightAxes) return false;
  const noveltyAtLeast = leftAxes.novelty >= rightAxes.novelty;
  const groundingAtLeast = leftAxes.grounding >= rightAxes.grounding;
  const betterSomewhere = leftAxes.novelty > rightAxes.novelty || leftAxes.grounding > rightAxes.grounding;
  return noveltyAtLeast && groundingAtLeast && betterSomewhere;
}

function withFrontierRanks(records: FitnessRecord[]): FitnessRecord[] {
  const remaining = [...records];
  const ranked = new Map<string, NonNullable<FitnessRecord['selection']>['frontier']>();
  let rank = 1;

  while (remaining.length) {
    const currentFrontier = remaining.filter(
      (candidate) => !remaining.some((other) => other.candidateId !== candidate.candidateId && dominates(other, candidate)),
    );
    const frontierIds = new Set(currentFrontier.map((candidate) => candidate.candidateId));

    for (const candidate of currentFrontier) {
      const dominatedBy = records
        .filter((other) => other.candidateId !== candidate.candidateId && dominates(other, candidate))
        .map((other) => other.candidateId);
      ranked.set(candidate.candidateId, {
        pareto: rank === 1,
        rank,
        dominatedBy,
      });
    }

    const nextRemaining = remaining.filter((candidate) => !frontierIds.has(candidate.candidateId));
    if (nextRemaining.length === remaining.length) break;
    remaining.splice(0, remaining.length, ...nextRemaining);
    rank += 1;
  }

  return records.map((record) => ({
    ...record,
    selection: record.selection
      ? {
          ...record.selection,
          frontier: ranked.get(record.candidateId) || {
            pareto: false,
            rank,
            dominatedBy: [],
          },
        }
      : record.selection,
  }));
}

export function scoreCandidates(
  verdicts: CriticVerdict[],
  options: ScoreCandidateOptions = {},
): FitnessRecord[] {
  const generation = Math.max(0, options.generation ?? 0);
  const schedule = scheduleForMode(options.schedule, generation);
  const decay = engineDecayForGeneration(generation);
  const byCandidate = new Map<string, CriticVerdict[]>();
  for (const verdict of verdicts) {
    byCandidate.set(verdict.candidateId, [...(byCandidate.get(verdict.candidateId) || []), verdict]);
  }
  const records = [...byCandidate.entries()]
    .map(([candidateId, rows]) => {
      const fallback = average(rows);
      const novelty = averageByCritic(rows, [/novel/i, /distinct/i, /surpris/i]) ?? fallback;
      const grounding =
        averageByCritic(rows, [/ground/i, /evidence/i, /mechanism/i, /falsifi/i]) ?? fallback;
      const noveltyAxis = round(clamp(novelty / 100, 0, 1));
      const groundingAxis = round(clamp(grounding / 100, 0, 1));
      const lens = lensForAxes(options.lens, { novelty: noveltyAxis, grounding: groundingAxis });
      const weightedAxis =
        noveltyAxis * schedule.noveltyWeight + groundingAxis * schedule.groundingWeight;
      const total = round(clamp(weightedAxis * decay * lens.multiplier * 100, 0, 100), 1);
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
            scale: '-5_to_5' as const,
            judge: projectedProposalRating(total),
            source: 'projected_from_internal_selection_fitness',
          },
          frontier: {
            pareto: false,
            rank: 1,
            dominatedBy: [],
          },
        },
        // Prefer the critics' prose; fall back to the numeric verdicts when a fast model returned
        // score-only verdicts (rationale is a required, non-empty field).
        rationale:
          rows.map((row) => row.pressure).filter((pressure) => pressure.trim().length > 0).join(' | ') ||
          rows.map((row) => `${row.criticId}:${row.score}`).join(' | ') ||
          'score-only critic verdicts',
      };
    })
    .sort((a, b) => b.total - a.total);
  return withFrontierRanks(records);
}

export function selectParents(records: FitnessRecord[]): [string, string] | [] {
  if (records.length < 2) return [];
  const frontierRecords = records
    .filter((record) => record.selection?.frontier.pareto)
    .sort((a, b) => b.total - a.total);
  const ordered = [
    ...frontierRecords,
    ...records.filter(
      (record) => !frontierRecords.some((frontier) => frontier.candidateId === record.candidateId),
    ),
  ];
  const [first, second] = ordered;
  if (!first || !second) return [];
  return [first.candidateId, second.candidateId];
}

export function checkPairCompatibility(parentA: string, parentB: string): PairCompatibility {
  return {
    parentA,
    parentB,
    score: parentA === parentB ? 0 : 76,
    rationale: 'Parents preserve distinct mechanisms while sharing enough case grounding to fuse.',
  };
}
