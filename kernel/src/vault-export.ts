import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CandidateSolution, KernelRun, VaultExportManifest } from './contracts.ts';
import { replayRunProjection, writeRunEvents } from './event-store.ts';
import { writeModelCallRecords } from './model-gateway.ts';

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
    problemRecovery: {
      id: run.problemRecovery.id,
      path: 'problem-recovery.md',
    },
    candidates: run.candidates.map((candidate) => ({
      id: candidate.id,
      path: solutionFilename(candidate),
      agenomeId: candidate.agenomeId,
      generation: candidate.generation,
      fitnessTotal: fitnessByCandidate.get(candidate.id) ?? null,
      selectedParent: selectedParentIds.has(candidate.id),
    })),
    child: run.fusion
      ? {
          id: run.fusion.child.id,
          path: solutionFilename(run.fusion.child),
          parentCandidateIds: run.fusion.parentCandidateIds,
          inheritanceWeights: run.fusion.inheritanceWeights,
          compatibility: run.fusion.compatibility,
        }
      : null,
    trace: {
      path: 'trace.json',
      eventsPath: 'events.jsonl',
      modelCallsPath: paths.modelCallsPath,
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

  for (const solution of [...run.candidates, ...(run.fusion ? [run.fusion.child] : [])]) {
    const solutionPath = path.join(runDir, solutionFilename(solution));
    await writeFile(solutionPath, solutionMarkdown(solution), 'utf8');
    files.push(solutionPath);
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

  for (const solution of [...run.candidates, ...(run.fusion ? [run.fusion.child] : [])]) {
    const solutionPath = path.join(runDir, solutionFilename(solution));
    await writeFile(solutionPath, solutionMarkdown(solution, calibrationFields()), 'utf8');
    files.push(solutionPath);
  }

  const manifestPath = path.join(runDir, 'calibration-manifest.json');
  await writeFile(manifestPath, JSON.stringify(calibrationManifest(run), null, 2), 'utf8');
  files.push(manifestPath);

  return { rootDir: runDir, files };
}
