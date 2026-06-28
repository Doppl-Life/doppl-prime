import type {
  CandidateIdea,
  EvidenceRef,
  FitnessScore,
  JudgeResult,
  NoveltyScore,
} from '@doppl/contracts';

export type MarkScriptStage = 'case_study' | 'problem_recovery' | 'doppl';

export interface CompiledMarkScriptNode {
  id: string;
  stage: MarkScriptStage;
  title: string;
  summary: string;
  markdown: string;
  judgeScore: number | null;
  novelty: number | null;
  judgeAcceptance: number | null;
}

export interface CompileCaseStudyNodeInput {
  id: string;
  title: string;
  synopsis: string;
  context: string;
  next?: 'problem_recovery' | null;
}

export interface SourceMetricBundle {
  fitness?: FitnessScore;
  novelty?: NoveltyScore;
  judge?: JudgeResult;
}

export interface CompilePromotedNodeInput {
  id: string;
  stage: 'problem_recovery' | 'doppl';
  rootId: string;
  parentIds: readonly string[];
  parentTitle: string;
  parentSummary: string;
  caseTitle: string;
  caseSummary: string;
  candidate: CandidateIdea;
  metrics: SourceMetricBundle;
}

export function compileCaseStudyNode(input: CompileCaseStudyNodeInput): CompiledMarkScriptNode {
  const synopsis = input.synopsis.trim() || firstParagraph(input.context) || input.title;
  const context = input.context.trim() || synopsis;
  const markdown = [
    frontmatter({
      id: input.id,
      stage: 'case_study',
      name: input.title,
      next: input.next ?? 'problem_recovery',
    }),
    `# ${input.title}`,
    '',
    '## Context',
    '',
    context,
    '',
    '## Synopsis',
    '',
    synopsis,
    '',
  ].join('\n');

  return {
    id: input.id,
    stage: 'case_study',
    title: input.title,
    summary: synopsis,
    markdown,
    judgeScore: null,
    novelty: null,
    judgeAcceptance: null,
  };
}

export function compilePromotedNode(input: CompilePromotedNodeInput): CompiledMarkScriptNode {
  const { candidate, metrics } = input;
  const stageLabel = input.stage === 'problem_recovery' ? 'Problem recovery' : 'Doppl';
  const pathNext = input.stage === 'problem_recovery' ? 'doppl' : null;
  const growthLines =
    input.stage === 'problem_recovery'
      ? problemRecoveryGrowth(candidate)
      : dopplGrowth(candidate, input.parentSummary);
  const judgeScore = scoreToAgardenJudge(metrics.judge, metrics.fitness);
  const markdown = [
    frontmatter({
      id: input.id,
      stage: input.stage,
      root: input.rootId,
      prev: input.parentIds,
      kernel: 'prime',
      temporal: true,
      next: pathNext,
      scores: { judge: judgeScore, human: null, n: 0 },
      doppelgangers: 0,
    }),
    `# ${candidate.title}`,
    '',
    '## Trace',
    '',
    '### Case study - synopsis',
    '',
    input.caseSummary,
    '',
    `### ${stageLabel} source`,
    '',
    input.parentSummary,
    '',
    '## Discovery',
    '',
    ...discoveryLines(candidate),
    '',
    `## Growth - ${stageLabel}`,
    '',
    ...growthLines,
    '',
    ...evaluationLines(metrics),
    '',
    '## Path',
    '',
    `next: ${pathNext ?? 'null'}`,
    '',
  ].join('\n');

  return {
    id: input.id,
    stage: input.stage,
    title: candidate.title,
    summary: candidate.summary,
    markdown,
    judgeScore,
    novelty: metrics.novelty?.score ?? null,
    judgeAcceptance: metrics.judge?.acceptance ?? null,
  };
}

function problemRecoveryGrowth(candidate: CandidateIdea): string[] {
  const subtypeDetails =
    candidate.subtype === 'cross_domain_transfer'
      ? {
          skin: [candidate.subtypePayload.targetDomain, candidate.subtypePayload.sourceDomain],
          sprouts: [
            candidate.subtypePayload.expectedMechanism,
            candidate.subtypePayload.executableCheckIdea,
          ].filter(nonEmpty),
          deletedAssumption: `The prior frame assumes ${candidate.subtypePayload.targetProblem} must be handled inside its original domain.`,
          hiddenVariable: candidate.subtypePayload.sourceTechnique,
          response: candidate.subtypePayload.transferMapping,
        }
      : {
          skin: [candidate.subtypePayload.audience],
          sprouts: [
            ...candidate.subtypePayload.currentSignals,
            ...candidate.subtypePayload.falsifiablePredictions,
          ].filter(nonEmpty),
          deletedAssumption: `The prior frame assumes this is not yet urgent for ${candidate.subtypePayload.audience}.`,
          hiddenVariable: candidate.subtypePayload.whyNow,
          response: candidate.subtypePayload.thesis,
        };

  return [
    '### Surface complaint',
    '',
    firstClaim(candidate) ?? candidate.summary,
    '',
    '### Deleted assumption',
    '',
    subtypeDetails.deletedAssumption,
    '',
    '### Hidden variable',
    '',
    subtypeDetails.hiddenVariable,
    '',
    '### Actual problem',
    '',
    candidate.summary,
    '',
    '### Candidate response',
    '',
    subtypeDetails.response,
    '',
    '### Skin in the Game',
    '',
    ...bulletLines(
      subtypeDetails.skin.filter(nonEmpty).length > 0
        ? subtypeDetails.skin.filter(nonEmpty)
        : ['Affected operators and downstream users'],
    ),
    '',
    '### Sprouts',
    '',
    ...bulletLines(subtypeDetails.sprouts.length > 0 ? subtypeDetails.sprouts : candidate.claims),
  ];
}

function dopplGrowth(candidate: CandidateIdea, parentSummary: string): string[] {
  const implications =
    candidate.claims.length > 0 ? candidate.claims : [candidate.summary, parentSummary].filter(nonEmpty);
  const subtypeDetails =
    candidate.subtype === 'cross_domain_transfer'
      ? {
          opportunities: [
            candidate.subtypePayload.transferMapping,
            candidate.subtypePayload.expectedMechanism,
            candidate.subtypePayload.executableCheckIdea,
          ].filter(nonEmpty),
          sprouts: [
            candidate.subtypePayload.sourceTechnique,
            candidate.subtypePayload.targetProblem,
          ].filter(nonEmpty),
        }
      : {
          opportunities: [
            candidate.subtypePayload.thesis,
            candidate.subtypePayload.whyNow,
            ...candidate.subtypePayload.currentSignals,
          ].filter(nonEmpty),
          sprouts: candidate.subtypePayload.falsifiablePredictions,
        };

  return [
    '### Claim',
    '',
    firstClaim(candidate) ?? candidate.summary,
    '',
    '### Implications',
    '',
    ...bulletLines(implications),
    '',
    '### Opportunities',
    '',
    ...bulletLines(subtypeDetails.opportunities),
    '',
    '### Sprouts',
    '',
    ...bulletLines(subtypeDetails.sprouts.length > 0 ? subtypeDetails.sprouts : candidate.claims),
  ];
}

function discoveryLines(candidate: CandidateIdea): string[] {
  const lines: string[] = [];
  const claims = candidate.claims.length > 0 ? candidate.claims : [candidate.summary];
  claims.slice(0, 6).forEach((claim, index) => {
    lines.push(`### Finding ${index + 1}`, '', claim, '');
  });
  const refs = candidate.evidenceRefs.map(evidenceLabel).filter(nonEmpty);
  if (refs.length > 0) {
    lines.push('### Evidence pointers', '', ...bulletLines(refs));
  }
  return lines;
}

function evaluationLines(metrics: SourceMetricBundle): string[] {
  const lines = ['### Evaluation', ''];
  if (metrics.novelty !== undefined) {
    lines.push(`#### Novelty ${signedScore(metrics.novelty.score)}`, '', metrics.novelty.explanation, '');
  }
  if (metrics.judge !== undefined) {
    for (const [axis, value] of Object.entries(metrics.judge.axisScores)) {
      const rationale = metrics.judge.axisRationales?.[axis as keyof typeof metrics.judge.axisScores];
      lines.push(`#### ${titleCase(axis)} ${signedScore(value)}`, '', rationale ?? 'Held-out judge score.', '');
    }
    lines.push(
      '#### Judge acceptance',
      '',
      `Acceptance ${metrics.judge.acceptance.toFixed(2)} under rubric ${metrics.judge.rubricPolicyVersion}.`,
      '',
    );
  }
  if (metrics.fitness !== undefined) {
    lines.push(`#### Fitness ${metrics.fitness.total.toFixed(2)}`, '', metrics.fitness.explanation, '');
  }
  if (lines.length === 2) {
    lines.push('No judge, novelty, or fitness scores were available for this promoted artifact.', '');
  }
  return lines;
}

function scoreToAgardenJudge(judge: JudgeResult | undefined, fitness: FitnessScore | undefined): number | null {
  if (judge !== undefined) return clampRounded(judge.acceptance * 5, -5, 5);
  if (fitness !== undefined) return clampRounded(fitness.total * 5, -5, 5);
  return null;
}

function firstClaim(candidate: CandidateIdea): string | null {
  return candidate.claims.find((claim) => claim.trim().length > 0) ?? null;
}

function bulletLines(items: readonly string[]): string[] {
  const cleaned = items.map((item) => item.trim()).filter((item) => item.length > 0);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`) : ['- No items recorded.'];
}

function evidenceLabel(ref: EvidenceRef): string {
  if (ref.label !== undefined) return `${ref.kind}: ${ref.label}`;
  if (ref.uri !== undefined) return `${ref.kind}: ${ref.uri}`;
  if (ref.eventId !== undefined) return `${ref.kind}: event ${ref.eventId}`;
  return ref.kind;
}

function firstParagraph(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0)
    ?.slice(0, 500) ?? '';
}

function frontmatter(value: Record<string, unknown>): string {
  return ['---', ...Object.entries(value).map(([key, val]) => `${key}: ${yamlValue(val)}`), '---', ''].join(
    '\n',
  );
}

function yamlValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(yamlValue).join(', ')}]`;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

function signedScore(value: number): string {
  const rounded = clampRounded(value, -5, 5);
  return rounded >= 0 ? `+${rounded}` : String(rounded);
}

function clampRounded(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
