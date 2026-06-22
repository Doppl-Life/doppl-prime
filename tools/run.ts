// Runs seed fixtures and renders the compact proof board.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dial, RunTrace, SeedFixture, SelectionResult } from '../src/contracts/index.ts';
import { assertSeedFixture } from '../src/contracts/index.ts';
import { buildRunTrace } from '../src/trace.ts';
import { loadCaseStudyPublicView, loadCaseStudySeedView } from './case-study-corpus.ts';
import type { CaseStudyPublicView } from './case-study-corpus.ts';
import { capstoneDemoLens } from './lens-config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PROOF_BOARD_SCHEMA_VERSION = 'kernel.proof-board.v1';

type ProofCaseSummary = {
  seed: string;
  caseStudy?: {
    slug: string;
    title: string;
    subtype: CaseStudyPublicView['subtype'];
    status: CaseStudyPublicView['status'];
    seed: string;
    seedMarkdownBytes: number;
  };
  generated: number;
  rejected: number;
  exploreKeeps: string[];
  proofKeeps: string[];
  swap: string;
  failedChecks: string[];
};

type ProofBoardSnapshot = {
  schemaVersion: string;
  cases: ProofCaseSummary[];
  aggregate: {
    seeds: number;
    generated: number;
    rejected: number;
    failedChecks: number;
  };
};

type Args = {
  dial: Dial;
  fixture?: string;
  fixturesDir: string;
  outDir: string;
  exportProofBoard: boolean;
};

const seedCaseStudySlugs: Record<string, string> = {
  'seed-ai-power': 'ai-firm-power-constraint',
  'seed-fsd-unlock': 'full-self-driving-unlock',
  'seed-glp1': 'glp1-snack-demand-destruction',
  'seed-starship': 'starship-launch-cost-collapse',
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dial: 'diverge',
    fixturesDir: path.join(root, 'fixtures'),
    outDir: path.join(root, 'out', 'proof-board'),
    exportProofBoard: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--dial=')) {
      const dial = arg.slice('--dial='.length);
      if (dial !== 'diverge' && dial !== 'converge') {
        throw new Error(`Bad --dial value: ${dial}`);
      }
      args.dial = dial;
    } else if (arg.startsWith('--fixture=')) {
      args.fixture = path.resolve(root, arg.slice('--fixture='.length));
    } else if (arg.startsWith('--fixtures-dir=')) {
      args.fixturesDir = path.resolve(root, arg.slice('--fixtures-dir='.length));
    } else if (arg.startsWith('--out-dir=')) {
      args.outDir = path.resolve(root, arg.slice('--out-dir='.length));
    } else if (arg === '--export-proof-board') {
      args.exportProofBoard = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function displayPath(filePath: string): string {
  return path.relative(root, filePath);
}

async function fixturePaths(args: Args): Promise<string[]> {
  if (args.fixture) return [args.fixture];
  const entries = await readdir(args.fixturesDir, { withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(args.fixturesDir, entry.name))
    .sort();
  if (!paths.length) {
    throw new Error(`No fixture JSON files found in ${displayPath(args.fixturesDir)}.`);
  }
  return paths;
}

async function loadFixture(filePath: string): Promise<SeedFixture> {
  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  return assertSeedFixture(raw);
}

function caseStudySlugForSeed(seedId: string): string | undefined {
  if (seedCaseStudySlugs[seedId]) return seedCaseStudySlugs[seedId];
  if (seedId.startsWith('seed-')) return seedId.slice('seed-'.length);
  return undefined;
}

async function loadProofCaseStudy(trace: RunTrace): Promise<ProofCaseSummary['caseStudy']> {
  const slug = caseStudySlugForSeed(trace.seed.id);
  if (!slug) return undefined;
  try {
    const [publicView, seedView] = await Promise.all([
      loadCaseStudyPublicView(slug),
      loadCaseStudySeedView(slug),
    ]);
    return {
      slug,
      title: publicView.title,
      subtype: publicView.subtype,
      status: publicView.status,
      seed: publicView.paths.caseStudy,
      seedMarkdownBytes: seedView.caseStudyMarkdown.length,
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function selectionForDial(trace: RunTrace, dial: Dial): SelectionResult {
  if (trace.comparison.focus.schedule.dial === dial) return trace.comparison.focus;
  return trace.comparison.alternate;
}

function selectedTitles(selection: SelectionResult): string[] {
  return selection.selected.map((candidate) => `${candidate.title} (g${candidate.generation})`);
}

function titleFor(trace: RunTrace, id: string): string {
  const candidates = [
    ...trace.comparison.focus.selected,
    ...trace.comparison.focus.rejected,
    ...trace.comparison.alternate.selected,
    ...trace.comparison.alternate.rejected,
  ];
  const candidate = candidates.find((item) => item.id === id);
  return candidate ? `${candidate.title} (g${candidate.generation})` : id;
}

function swap(trace: RunTrace): string {
  const explore = selectionForDial(trace, 'diverge').selected;
  const proof = selectionForDial(trace, 'converge').selected;
  const exploreIds = new Set(explore.map((candidate) => candidate.id));
  const proofIds = new Set(proof.map((candidate) => candidate.id));
  const replaced = explore.find((candidate) => !proofIds.has(candidate.id));
  if (replaced) {
    const replacement = proof.find((candidate) => !exploreIds.has(candidate.id)) || proof[explore.indexOf(replaced)];
    return replacement ? `${titleFor(trace, replaced.id)} -> ${titleFor(trace, replacement.id)}` : `${titleFor(trace, replaced.id)} -> none`;
  }

  const rankShift = explore.find((candidate, index) => proof[index] && proof[index].id !== candidate.id);
  if (!rankShift) return 'none';
  const index = explore.indexOf(rankShift);
  return `rank: ${titleFor(trace, rankShift.id)} <> ${titleFor(trace, proof[index].id)}`;
}

function summarize(trace: RunTrace, caseStudy?: ProofCaseSummary['caseStudy']): ProofCaseSummary {
  const explore = selectionForDial(trace, 'diverge');
  const proof = selectionForDial(trace, 'converge');
  return {
    seed: trace.seed.title,
    caseStudy,
    generated: trace.lineage.generated.length,
    rejected: trace.lineage.rejected.length,
    exploreKeeps: selectedTitles(explore),
    proofKeeps: selectedTitles(proof),
    swap: swap(trace),
    failedChecks: trace.goalChecks.filter((check) => !check.passed).map((check) => check.id),
  };
}

function buildSnapshot(traces: RunTrace[], caseStudies: Array<ProofCaseSummary['caseStudy']>): ProofBoardSnapshot {
  const cases = traces.map((trace, index) => summarize(trace, caseStudies[index]));
  return {
    schemaVersion: PROOF_BOARD_SCHEMA_VERSION,
    cases,
    aggregate: {
      seeds: cases.length,
      generated: cases.reduce((sum, item) => sum + item.generated, 0),
      rejected: cases.reduce((sum, item) => sum + item.rejected, 0),
      failedChecks: cases.reduce((sum, item) => sum + item.failedChecks.length, 0),
    },
  };
}

function compactList(items: string[]): string {
  if (!items.length) return 'none';
  return items.join('; ');
}

function renderBoard(snapshot: ProofBoardSnapshot): string {
  const lines = [
    'seed -> generated -> rejected -> Explore keeps -> Proof keeps -> swap -> failed checks',
    '| seed | generated | rejected | Explore keeps | Proof keeps | swap | failed checks |',
    '| --- | ---: | ---: | --- | --- | --- | --- |',
  ];
  for (const row of snapshot.cases) {
    lines.push(`| ${row.seed} | ${row.generated} | ${row.rejected} | ${compactList(row.exploreKeeps)} | ${compactList(row.proofKeeps)} | ${row.swap} | ${compactList(row.failedChecks)} |`);
  }
  lines.push(`aggregate: seeds=${snapshot.aggregate.seeds}; generated=${snapshot.aggregate.generated}; rejected=${snapshot.aggregate.rejected}; failedChecks=${snapshot.aggregate.failedChecks}`);
  return lines.join('\n');
}

async function writeArtifacts(args: Args, traces: RunTrace[], snapshot: ProofBoardSnapshot): Promise<void> {
  await mkdir(args.outDir, { recursive: true });
  const boardPath = path.join(args.outDir, 'proof-board.json');
  await writeFile(boardPath, JSON.stringify(snapshot, null, 2), 'utf8');

  for (const trace of traces) {
    const traceDir = path.join(args.outDir, trace.seed.id);
    await mkdir(traceDir, { recursive: true });
    await writeFile(path.join(traceDir, 'run-trace.json'), JSON.stringify(trace, null, 2), 'utf8');
  }

  console.log(`artifacts: ${displayPath(boardPath)}; traces under ${displayPath(args.outDir)}/<seed>/run-trace.json`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const paths = await fixturePaths(args);
  const fixtures = await Promise.all(paths.map(loadFixture));
  const traces = fixtures.map((fixture) => buildRunTrace(fixture, args.dial, { lenses: [capstoneDemoLens] }));
  const caseStudies = await Promise.all(traces.map(loadProofCaseStudy));
  const snapshot = buildSnapshot(traces, caseStudies);

  console.log(renderBoard(snapshot));
  if (args.exportProofBoard) {
    await writeArtifacts(args, traces, snapshot);
  } else {
    console.log('drill-down: run `pnpm proof:export` to write out/proof-board/*.json');
  }

  if (snapshot.aggregate.failedChecks > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
