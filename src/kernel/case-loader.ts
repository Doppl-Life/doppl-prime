import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaseStudy } from './contracts.ts';

type SeedFixture = {
  seed?: {
    id?: string;
    title?: string;
    prompt?: string;
    thesis?: string;
    goals?: string[];
  };
};

const fixtureCaseIds: Record<string, string> = {
  'ai-power-seed.json': 'ai-overviews-zero-click-publishing',
  'fsd-seed.json': 'fsd-ownership-unwind',
  'glp1-seed.json': 'glp1-snack-demand-destruction',
  'starship-seed.json': 'starship-launch-cost-collapse',
};

function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = markdown.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.replace(/^#\s+/, '').trim() : fallback;
}

function idFromSourcePath(sourcePath: string): string {
  const basename = path.basename(sourcePath);
  const dirname = path.basename(path.dirname(sourcePath));
  if (sourcePath.includes('/agarden/flow/')) return dirname.replace(/-[0-9a-f]{8}$/i, '');
  return fixtureCaseIds[basename] ?? dirname;
}

function caseStudyFromSeedFixture(sourcePath: string, raw: string): CaseStudy {
  const fixture = JSON.parse(raw) as SeedFixture;
  const seed = fixture.seed;
  if (!seed?.prompt && !seed?.thesis) throw new Error(`seed fixture has no stated problem: ${sourcePath}`);
  const id = idFromSourcePath(sourcePath);
  const title = seed.title || id;
  const statedProblem = [seed.prompt, seed.thesis].filter(Boolean).join('\n');
  const goals = seed.goals?.length ? `\n\n## Goals\n\n${seed.goals.map((goal) => `- ${goal}`).join('\n')}` : '';
  const markdown = `# ${title}\n\n${statedProblem}${goals}`;
  return { id, title, sourcePath, markdown, statedProblem };
}

export async function loadCaseStudy(sourcePath: string): Promise<CaseStudy> {
  const raw = await readFile(sourcePath, 'utf8');
  if (path.extname(sourcePath) === '.json') return caseStudyFromSeedFixture(sourcePath, raw);
  const markdown = raw;
  const id = idFromSourcePath(sourcePath);
  const title = titleFromMarkdown(markdown, id);
  const statedProblem = markdown
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'))
    .slice(0, 8)
    .join('\n');
  if (!statedProblem) throw new Error(`case study has no stated problem: ${sourcePath}`);
  return { id, title, sourcePath, markdown, statedProblem };
}
