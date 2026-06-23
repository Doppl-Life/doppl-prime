import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const corpusRoot = path.join(root, 'case-studies');

export const CASE_STUDY_CORPUS_SCHEMA_VERSION = 'kernel.case-study-corpus.v2';

export type CaseStudyAccess = 'public' | 'seed' | 'judge';
export type CaseStudyStatus = 'solved' | 'open';

export type CaseStudyPublicPaths = {
  dir: string;
  caseStudy: string;
  solution?: string;
  sources: string[];
};

export type CaseStudySeedPaths = {
  dir: string;
  caseStudy: string;
};

type CaseStudyIdentity = {
  schemaVersion: typeof CASE_STUDY_CORPUS_SCHEMA_VERSION;
  slug: string;
  title: string;
  status: CaseStudyStatus;
};

export type CaseStudyPublicView = CaseStudyIdentity & {
  access: 'public';
  paths: CaseStudyPublicPaths;
};

export type CaseStudySeedView = CaseStudyIdentity & {
  access: 'seed';
  paths: CaseStudySeedPaths;
  caseStudyMarkdown: string;
};

export type CaseStudyJudgeView = CaseStudyIdentity & {
  access: 'judge';
  paths: CaseStudyPublicPaths;
  caseStudyMarkdown: string;
  solutionMarkdown?: string;
};

type CaseStudyFiles = {
  slug: string;
  dir: string;
  caseStudyPath: string;
  solutionPath?: string;
  sourcePaths: string[];
};

export type CaseStudyView = CaseStudyPublicView | CaseStudySeedView | CaseStudyJudgeView;

function displayPath(filePath: string): string {
  return path.relative(root, filePath);
}

function slugTitle(slug: string): string {
  return slug
    .split('-')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(' ');
}

function extractTitle(markdown: string, slug: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || slugTitle(slug)).replace(/^Problem Statement:\s*/i, '').replace(/^Case Study:\s*/i, '');
}

function toPublicPaths(files: CaseStudyFiles): CaseStudyPublicPaths {
  return {
    dir: displayPath(files.dir),
    caseStudy: displayPath(files.caseStudyPath),
    solution: files.solutionPath ? displayPath(files.solutionPath) : undefined,
    sources: files.sourcePaths.map(displayPath),
  };
}

function toSeedPaths(files: CaseStudyFiles): CaseStudySeedPaths {
  return {
    dir: displayPath(files.dir),
    caseStudy: displayPath(files.caseStudyPath),
  };
}

function assertSeedVisiblePath(filePath: string): void {
  const base = path.basename(filePath);
  if (base !== 'case-study.md') {
    throw new Error(`Seed view can only read case-study.md; got ${displayPath(filePath)}.`);
  }
}

const seedForbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: 'evaluator section', pattern: /^## (Source|Visibility|Purpose|Problem Recovery|Solution|Reproducible|Validator|Notes|Evaluation Focus)\b/m },
  { label: 'answer rubric', pattern: /A strong generated answer should|A good answer must|the answer should/i },
  { label: 'expected result', pattern: /Expected Result/i },
  { label: 'judge knowledge', pattern: /Judge's Knowledge|evaluator-only/i },
  { label: 'weak-answer rubric', pattern: /weak answer/i },
  { label: 'model-facing meta', pattern: /Doppl prompt|agenome|model-facing|prompt-facing|generation runs|generated solution/i },
  { label: 'case-method meta', pattern: /\bzeitgeist\b|\bsubtype\b|\bPepsis\b|\bthesis\b|\bOutput is\b|Consensus plays/i },
  { label: 'withheld-file meta', pattern: /\bwithhold|\bwithheld/i },
  { label: 'known-answer reference', pattern: /known solution|known intervention|known policy|known candidate|solution pattern/i },
  { label: 'scoring language', pattern: /\bscore\b|\bscored\b|\bscoring\b|\bscores well\b|\breward\b/i },
  { label: 'answer-command language', pattern: /\bThe answer must\b|must recover|must find|must map|must be wrong/i },
];

function assertSeedMarkdownClean(markdown: string, filePath: string): void {
  const hits = seedForbiddenPatterns
    .filter(({ pattern }) => pattern.test(markdown))
    .map(({ label }) => label);
  if (hits.length) {
    throw new Error(`Seed view contains evaluator leakage in ${displayPath(filePath)}: ${hits.join(', ')}.`);
  }
}

function loadSeedMarkdown(markdown: string, filePath: string): string {
  const seedMarkdown = markdown.trim() + '\n';
  assertSeedMarkdownClean(seedMarkdown, filePath);
  return seedMarkdown;
}

async function readCaseFiles(slug: string): Promise<CaseStudyFiles> {
  const dir = path.join(corpusRoot, slug);
  const entries = await readdir(dir, { withFileTypes: true });
  const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const caseStudyPath = names.has('case-study.md') ? path.join(dir, 'case-study.md') : undefined;
  const solutionPath = names.has('solution.md') ? path.join(dir, 'solution.md') : undefined;

  if (!caseStudyPath) throw new Error(`Case study ${slug} is missing case-study.md.`);
  if (!solutionPath) throw new Error(`Case study ${slug} is missing solution.md.`);

  const sourcePaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => ![
      'case-study.md',
      'solution.md',
    ].includes(name))
    .sort()
    .map((name) => path.join(dir, name));

  return { slug, dir, caseStudyPath, solutionPath, sourcePaths };
}

async function loadIdentity(files: CaseStudyFiles): Promise<CaseStudyIdentity> {
  const [caseStudyMarkdown, solutionMarkdown] = await Promise.all([
    readFile(files.caseStudyPath, 'utf8'),
    files.solutionPath ? readFile(files.solutionPath, 'utf8') : Promise.resolve(undefined),
  ]);
  return {
    schemaVersion: CASE_STUDY_CORPUS_SCHEMA_VERSION,
    slug: files.slug,
    title: extractTitle(caseStudyMarkdown, files.slug),
    status: solutionMarkdown?.match(/\bsolution unknown\b/i) ? 'open' : 'solved',
  };
}

export async function listCaseStudySlugs(): Promise<string[]> {
  const entries = await readdir(corpusRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function loadCaseStudyPublicView(slug: string): Promise<CaseStudyPublicView> {
  const files = await readCaseFiles(slug);
  const identity = await loadIdentity(files);
  return { ...identity, access: 'public', paths: toPublicPaths(files) };
}

export async function loadCaseStudySeedView(slug: string): Promise<CaseStudySeedView> {
  const files = await readCaseFiles(slug);
  assertSeedVisiblePath(files.caseStudyPath);
  const [identity, caseStudyMarkdown] = await Promise.all([
    loadIdentity(files),
    readFile(files.caseStudyPath, 'utf8'),
  ]);
  const seedMarkdown = loadSeedMarkdown(caseStudyMarkdown, files.caseStudyPath);
  return { ...identity, access: 'seed', paths: toSeedPaths(files), caseStudyMarkdown: seedMarkdown };
}

export async function loadCaseStudyJudgeView(slug: string): Promise<CaseStudyJudgeView> {
  const files = await readCaseFiles(slug);
  const [identity, caseStudyMarkdown, solutionMarkdown] = await Promise.all([
    loadIdentity(files),
    readFile(files.caseStudyPath, 'utf8'),
    files.solutionPath ? readFile(files.solutionPath, 'utf8') : Promise.resolve(undefined),
  ]);
  return {
    ...identity,
    access: 'judge',
    paths: toPublicPaths(files),
    caseStudyMarkdown,
    solutionMarkdown,
  };
}

export async function loadCaseStudyView(slug: string, access: CaseStudyAccess): Promise<CaseStudyView> {
  if (access === 'seed') return loadCaseStudySeedView(slug);
  if (access === 'judge') return loadCaseStudyJudgeView(slug);
  return loadCaseStudyPublicView(slug);
}
