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
  return exportedSolutions(run).find((candidate) => candidate.id === candidateId);
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
    title: candidate.title,
    summary: candidate.summary,
    fitnessTotal: parentAverage,
    proposalRating: null,
    scoreSource: parentAverage === null ? 'unscored' : 'parent_average',
  };
}

function assayControl(run: KernelRun): Record<string, unknown> | null {
  const baseline = bestGenerationCandidate(run, 0);
  const survivor = run.fusion?.child ?? run.selectedParents[0] ?? baseline;
  if (!baseline || !survivor) return null;

  const baselineSnapshot = assaySnapshot(run, baseline, 'clean_baseline');
  const survivorSnapshot = assaySnapshot(run, survivor, 'doppl_survivor');
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
      run.fusion
        ? `Fusion parents: ${run.fusion.parentCandidateIds.join(' + ')} at compatibility ${run.fusion.compatibility.score}.`
        : 'No fusion child was produced for this run.',
    ],
    limits: [
      'Current assay uses in-run critic fitness, not an independent held-out model judge.',
      'Next phase should add a clean-agent model baseline and known-answer reference cases.',
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
