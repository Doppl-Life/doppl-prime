// Computes deterministic novelty, grounding, and decay scores for candidates.
import type {
  Candidate,
  CandidatePool,
  FitnessScore,
  ScoreComponentDetail,
  ScoreInputRef,
  ScoredCandidate,
  ScoredCandidatePool,
  ScoringPolicy,
  TraceEvent,
} from './contracts/index.ts';
import { clampScore, getBoundary } from './contracts/index.ts';

const defaultAsOf = '2026-06-21';

export const deterministicScoringPolicy: ScoringPolicy = {
  id: 'deterministic-text-source-signals',
  version: 'v1',
  componentWeights: {
    novelty: {
      sourceAbsence: 0.5,
      substrateDistance: 0.3,
      hiddenDependents: 0.2,
    },
    grounding: {
      signalStrength: 0.4,
      mechanismClarity: 0.25,
      falsifiability: 0.25,
      riskPenalty: 0.1,
    },
  },
};

type ScoreContext = {
  seedText: string;
  seedTokens: Set<string>;
  asOf: string;
};

const stopwords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'if',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'with',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function ratioNew(text: string, baseline: Set<string>): number {
  const items = tokens(text);
  if (!items.length) return 0;
  const novel = items.filter((token) => !baseline.has(token));
  return clampScore(novel.length / items.length);
}

function matchCount(text: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
}

function daysBetween(start: string | undefined, end: string): number {
  if (!start) return 0;
  const startDate = Date.parse(start);
  const endDate = Date.parse(end);
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) return 0;
  return Math.max(0, Math.round((endDate - startDate) / 86_400_000));
}

function refs(candidate: Candidate, field: ScoreInputRef['field'], extra: ScoreInputRef[] = []): ScoreInputRef[] {
  return [
    { kind: 'candidate', id: candidate.id, field },
    ...candidate.sourcePacketIds.map((id) => ({ kind: 'source_packet' as const, id, field })),
    ...extra,
  ];
}

function detail(raw: number, weight: number, inputRefs: ScoreInputRef[]): ScoreComponentDetail {
  return {
    raw: clampScore(raw),
    weight,
    contribution: clampScore(raw * weight),
    inputRefs,
  };
}

function sourceAbsence(candidate: Candidate, context: ScoreContext): ScoreComponentDetail {
  const raw = ratioNew(`${candidate.title} ${candidate.thesis} ${candidate.delta.summary}`, context.seedTokens);
  return detail(raw, deterministicScoringPolicy.componentWeights.novelty.sourceAbsence, refs(candidate, 'thesis', [{ kind: candidate.parent.kind, id: candidate.parent.id }]));
}

function substrateDistance(candidate: Candidate, context: ScoreContext): ScoreComponentDetail {
  const raw = ratioNew(`${candidate.substrate} ${candidate.operatorLabel}`, context.seedTokens);
  return detail(raw, deterministicScoringPolicy.componentWeights.novelty.substrateDistance, refs(candidate, 'substrate', [{ kind: candidate.parent.kind, id: candidate.parent.id }]));
}

function hiddenDependents(candidate: Candidate): ScoreComponentDetail {
  const dependentLanguage = matchCount(
    `${candidate.title} ${candidate.thesis} ${candidate.claims.join(' ')}`,
    [/depend/i, /downstream/i, /revenue/i, /supply/i, /institution/i, /market/i, /workflow/i, /customer/i],
  );
  const raw = clampScore((candidate.claims.length * 0.12) + (candidate.delta.changes.length * 0.1) + (dependentLanguage * 0.08));
  return detail(raw, deterministicScoringPolicy.componentWeights.novelty.hiddenDependents, refs(candidate, 'claims'));
}

function signalStrength(candidate: Candidate): ScoreComponentDetail {
  const evidenceTokens = candidate.evidence.join(' ');
  const namedSignal = matchCount(evidenceTokens, [/fixture/i, /market/i, /policy/i, /deployment/i, /precedent/i, /existing/i, /current/i]);
  const raw = clampScore((candidate.evidence.length * 0.16) + (tokens(evidenceTokens).length * 0.015) + (namedSignal * 0.06));
  return detail(raw, deterministicScoringPolicy.componentWeights.grounding.signalStrength, refs(candidate, 'evidence', candidate.evidence.map((_, index) => ({ kind: 'evidence', id: `${candidate.id}:e${index + 1}` }))));
}

function mechanismClarity(candidate: Candidate): ScoreComponentDetail {
  const text = `${candidate.mechanism} ${candidate.delta.summary}`;
  const causalMarkers = matchCount(text, [/if/i, /because/i, /when/i, /removes?/i, /changes?/i, /turns?/i, /replaces?/i]);
  const raw = clampScore((tokens(candidate.mechanism).length * 0.025) + (causalMarkers * 0.1));
  return detail(raw, deterministicScoringPolicy.componentWeights.grounding.mechanismClarity, refs(candidate, 'mechanism'));
}

function falsifiability(candidate: Candidate): ScoreComponentDetail {
  const text = `${candidate.thesis} ${candidate.claims.join(' ')}`;
  const checkableMarkers = matchCount(text, [/will/i, /when/i, /if/i, /falsif/i, /predict/i, /measure/i, /reprice/i, /shrink/i, /\d/]);
  const raw = clampScore((checkableMarkers * 0.08) + (candidate.claims.length * 0.08) + (candidate.evidence.length * 0.04));
  return detail(raw, deterministicScoringPolicy.componentWeights.grounding.falsifiability, refs(candidate, 'claims'));
}

function riskPenalty(candidate: Candidate): ScoreComponentDetail {
  const text = `${candidate.title} ${candidate.thesis} ${candidate.mechanism}`;
  const uncertainty = matchCount(text, [/might/i, /could/i, /speculative/i, /maybe/i, /unproven/i, /unclear/i]);
  const unsupported = candidate.evidence.length === 0 ? 0.3 : 0;
  const raw = clampScore((uncertainty * 0.12) + unsupported);
  return detail(raw, deterministicScoringPolicy.componentWeights.grounding.riskPenalty, refs(candidate, 'thesis'));
}

function scoreFromDetails(details: FitnessScore['componentDetails']): Pick<FitnessScore, 'novelty' | 'grounding' | 'components'> {
  const novelty = clampScore(
    details.sourceAbsence.contribution +
      details.substrateDistance.contribution +
      details.hiddenDependents.contribution,
  );
  const grounding = clampScore(
    details.signalStrength.contribution +
      details.mechanismClarity.contribution +
      details.falsifiability.contribution -
      details.riskPenalty.contribution,
  );
  return {
    novelty,
    grounding,
    components: {
      sourceAbsence: details.sourceAbsence.raw,
      substrateDistance: details.substrateDistance.raw,
      hiddenDependents: details.hiddenDependents.raw,
      signalStrength: details.signalStrength.raw,
      mechanismClarity: details.mechanismClarity.raw,
      falsifiability: details.falsifiability.raw,
      riskPenalty: details.riskPenalty.raw,
    },
  };
}

function decayFor(candidate: Candidate, asOf: string): FitnessScore['decay'] {
  const halfLifeDays = candidate.subtype === 'zeitgeist_synthesis' ? 180 : 730;
  const ageDays = daysBetween(candidate.observedAt, asOf);
  const factor = clampScore(Math.pow(0.5, ageDays / halfLifeDays));
  return {
    factor,
    halfLifeDays,
    ageDays,
    subtypeBasis: candidate.subtype,
    reason: `${candidate.subtype} half-life ${halfLifeDays}d; observed age ${ageDays}d`,
  };
}

function scoreCandidate(candidate: Candidate, context: ScoreContext): ScoredCandidate {
  const componentDetails = {
    sourceAbsence: sourceAbsence(candidate, context),
    substrateDistance: substrateDistance(candidate, context),
    hiddenDependents: hiddenDependents(candidate),
    signalStrength: signalStrength(candidate),
    mechanismClarity: mechanismClarity(candidate),
    falsifiability: falsifiability(candidate),
    riskPenalty: riskPenalty(candidate),
  };
  const scored = scoreFromDetails(componentDetails);
  const inputRefs = Object.values(componentDetails).flatMap((item) => item.inputRefs);

  return {
    ...candidate,
    fitness: {
      policyId: deterministicScoringPolicy.id,
      novelty: scored.novelty,
      grounding: scored.grounding,
      decay: decayFor(candidate, context.asOf),
      components: scored.components,
      componentDetails,
      reasons: {
        novelty: `sourceAbsence=${scored.components.sourceAbsence}, substrateDistance=${scored.components.substrateDistance}, hiddenDependents=${scored.components.hiddenDependents}`,
        grounding: `signalStrength=${scored.components.signalStrength}, mechanismClarity=${scored.components.mechanismClarity}, falsifiability=${scored.components.falsifiability}, riskPenalty=${scored.components.riskPenalty}`,
        decay: decayFor(candidate, context.asOf).reason,
      },
      computation: {
        policyId: deterministicScoringPolicy.id,
        inputRefs,
        warnings: candidate.metricHints ? ['legacy metric hints present but not used for scoring totals'] : [],
      },
    },
  };
}

export function scoreCandidatePool(pool: CandidatePool, options: { asOf?: string } = {}): {
  scoredPool: ScoredCandidatePool;
  event: TraceEvent;
} {
  const seedText = `${pool.seed.title} ${pool.seed.prompt} ${pool.seed.thesis} ${pool.seed.goals.join(' ')}`;
  const context: ScoreContext = {
    seedText,
    seedTokens: new Set(tokens(seedText)),
    asOf: options.asOf || defaultAsOf,
  };
  const candidates = pool.candidates.map((candidate) => scoreCandidate(candidate, context));
  const scoredPool = { seed: pool.seed, candidates };

  return {
    scoredPool,
    event: {
      stage: 'fitness',
      input: `CandidatePool(${pool.candidates.length})`,
      decision: 'Computed novelty, grounding, and decay from candidate/source material without collapsing novelty and grounding.',
      reason: 'The two-axis claim must stay visible until selection decides how to use it; decay is intrinsic engine time, not feasibility.',
      output: `ScoredCandidatePool(${candidates.length})`,
      goalChecks: [
        {
          id: 'two-axis-visible',
          label: 'Every candidate carries novelty and grounding separately.',
          passed: candidates.every((candidate) => Number.isFinite(candidate.fitness.novelty) && Number.isFinite(candidate.fitness.grounding)),
          detail: 'No candidate has only a scalar total.',
        },
        {
          id: 'fitness-computed-from-source',
          label: 'Fitness totals are computed from candidate/source material, not fixture-authored metric totals.',
          passed: candidates.every((candidate) => candidate.fitness.computation.inputRefs.some((ref) => ref.kind === 'candidate' || ref.kind === 'source_packet')),
          detail: 'Scoring provenance includes candidate and source-packet references.',
        },
        {
          id: 'decay-visible-not-merged',
          label: 'Decay is visible beside novelty and grounding without replacing either axis.',
          passed: candidates.every((candidate) => Number.isFinite(candidate.fitness.decay.factor) && Number.isFinite(candidate.fitness.novelty) && Number.isFinite(candidate.fitness.grounding)),
          detail: 'Decay factor is an engine time-axis field on FitnessScore.',
        },
      ],
      boundary: getBoundary('fitness'),
    },
  };
}
