import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CandidateSolution,
  FitnessRecord,
  KernelRun,
  VaultExportManifest,
} from './contracts.ts';
import { replayRunProjection, writeRunEvents } from './event-store.ts';
import { writeModelCallRecords } from './model-gateway.ts';
import { compileProposalNodes } from './node-compiler.ts';
import { initialAgenomePool } from './agenomes.ts';
import {
  scoreCandidates,
  selectParents,
  type FitnessLens,
  type FitnessScheduleMode,
} from './scoring.ts';

function frontmatter(fields: Record<string, string>): string {
  return [
    '---',
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
    '---',
    '',
  ].join('\n');
}

function calibrationFields(): Record<string, string> {
  return {
    calibration_status: 'unrated',
    rating_scale: '-5_to_5',
    human_rating: 'null',
  };
}

function solutionMarkdown(
  solution: CandidateSolution,
  fields: Record<string, string> = {},
): string {
  return `${frontmatter({
    artifact_type: 'solution',
    artifact_id: solution.id,
    case_id: solution.caseId,
    agenome_id: solution.agenomeId,
    ...fields,
  })}
# ${solution.title}

${solution.summary}

## Mechanism

${solution.mechanism}

## Claimed Delta

${solution.claimedDelta}

## Knowledge Citations

${solution.citedKnowledge.join(', ') || 'none'}
`;
}

function solutionFilename(solution: CandidateSolution): string {
  return `${solution.id}.md`;
}

function exportedSolutions(run: KernelRun): CandidateSolution[] {
  const solutions = [...run.candidates, ...run.fusionChildren.map((fusion) => fusion.child)];
  return solutions.filter(
    (solution, index) => solutions.findIndex((other) => other.id === solution.id) === index,
  );
}

const COMPARISON_SCHEDULES: Exclude<FitnessScheduleMode, 'auto'>[] = [
  'diverge',
  'balanced',
  'converge',
];

function lensForGeneration(run: KernelRun, candidateIds: string[]): FitnessLens | undefined {
  return run.fitnessRecords.find((record) => candidateIds.includes(record.candidateId))?.selection?.lens;
}

function scheduleComparisons(run: KernelRun): Array<Record<string, unknown>> {
  return run.evolution.map((generation) => {
    const candidateIds = new Set(generation.candidateIds);
    const verdicts = run.criticVerdicts.filter((verdict) => candidateIds.has(verdict.candidateId));
    const lens = lensForGeneration(run, generation.candidateIds);
    const modes = COMPARISON_SCHEDULES.map((schedule) => {
      const records = scoreCandidates(verdicts, {
        generation: generation.generation,
        schedule,
        lens,
      });
      const selectedParentIds = selectParents(records);
      const top = records[0];
      return {
        schedule,
        dial: top?.selection?.dial ?? schedule,
        weights: top?.selection?.weights ?? null,
        selectedParentIds,
        topCandidateId: top?.candidateId ?? null,
        topTotal: top?.total ?? null,
        proposalRating: top?.selection?.proposalRating ?? null,
        frontierCount: records.filter((record) => record.selection?.frontier.pareto).length,
      };
    });
    return {
      generation: generation.generation,
      actualSelectedParentIds: generation.selectedParentIds,
      modes,
    };
  });
}

type AssaySnapshot = {
  type: 'clean_baseline' | 'doppl_survivor';
  candidateId: string;
  path: string;
  title: string;
  summary: string;
  fitnessTotal: number | null;
  proposalRating: number | null;
  scoreSource: 'direct_fitness' | 'parent_average' | 'unscored';
};

function latestFitnessRecord(run: KernelRun, candidateId: string): FitnessRecord | undefined {
  return [...run.fitnessRecords].reverse().find((record) => record.candidateId === candidateId);
}

function candidateById(run: KernelRun, candidateId: string): CandidateSolution | undefined {
  if (run.controlBaseline?.id === candidateId) return run.controlBaseline;
  return exportedSolutions(run).find((candidate) => candidate.id === candidateId);
}

function controlBaselineCandidate(run: KernelRun): CandidateSolution | undefined {
  return run.controlBaseline ?? bestGenerationCandidate(run, 0);
}

function controlBaselineSelection(run: KernelRun): string {
  return run.controlBaseline
    ? 'clean_agent_baseline_provider'
    : 'best_scored_generation_0_candidate';
}

function candidatePath(run: KernelRun, candidate: CandidateSolution): string {
  return run.controlBaseline?.id === candidate.id ? 'control-baseline.md' : solutionFilename(candidate);
}

function proposalRating(record: FitnessRecord | undefined): number | null {
  return typeof record?.selection?.proposalRating?.judge === 'number'
    ? record.selection.proposalRating.judge
    : null;
}

function bestGenerationCandidate(run: KernelRun, generationNumber: number): CandidateSolution | undefined {
  const generation = run.evolution.find((entry) => entry.generation === generationNumber);
  const candidateIds = new Set(
    generation?.candidateIds.length
      ? generation.candidateIds
      : run.candidates
          .filter((candidate) => candidate.generation === generationNumber)
          .map((candidate) => candidate.id),
  );
  const scored = run.fitnessRecords
    .filter((record) => candidateIds.has(record.candidateId))
    .sort((left, right) => right.total - left.total);
  return scored[0] ? candidateById(run, scored[0].candidateId) : undefined;
}

function averageSelectedParentScore(run: KernelRun): number | null {
  const parentIds = run.fusion?.parentCandidateIds ?? [];
  const parentScores = parentIds
    .map((parentId) => latestFitnessRecord(run, parentId)?.total)
    .filter((score): score is number => typeof score === 'number');
  if (parentScores.length === 0) return null;
  return Number((parentScores.reduce((sum, score) => sum + score, 0) / parentScores.length).toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function rubricCandidateScore(
  run: KernelRun,
  candidate: CandidateSolution,
  type: AssaySnapshot['type'],
): Record<string, unknown> {
  const citedKnowledge = new Set(candidate.citedKnowledge || []);
  const citationCoverage = Number(((clamp(citedKnowledge.size, 0, 3) / 3) * 2.5).toFixed(2));
  const mechanismDepth = Number(((clamp(Math.floor(wordCount(candidate.mechanism) / 12), 0, 3) / 3) * 2.5).toFixed(2));
  const specificitySignals = Number(
    ((
      clamp(
        (candidate.summary.match(/\b(when|where|track|measure|compare|rank|threshold|signal|filing|panel)\b/gi) || []).length,
        0,
        3,
      ) / 3
    ) * 2.5).toFixed(2),
  );
  const fusionSynthesisRaw =
    type === 'doppl_survivor' && run.fusion?.child.id === candidate.id
      ? clamp(
          run.fusion.inheritedTraits.length +
            (run.fusion.compatibility.score >= 70 ? 1 : 0) +
            (run.fusion.mutationNotes.length ? 1 : 0),
          0,
          3,
        )
      : 0;
  const fusionSynthesis = Number(((fusionSynthesisRaw / 3) * 2.5).toFixed(2));
  const total = citationCoverage + mechanismDepth + specificitySignals + fusionSynthesis;
  const score = Number((total - 5).toFixed(2));
  const factors = [
    `Citation coverage: ${citationCoverage}/2.5 from ${citedKnowledge.size} cited knowledge handles.`,
    `Mechanism depth: ${mechanismDepth}/2.5 from ${wordCount(candidate.mechanism)} mechanism words.`,
    `Specificity signals: ${specificitySignals}/2.5 from artifact language.`,
    type === 'doppl_survivor'
      ? `Fusion synthesis: ${fusionSynthesis}/2.5 from inherited traits, compatibility, and mutation notes.`
      : 'Fusion synthesis: 0/2.5 because the clean baseline is not a fused survivor.',
  ];

  return {
    candidateId: candidate.id,
    title: candidate.title,
    score,
    rubric: {
      citationCoverage,
      mechanismDepth,
      specificitySignals,
      fusionSynthesis,
      total,
      scale: '-5_to_5',
    },
    factors,
  };
}

function heldOutAssayJudge(
  run: KernelRun,
  baseline: CandidateSolution,
  survivor: CandidateSolution,
): Record<string, unknown> {
  const baselineJudgment = rubricCandidateScore(run, baseline, 'clean_baseline');
  const survivorJudgment = rubricCandidateScore(run, survivor, 'doppl_survivor');
  const referenceBenchmark = sealedReferenceBenchmark(run, baseline, survivor);
  const baselineScore = baselineJudgment.score as number;
  const survivorScore = survivorJudgment.score as number;
  const delta = Number((survivorScore - baselineScore).toFixed(2));
  const verdict =
    delta >= 1
      ? 'doppl_wins'
      : delta <= -1
        ? 'baseline_wins'
        : 'tie';

  return {
    judgeType: 'deterministic_artifact_rubric',
    scoreSource: 'artifact_rubric_not_training_fitness',
    verdict,
    statement:
      verdict === 'doppl_wins'
        ? `Held-out artifact rubric favors the Doppl survivor by ${Math.abs(delta)} points.`
        : verdict === 'baseline_wins'
          ? `Held-out artifact rubric favors the clean baseline by ${Math.abs(delta)} points.`
          : 'Held-out artifact rubric treats the clean baseline and Doppl survivor as effectively tied.',
    baseline: baselineJudgment,
    survivor: survivorJudgment,
    delta: {
      score: delta,
    },
    referenceBenchmark,
    limits: [
      'This is a deterministic held-out artifact rubric, not an in-run fitness score.',
      'Replace this with a model or human held-out judge before claiming external validity.',
    ],
  };
}

function referenceCasePath(run: KernelRun): string {
  return path.join(
    path.dirname(run.caseStudy.sourcePath),
    `${run.caseStudy.id}-with-solution.md`,
  );
}

function referenceCase(run: KernelRun): Record<string, unknown> {
  const referencePath = referenceCasePath(run);
  const exists = existsSync(referencePath);

  return {
    status: exists ? 'withheld_reference_available' : 'no_reference_available',
    path: exists ? referencePath : null,
    visibility: exists ? 'sealed_evaluator_only' : 'none',
    exposedToGeneration: false,
    contentIncluded: false,
    notes: exists
      ? [
          'Evaluator reference exists but is sealed from generation and public dashboard payloads.',
          'Future model/human held-out judging can compare against this artifact server-side.',
        ]
      : ['No evaluator reference artifact was found for this case.'],
  };
}

function publicCandidateText(candidate: CandidateSolution): string {
  return [
    candidate.title,
    candidate.summary,
    candidate.mechanism,
    candidate.claimedDelta,
    candidate.citedKnowledge.join(' '),
  ].join(' ');
}

const REFERENCE_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'because',
  'before',
  'being',
  'between',
  'could',
  'current',
  'details',
  'during',
  'enough',
  'rather',
  'should',
  'their',
  'there',
  'these',
  'through',
  'where',
  'which',
  'while',
  'would',
  'without',
]);

function referenceScoringText(referenceText: string): string {
  const focus = referenceText.match(/## Evaluation Focus([\s\S]*?)(?:\n## Solution|\n## Visibility|$)/i)?.[1];
  const scoring = referenceText.match(/### Scoring Notes([\s\S]*?)(?:\n## |\n### |$)/i)?.[1];
  return [focus, scoring].filter(Boolean).join('\n') || referenceText;
}

function privateReferenceTerms(referenceText: string): string[] {
  const counts = new Map<string, number>();
  for (const token of referenceScoringText(referenceText).toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []) {
    const normalized = token.replace(/^-+|-+$/g, '');
    if (normalized.length < 5 || REFERENCE_STOPWORDS.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 32)
    .map(([term]) => term);
}

function referenceCandidateScore(candidate: CandidateSolution, privateTerms: string[]): Record<string, unknown> {
  const candidateText = publicCandidateText(candidate).toLowerCase();
  const matchedCount = privateTerms.filter((term) => candidateText.includes(term)).length;
  const targetCount = Math.max(1, Math.min(12, privateTerms.length));
  const coverage = Number((clamp(matchedCount / targetCount, 0, 1) * 10).toFixed(2));
  const score = Number((coverage - 5).toFixed(2));

  return {
    candidateId: candidate.id,
    title: candidate.title,
    score,
    rubric: {
      targetCount,
      matchedCount,
      coverage,
      scale: '-5_to_5',
    },
    factors: [
      `${matchedCount} sealed evaluator target signals matched out of ${targetCount}.`,
      'Reference terms are counted server-side and not included in this payload.',
    ],
  };
}

function sealedReferenceBenchmark(
  run: KernelRun,
  baseline: CandidateSolution,
  survivor: CandidateSolution,
): Record<string, unknown> {
  const referencePath = referenceCasePath(run);
  if (!existsSync(referencePath)) {
    return {
      judgeType: 'sealed_reference_keyword_benchmark',
      referenceStatus: 'no_reference_available',
      visibility: 'none',
      contentIncluded: false,
      verdict: 'inconclusive',
      statement: 'No sealed evaluator reference artifact was available for this case.',
      baseline: null,
      survivor: null,
      delta: {
        score: null,
      },
      factors: ['No reference benchmark was run.'],
    };
  }

  const privateTerms = privateReferenceTerms(readFileSync(referencePath, 'utf8'));
  const baselineJudgment = referenceCandidateScore(baseline, privateTerms);
  const survivorJudgment = referenceCandidateScore(survivor, privateTerms);
  const baselineScore = baselineJudgment.score as number;
  const survivorScore = survivorJudgment.score as number;
  const delta = Number((survivorScore - baselineScore).toFixed(2));
  const verdict =
    delta >= 1
      ? 'doppl_wins'
      : delta <= -1
        ? 'baseline_wins'
        : 'tie';

  return {
    judgeType: 'sealed_reference_keyword_benchmark',
    referenceStatus: 'withheld_reference_available',
    visibility: 'sealed_evaluator_only',
    contentIncluded: false,
    verdict,
    statement:
      verdict === 'doppl_wins'
        ? `Sealed reference benchmark favors the Doppl survivor by ${Math.abs(delta)} points.`
        : verdict === 'baseline_wins'
          ? `Sealed reference benchmark favors the clean baseline by ${Math.abs(delta)} points.`
          : 'Sealed reference benchmark treats the clean baseline and Doppl survivor as effectively tied.',
    baseline: baselineJudgment,
    survivor: survivorJudgment,
    delta: {
      score: delta,
    },
    factors: [
      'Evaluator reference was read only on the server.',
      'The response includes numeric coverage and generic factors, not evaluator answer text.',
    ],
  };
}

function assaySnapshot(
  run: KernelRun,
  candidate: CandidateSolution,
  type: AssaySnapshot['type'],
): AssaySnapshot {
  const record = latestFitnessRecord(run, candidate.id);
  if (record) {
    return {
      type,
      candidateId: candidate.id,
      path: candidatePath(run, candidate),
      title: candidate.title,
      summary: candidate.summary,
      fitnessTotal: record.total,
      proposalRating: proposalRating(record),
      scoreSource: 'direct_fitness',
    };
  }

  const parentAverage = type === 'doppl_survivor' ? averageSelectedParentScore(run) : null;
  return {
    type,
    candidateId: candidate.id,
    path: candidatePath(run, candidate),
    title: candidate.title,
    summary: candidate.summary,
    fitnessTotal: parentAverage,
    proposalRating: null,
    scoreSource: parentAverage === null ? 'unscored' : 'parent_average',
  };
}

function controlBaseline(run: KernelRun): Record<string, unknown> | null {
  const candidate = controlBaselineCandidate(run);
  if (!candidate) return null;
  const record = latestFitnessRecord(run, candidate.id);
  const selection = controlBaselineSelection(run);
  return {
    artifact_type: 'control_baseline',
    path: 'control-baseline.md',
    sourceCandidateId: candidate.id,
    sourceCandidatePath: candidatePath(run, candidate),
    selection,
    candidate: {
      id: candidate.id,
      title: candidate.title,
      summary: candidate.summary,
      mechanism: candidate.mechanism,
      claimedDelta: candidate.claimedDelta,
      citedKnowledge: candidate.citedKnowledge,
      agenomeId: candidate.agenomeId,
      generation: candidate.generation,
      fitnessTotal: record?.total ?? null,
      proposalRating: proposalRating(record),
      scoreSource: record ? 'direct_fitness' : 'unscored',
    },
    limits: [
      'This is a clean one-generation control artifact selected from the initial candidate population.',
      'It is not yet a separately generated clean-agent model run or independent held-out judge result.',
    ],
  };
}

function assayControl(run: KernelRun): Record<string, unknown> | null {
  const baseline = controlBaselineCandidate(run);
  const survivor = run.fusion?.child ?? run.selectedParents[0] ?? baseline;
  if (!baseline || !survivor) return null;

  const baselineSnapshot = assaySnapshot(run, baseline, 'clean_baseline');
  const survivorSnapshot = assaySnapshot(run, survivor, 'doppl_survivor');
  const control = controlBaseline(run);
  const baselineScore = baselineSnapshot.fitnessTotal;
  const survivorScore = survivorSnapshot.fitnessTotal;
  const delta =
    typeof baselineScore === 'number' && typeof survivorScore === 'number'
      ? Number((survivorScore - baselineScore).toFixed(2))
      : null;
  const verdict =
    delta === null
      ? 'inconclusive'
      : delta >= 3
        ? 'doppl_wins'
        : delta <= -3
          ? 'baseline_wins'
          : 'tie';
  const absoluteDelta = Math.abs(delta ?? 0);
  const statement =
    verdict === 'doppl_wins'
      ? `Doppl survivor beats the clean generation-0 baseline by ${absoluteDelta} fitness points on current in-run scoring.`
      : verdict === 'baseline_wins'
        ? `Clean generation-0 baseline still beats the Doppl survivor by ${absoluteDelta} fitness points; this run needs more pressure before claiming improvement.`
        : verdict === 'tie'
          ? `Doppl survivor and clean baseline are within ${absoluteDelta} fitness points; treat this as sharpened framing, not a proven win.`
          : 'Assay is inconclusive because the baseline or survivor lacks enough scored evidence.';

  return {
    assayType: 'in_run_clean_baseline',
    verdict,
    statement,
    heldOutJudge: heldOutAssayJudge(run, baseline, survivor),
    referenceCase: referenceCase(run),
    controlArtifact: control
      ? {
          path: control.path,
          sourceCandidateId: control.sourceCandidateId,
          sourceCandidatePath: control.sourceCandidatePath,
          selection: control.selection,
        }
      : null,
    baseline: baselineSnapshot,
    survivor: survivorSnapshot,
    delta: {
      fitnessTotal: delta,
      proposalRating:
        baselineSnapshot.proposalRating === null || survivorSnapshot.proposalRating === null
          ? null
          : Number((survivorSnapshot.proposalRating - baselineSnapshot.proposalRating).toFixed(2)),
    },
    evidence: [
      `Baseline: ${baselineSnapshot.title} (${baselineSnapshot.scoreSource}).`,
      `Survivor: ${survivorSnapshot.title} (${survivorSnapshot.scoreSource}).`,
      control ? `Control artifact: ${String(control.path)}.` : 'No control artifact could be selected.',
      run.fusion
        ? `Fusion parents: ${run.fusion.parentCandidateIds.join(' + ')} at compatibility ${run.fusion.compatibility.score}.`
        : 'No fusion child was produced for this run.',
    ],
    limits: [
      'Current assay uses in-run critic fitness, not an independent held-out model judge.',
      'A deterministic held-out artifact rubric is included, but the next phase should add a model/human judge and known-answer reference cases.',
    ],
  };
}

function runIndex(run: KernelRun, paths: { modelCallsPath?: string }): Record<string, unknown> {
  const fitnessByCandidate = new Map(
    run.fitnessRecords.map((fitness) => [fitness.candidateId, fitness.total]),
  );
  const selectedParentIds = new Set(run.selectedParents.map((parent) => parent.id));
  return {
    artifact_type: 'kernel_run_index',
    runId: run.id,
    caseId: run.caseStudy.id,
    caseTitle: run.caseStudy.title,
    memoryMode: run.memoryMode,
    initialAgenomePool: initialAgenomePool().map((agenome) => ({
      id: agenome.id,
      label: agenome.label,
      persona: agenome.persona,
      valueWeights: agenome.valueWeights,
      decompositionPolicy: agenome.decompositionPolicy,
    })),
    problemRecovery: {
      id: run.problemRecovery.id,
      path: 'problem-recovery.md',
      title: run.problemRecovery.title,
      recoveredProblem: run.problemRecovery.recoveredProblem,
      hiddenConstraint: run.problemRecovery.hiddenConstraint,
      falsifier: run.problemRecovery.falsifier,
      citedKnowledge: run.problemRecovery.citedKnowledge,
    },
    agenomes: run.agenomes,
    candidates: run.candidates.map((candidate) => ({
      id: candidate.id,
      path: solutionFilename(candidate),
      agenomeId: candidate.agenomeId,
      generation: candidate.generation,
      title: candidate.title,
      summary: candidate.summary,
      mechanism: candidate.mechanism,
      claimedDelta: candidate.claimedDelta,
      citedKnowledge: candidate.citedKnowledge,
      fitnessTotal: fitnessByCandidate.get(candidate.id) ?? null,
      selectedParent: selectedParentIds.has(candidate.id),
    })),
    child: run.fusion
      ? {
          id: run.fusion.child.id,
          path: solutionFilename(run.fusion.child),
          agenomeId: run.fusion.child.agenomeId,
          generation: run.fusion.child.generation,
          title: run.fusion.child.title,
          summary: run.fusion.child.summary,
          mechanism: run.fusion.child.mechanism,
          claimedDelta: run.fusion.child.claimedDelta,
          citedKnowledge: run.fusion.child.citedKnowledge,
          parentCandidateIds: run.fusion.parentCandidateIds,
          inheritanceWeights: run.fusion.inheritanceWeights,
          compatibility: run.fusion.compatibility,
          inheritedTraits: run.fusion.inheritedTraits,
          mutationNotes: run.fusion.mutationNotes,
        }
      : null,
    fusionChildren: run.fusionChildren.map((fusion) => ({
      generation: Math.max(0, fusion.child.generation - 1),
      child: {
        id: fusion.child.id,
        path: solutionFilename(fusion.child),
        agenomeId: fusion.child.agenomeId,
        generation: fusion.child.generation,
        title: fusion.child.title,
        summary: fusion.child.summary,
        mechanism: fusion.child.mechanism,
        claimedDelta: fusion.child.claimedDelta,
        citedKnowledge: fusion.child.citedKnowledge,
      },
      parentCandidateIds: fusion.parentCandidateIds,
      inheritanceWeights: fusion.inheritanceWeights,
      compatibility: fusion.compatibility,
      inheritedTraits: fusion.inheritedTraits,
      mutationNotes: fusion.mutationNotes,
    })),
    knowledgePacket: run.knowledgePacket,
    energyLedger: run.energyLedger,
    criticVerdicts: run.criticVerdicts,
    fitnessRecords: run.fitnessRecords,
    scheduleComparisons: scheduleComparisons(run),
    controlBaseline: controlBaseline(run),
    assayControl: assayControl(run),
    trace: {
      path: 'trace.json',
      eventsPath: 'events.jsonl',
      modelCallsPath: paths.modelCallsPath,
    },
    proposalNodes: {
      root: 'proposal-nodes/case-study.md',
      problemRecovery: 'proposal-nodes/problem-recovery.md',
      doppl: run.fusion ? 'proposal-nodes/doppl.md' : null,
    },
    evolution: run.evolution,
    budget: run.budget,
    modelOutputs: replayRunProjection(run.events).modelOutputs,
  };
}

function controlBaselineMarkdown(run: KernelRun): string | null {
  const control = controlBaseline(run);
  const candidate = controlBaselineCandidate(run);
  if (!control || !candidate) return null;
  const record = latestFitnessRecord(run, candidate.id);
  const selection = controlBaselineSelection(run);
  return `${frontmatter({
    artifact_type: 'control_baseline',
    artifact_id: `control_${candidate.id}`,
    case_id: run.caseStudy.id,
    source_candidate_id: candidate.id,
    source_candidate_path: candidatePath(run, candidate),
    selection,
    ...calibrationFields(),
  })}
# Clean Control Baseline: ${candidate.title}

${candidate.summary}

## Mechanism

${candidate.mechanism}

## Claimed Delta

${candidate.claimedDelta}

## Control Selection

${run.controlBaseline ? 'Generated as a separate clean-agent baseline before Doppl fusion and later-generation mutation pressure.' : 'Selected as the strongest scored generation-0 candidate before Doppl fusion and later-generation mutation pressure.'}

Fitness total: ${record?.total ?? 'unscored'}
Proposal rating: ${proposalRating(record) ?? 'n/a'}

## Assay Limits

- This is a clean one-generation control artifact selected from the initial candidate population.
- It is not yet a separately generated clean-agent model run or independent held-out judge result.

## Knowledge Citations

${candidate.citedKnowledge.join(', ') || 'none'}
`;
}

function problemRecoveryMarkdown(run: KernelRun, fields: Record<string, string> = {}): string {
  return `${frontmatter({
    artifact_type: 'problem_recovery',
    artifact_id: run.problemRecovery.id,
    case_id: run.caseStudy.id,
    ...fields,
  })}
# ${run.problemRecovery.title}

${run.problemRecovery.recoveredProblem}

## Hidden Constraint

${run.problemRecovery.hiddenConstraint}

## Falsifier

${run.problemRecovery.falsifier}

## Knowledge Citations

${run.problemRecovery.citedKnowledge.join(', ') || 'none'}
`;
}

function calibrationManifest(run: KernelRun): Record<string, unknown> {
  return {
    artifact_type: 'calibration_run_manifest',
    runId: run.id,
    caseId: run.caseStudy.id,
    caseTitle: run.caseStudy.title,
    problemRecovery: {
      id: run.problemRecovery.id,
      path: 'problem-recovery.md',
    },
    candidates: run.candidates.map((candidate) => ({
      id: candidate.id,
      path: solutionFilename(candidate),
      rating: null,
    })),
    child: run.fusion
      ? {
          id: run.fusion.child.id,
          path: solutionFilename(run.fusion.child),
          rating: null,
        }
      : null,
    ratings: {
      problemRecovery: null,
      candidates: Object.fromEntries(run.candidates.map((candidate) => [candidate.id, null])),
      child: run.fusion ? { [run.fusion.child.id]: null } : {},
    },
  };
}

export async function exportRunToVault(
  run: KernelRun,
  rootDir: string,
): Promise<VaultExportManifest> {
  const runDir = path.join(rootDir, run.caseStudy.id, run.id);
  await mkdir(runDir, { recursive: true });
  const files: string[] = [];
  const recoveryPath = path.join(runDir, 'problem-recovery.md');
  await writeFile(recoveryPath, problemRecoveryMarkdown(run), 'utf8');
  files.push(recoveryPath);

  const controlMarkdown = controlBaselineMarkdown(run);
  if (controlMarkdown) {
    const controlPath = path.join(runDir, 'control-baseline.md');
    await writeFile(controlPath, controlMarkdown, 'utf8');
    files.push(controlPath);
  }

  for (const solution of exportedSolutions(run)) {
    const solutionPath = path.join(runDir, solutionFilename(solution));
    await writeFile(solutionPath, solutionMarkdown(solution), 'utf8');
    files.push(solutionPath);
  }

  for (const node of compileProposalNodes(run)) {
    const nodePath = path.join(runDir, node.path);
    await mkdir(path.dirname(nodePath), { recursive: true });
    await writeFile(nodePath, node.markdown, 'utf8');
    files.push(nodePath);
  }

  const tracePath = path.join(runDir, 'trace.json');
  await writeFile(tracePath, JSON.stringify(run, null, 2), 'utf8');
  files.push(tracePath);

  const eventLogPath = path.join(runDir, 'events.jsonl');
  await writeRunEvents(eventLogPath, run.events);
  files.push(eventLogPath);

  let modelCallsRelativePath: string | undefined;
  if (run.modelCallRecords?.length) {
    const modelCallsPath = path.join(runDir, 'model-calls.jsonl');
    await writeModelCallRecords(modelCallsPath, run.modelCallRecords);
    files.push(modelCallsPath);
    modelCallsRelativePath = 'model-calls.jsonl';
  }

  const indexPath = path.join(runDir, 'run-index.json');
  await writeFile(
    indexPath,
    JSON.stringify(runIndex(run, { modelCallsPath: modelCallsRelativePath }), null, 2),
    'utf8',
  );
  files.push(indexPath);

  return { rootDir: runDir, files };
}

export async function exportRunToCalibrationVault(
  run: KernelRun,
  rootDir: string,
): Promise<VaultExportManifest> {
  const runDir = path.join(rootDir, run.caseStudy.id, run.id);
  await mkdir(runDir, { recursive: true });
  const files: string[] = [];

  const recoveryPath = path.join(runDir, 'problem-recovery.md');
  await writeFile(recoveryPath, problemRecoveryMarkdown(run, calibrationFields()), 'utf8');
  files.push(recoveryPath);

  for (const solution of exportedSolutions(run)) {
    const solutionPath = path.join(runDir, solutionFilename(solution));
    await writeFile(solutionPath, solutionMarkdown(solution, calibrationFields()), 'utf8');
    files.push(solutionPath);
  }

  const manifestPath = path.join(runDir, 'calibration-manifest.json');
  await writeFile(manifestPath, JSON.stringify(calibrationManifest(run), null, 2), 'utf8');
  files.push(manifestPath);

  return { rootDir: runDir, files };
}
