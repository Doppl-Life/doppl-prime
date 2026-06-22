import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaseStudy } from './contracts.ts';

function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = markdown.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.replace(/^#\s+/, '').trim() : fallback;
}

export async function loadCaseStudy(sourcePath: string): Promise<CaseStudy> {
  const markdown = await readFile(sourcePath, 'utf8');
  const id = path.basename(path.dirname(sourcePath));
  const title = titleFromMarkdown(markdown, id);
  const statedProblem = markdown
    .split('\n')
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'))
    .slice(0, 8)
    .join('\n');
  if (!statedProblem) throw new Error(`case study has no stated problem: ${sourcePath}`);
  return { id, title, sourcePath, markdown, statedProblem };
}
