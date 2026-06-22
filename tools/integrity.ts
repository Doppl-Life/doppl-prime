// Checks repository surface contracts that should fail fast during pnpm build.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPepsiGeneratorRequestClean, assertPepsiOutput, PEPSI_GENERATOR_REQUEST_SCHEMA_VERSION, PEPSI_OUTPUT_SCHEMA_VERSION, type PepsiGeneratorRequest, type PepsiOutput } from './pepsi-output.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type PackageJson = {
  scripts?: Record<string, string>;
};

const requiredScripts = [
  'typecheck',
  'proof',
  'pepsi:generator-check',
  'build',
  'proof:export',
  'case-study:lint',
  'serve',
  'publish:html',
  'serve:static',
  'clear:run-data',
];

const requiredPaths = [
  '.gitignore',
  'AGENTS.md',
  'README.md',
  'MEMORY.md',
  'package.json',
  'src/trace.ts',
  'src/contracts/index.ts',
  'tools/run.ts',
  'tools/serve.ts',
  'tools/publish.ts',
  'tools/static-server.ts',
  'tools/pepsi-output.ts',
  'tools/pepsi-generator-check.ts',
  'tools/clear-run-data.ts',
  'tools/integrity.ts',
  'published/assay.html',
  'published/microscope.html',
  'published/architecture.html',
  'published/architecture-v2.html',
  'specs/runtime-kernel.md',
  'specs/artifacts-deploy.md',
];

const requiredGitignoreEntries = [
  '.env',
  '.env.*',
  'node_modules/',
  'out/',
  'published/index.html',
  'records/assay-judgments/*.jsonl',
];

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectFailure(label: string, action: () => void): string | undefined {
  try {
    action();
    return `missing Pepsi output validation failure: ${label}`;
  } catch {
    return undefined;
  }
}

function pepsiOutputContractFailures(): string[] {
  const failures: string[] = [];
  const valid: PepsiOutput = {
    schemaVersion: PEPSI_OUTPUT_SCHEMA_VERSION,
    caseSlug: 'contract-case',
    caseLabel: 'Contract Case',
    seedId: 'seed-1',
    runId: 'run-1',
    generatedAt: '1970-01-01T00:00:00.000Z',
    status: {
      source: 'deterministic-fallback',
      generator: 'not-configured',
      ok: true,
      message: 'contract check',
    },
    primaryPacketId: 'pepsi:contract-case:one',
    packets: [{
      id: 'pepsi:contract-case:one',
      title: 'One packet',
      claim: 'The claim is inspectable.',
      subtype: 'strategy',
      sourceContext: 'contract fixture',
      problemRecovery: {
        surfaceComplaint: 'Surface complaint',
        deletedAssumption: 'Deleted assumption',
        hiddenVariable: 'Hidden variable',
        actualProblem: 'Actual problem',
        candidateResponse: 'Candidate response',
      },
      implicationMap: {
        disappears: ['Old event stream'],
        getsCheaper: ['Inspection'],
        winners: ['Prepared actor'],
        losers: ['Old assumption holder'],
        secondOrderEffects: ['Second-order effect'],
      },
      noveltyBasis: 'Novelty basis',
      groundingBasis: 'Grounding basis',
      falsifier: 'Falsifier',
      mechanismCost: 'Mechanism cost',
      lensFit: 'Lens fit',
      lineage: {
        candidateIds: ['c1'],
        parent: 'seed:seed-1',
        generation: 1,
        operator: 'operator',
        claimedDelta: 'delta',
        nearestPrior: 'seed-1',
      },
    }],
    tactics: [{
      id: 'tactic:contract-case:one',
      pepsiId: 'pepsi:contract-case:one',
      name: 'Test it',
      howItPursues: 'Run the falsifier.',
      hardConstraints: ['Constraint'],
      softAxes: ['Axis'],
      linkedCandidateIds: ['c1'],
    }],
  };

  try {
    assertPepsiOutput(valid, { caseSlug: 'contract-case', runId: 'run-1', validCandidateIds: ['c1'] });
  } catch (error) {
    failures.push(`valid Pepsi output failed validation: ${error instanceof Error ? error.message : String(error)}`);
  }

  const missingFalsifier = clone(valid);
  missingFalsifier.packets[0].falsifier = '';
  const missingLineage = clone(valid);
  delete (missingLineage.packets[0] as Partial<typeof missingLineage.packets[number]>).lineage;
  const invalidSubtype = clone(valid);
  invalidSubtype.packets[0].subtype = 'bad-subtype' as typeof invalidSubtype.packets[number]['subtype'];
  const invalidTacticLink = clone(valid);
  invalidTacticLink.tactics[0].pepsiId = 'pepsi:contract-case:missing';
  const missingPrimary = clone(valid);
  missingPrimary.primaryPacketId = null;
  const invalidTacticCandidateLink = clone(valid);
  invalidTacticCandidateLink.tactics[0].linkedCandidateIds = ['c2'];
  const unknownSchema = clone(valid);
  unknownSchema.schemaVersion = 'kernel.pepsi-output.v999' as typeof unknownSchema.schemaVersion;

  for (const failure of [
    expectFailure('missing falsifier', () => assertPepsiOutput(missingFalsifier)),
    expectFailure('missing lineage', () => assertPepsiOutput(missingLineage)),
    expectFailure('invalid subtype', () => assertPepsiOutput(invalidSubtype)),
    expectFailure('invalid tactic link', () => assertPepsiOutput(invalidTacticLink)),
    expectFailure('missing primary packet id', () => assertPepsiOutput(missingPrimary)),
    expectFailure('tactic candidate outside packet lineage', () => assertPepsiOutput(invalidTacticCandidateLink, { validCandidateIds: ['c1', 'c2'] })),
    expectFailure('unknown schema version', () => assertPepsiOutput(unknownSchema)),
  ]) {
    if (failure) failures.push(failure);
  }

  const generatorRequest: PepsiGeneratorRequest = {
    schemaVersion: PEPSI_GENERATOR_REQUEST_SCHEMA_VERSION,
    caseSlug: 'contract-case',
    caseLabel: 'Contract Case',
    seedCase: {
      seedId: 'seed-1',
      title: 'Contract Case',
      subtype: 'strategy',
      status: 'open',
      caseStudyPath: 'case-studies/contract-case/case-study.md',
      seedMarkdownBytes: 100,
    },
    trace: {
      schemaVersion: 'kernel.run-trace.v2',
      runId: 'run-1',
      dial: 'diverge',
      seed: { id: 'seed-1', title: 'Seed', prompt: 'Prompt', thesis: 'Thesis', goals: [] },
      caps: { maxGenerations: 0, maxChildrenPerParent: 0, maxPopulation: 0 },
      candidateCount: 0,
      lineage: { seedId: 'seed-1', generated: [], rejected: [] },
      generations: [],
      boundaryContracts: [],
      events: [],
      goalChecks: [],
      comparison: {
        focus: { schedule: { dial: 'diverge', keep: 0, priorityAxis: 'novelty', floorAxis: 'grounding', floor: 0, decayPolicy: 'ignore', description: 'contract' }, selected: [], rejected: [] },
        alternate: { schedule: { dial: 'converge', keep: 0, priorityAxis: 'grounding', floorAxis: 'novelty', floor: 0, decayPolicy: 'ignore', description: 'contract' }, selected: [], rejected: [] },
        contrasts: [],
      },
      lensResults: [],
      terminalReason: 'contract',
    },
  };
  try {
    assertPepsiGeneratorRequestClean(generatorRequest);
  } catch (error) {
    failures.push(`clean Pepsi generator request failed validation: ${error instanceof Error ? error.message : String(error)}`);
  }
  const dirtyRequest = clone(generatorRequest);
  dirtyRequest.seedCase.caseStudyPath = 'case-studies/contract-case/solution.md';
  const dirtyFailure = expectFailure('generator request solution leakage', () => assertPepsiGeneratorRequestClean(dirtyRequest));
  if (dirtyFailure) failures.push(dirtyFailure);
  const directoryRequest = clone(generatorRequest);
  directoryRequest.seedCase.caseStudyPath = 'case-studies/contract-case/';
  const directoryFailure = expectFailure('generator request directory leakage', () => assertPepsiGeneratorRequestClean(directoryRequest));
  if (directoryFailure) failures.push(directoryFailure);

  return failures;
}

function main(): void {
  const failures: string[] = [];
  const packageJson = readJson<PackageJson>(path.join(root, 'package.json'));
  const scripts = packageJson.scripts || {};

  for (const script of requiredScripts) {
    if (!scripts[script]) failures.push(`missing package script: ${script}`);
  }
  for (const script of Object.keys(scripts)) {
    if (!requiredScripts.includes(script)) failures.push(`unblessed package script: ${script}`);
  }
  for (const requiredPath of requiredPaths) {
    if (!existsSync(path.join(root, requiredPath))) failures.push(`missing required path: ${requiredPath}`);
  }
  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const entry of requiredGitignoreEntries) {
    if (!gitignore.split(/\r?\n/).includes(entry)) failures.push(`.gitignore missing: ${entry}`);
  }
  failures.push(...pepsiOutputContractFailures());

  if (failures.length) {
    console.error(`integrity failed: ${failures.length}`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`integrity passed: scripts=${requiredScripts.length}; paths=${requiredPaths.length}`);
}

main();
