import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CandidateSolution, KernelRun, VaultExportManifest } from './contracts.ts';
import { writeRunEvents } from './event-store.ts';
import { writeModelCallRecords } from './model-gateway.ts';

function frontmatter(fields: Record<string, string>): string {
  return [
    '---',
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
    '---',
    '',
  ].join('\n');
}

function solutionMarkdown(solution: CandidateSolution): string {
  return `${frontmatter({
    artifact_type: 'solution',
    artifact_id: solution.id,
    case_id: solution.caseId,
    agenome_id: solution.agenomeId,
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

export async function exportRunToVault(
  run: KernelRun,
  rootDir: string,
): Promise<VaultExportManifest> {
  const runDir = path.join(rootDir, run.caseStudy.id, run.id);
  await mkdir(runDir, { recursive: true });
  const files: string[] = [];
  const recoveryPath = path.join(runDir, 'problem-recovery.md');
  await writeFile(
    recoveryPath,
    `${frontmatter({
      artifact_type: 'problem_recovery',
      artifact_id: run.problemRecovery.id,
      case_id: run.caseStudy.id,
    })}
# ${run.problemRecovery.title}

${run.problemRecovery.recoveredProblem}

## Hidden Constraint

${run.problemRecovery.hiddenConstraint}

## Falsifier

${run.problemRecovery.falsifier}

## Knowledge Citations

${run.problemRecovery.citedKnowledge.join(', ') || 'none'}
`,
    'utf8',
  );
  files.push(recoveryPath);

  for (const solution of [...run.candidates, ...(run.fusion ? [run.fusion.child] : [])]) {
    const solutionPath = path.join(runDir, `${solution.id}.md`);
    await writeFile(solutionPath, solutionMarkdown(solution), 'utf8');
    files.push(solutionPath);
  }

  const tracePath = path.join(runDir, 'trace.json');
  await writeFile(tracePath, JSON.stringify(run, null, 2), 'utf8');
  files.push(tracePath);

  const eventLogPath = path.join(runDir, 'events.jsonl');
  await writeRunEvents(eventLogPath, run.events);
  files.push(eventLogPath);

  if (run.modelCallRecords?.length) {
    const modelCallsPath = path.join(runDir, 'model-calls.jsonl');
    await writeModelCallRecords(modelCallsPath, run.modelCallRecords);
    files.push(modelCallsPath);
  }
  return { rootDir: runDir, files };
}
