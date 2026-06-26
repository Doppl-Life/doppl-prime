import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { outerBloomArtifacts } from '../schema';
import { runMigrations } from '../migrate';

type OuterStage = 'case_study' | 'problem_recovery' | 'doppl';

interface ParsedNode {
  readonly id: string;
  readonly stage: OuterStage;
  readonly label: string;
  readonly summary: string;
  readonly parentId: string | null;
  readonly relativePath: string;
  readonly body: string;
  readonly judgeAcceptance: number | null;
  readonly depth: number;
}

interface SeedOuterBloomDeps {
  readonly db: NodePgDatabase;
  readonly caseDir: string;
  readonly runId?: string;
}

export async function seedOuterBloom(deps: SeedOuterBloomDeps): Promise<{ runId: string; nodes: number }> {
  const caseDir = resolve(deps.caseDir);
  const markdownFiles = await findMarkdownFiles(caseDir);
  const parsed = (await Promise.all(markdownFiles.map((file) => parseNodeFile(caseDir, file))))
    .filter((node): node is ParsedNode => node !== null)
    .sort(compareParsedNodes);
  if (parsed.length === 0) throw new Error(`seed-outer-bloom: no importable markdown nodes under ${caseDir}`);

  const root = parsed.find((node) => node.stage === 'case_study') ?? parsed[0]!;
  const runId = deps.runId ?? root.id;
  const childCounts = countChildren(parsed);
  const rows = parsed.map((node, index) => ({
    id: node.id,
    runId,
    stage: node.stage,
    label: node.label,
    summary: node.summary,
    status: statusForNode(node, childCounts),
    parentId: node.parentId,
    generationIndex: node.stage === 'case_study' ? null : Math.max(0, node.depth - 1),
    score: node.judgeAcceptance,
    novelty: null,
    judgeAcceptance: node.judgeAcceptance,
    sourceId: node.id,
    agenomeId: null,
    artifactPath: node.relativePath,
    sequence: index + 1,
    body: node.body,
  }));

  await deps.db.delete(outerBloomArtifacts).where(eq(outerBloomArtifacts.runId, runId));
  await deps.db.insert(outerBloomArtifacts).values(rows);
  return { runId, nodes: rows.length };
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(dir, entry);
      const info = await stat(fullPath);
      if (info.isDirectory()) return findMarkdownFiles(fullPath);
      if (info.isFile() && fullPath.endsWith('.md')) return [fullPath];
      return [];
    }),
  );
  return files.flat();
}

async function parseNodeFile(caseDir: string, filePath: string): Promise<ParsedNode | null> {
  const raw = await readFile(filePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const id = readFrontmatter(frontmatter, 'id');
  const stage = readStage(frontmatter);
  if (id === null || stage === null) return null;

  const relativePath = relative(caseDir, filePath);
  const label = decodeHtml(readFrontmatter(frontmatter, 'name') ?? firstHeading(body) ?? titleFromId(id));
  const parentId = readParentId(body);
  const summary = decodeHtml(summaryForNode(stage, body, label));
  const judgeAcceptance = readJudgeAcceptance(frontmatter);
  return {
    id,
    stage,
    label,
    summary,
    parentId,
    relativePath,
    body,
    judgeAcceptance,
    depth: relativePath.split('/').length - 1,
  };
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', body: raw };
  return {
    frontmatter: raw.slice(3, end).trim(),
    body: raw.slice(end + 4).trim(),
  };
}

function readFrontmatter(frontmatter: string, key: string): string | null {
  const match = new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, 'm').exec(frontmatter);
  if (match === null) return null;
  const value = match[1];
  return value === undefined ? null : value.trim().replace(/^["']|["']$/g, '');
}

function readStage(frontmatter: string): OuterStage | null {
  const stage = readFrontmatter(frontmatter, 'stage');
  if (stage === 'case_study' || stage === 'problem_recovery' || stage === 'doppl') return stage;
  return null;
}

function readParentId(body: string): string | null {
  const match = /^prev_id:\s*(?:\[\[([^\]]+)\]\]|(.+))$/m.exec(body);
  if (match === null) return null;
  const rawValue = match[1] ?? match[2];
  if (rawValue === undefined) return null;
  const value = rawValue.trim();
  return value === 'null' || value === '' ? null : value;
}

function readJudgeAcceptance(frontmatter: string): number | null {
  const scores = readFrontmatter(frontmatter, 'scores');
  if (scores === null) return null;
  const match = /judge:\s*(-?\d+(?:\.\d+)?)/.exec(scores);
  if (match === null) return null;
  const judge = Number(match[1]);
  if (!Number.isFinite(judge)) return null;
  return Math.max(-5, Math.min(5, judge)) / 5;
}

function firstHeading(body: string): string | null {
  const match = /^#\s+(.+)$/m.exec(body);
  const heading = match?.[1];
  return heading === undefined ? null : heading.trim();
}

function summaryForNode(stage: OuterStage, body: string, fallback: string): string {
  if (stage === 'case_study') {
    return sectionText(body, 'Synopsis') ?? firstParagraph(body) ?? fallback;
  }
  if (stage === 'problem_recovery') {
    return sectionText(body, 'Actual problem') ?? sectionText(body, 'Candidate response') ?? firstParagraph(body) ?? fallback;
  }
  return sectionText(body, 'Claim') ?? sectionText(body, 'Candidate response') ?? firstParagraph(body) ?? fallback;
}

function sectionText(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    return match?.[2]?.trim().toLowerCase() === heading.toLowerCase();
  });
  if (start === -1) return null;

  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{2,4}\s+/.test(line)) break;
    collected.push(line);
  }
  const text = compactMarkdown(collected.join('\n'));
  return text.length > 0 ? text : null;
}

function firstParagraph(body: string): string | null {
  const withoutHeadings = body
    .replace(/^---[\s\S]*?---/m, '')
    .split(/\n{2,}/)
    .map((part) => compactMarkdown(part))
    .find((part) => part.length > 0 && !part.startsWith('#') && !part.startsWith('prev_id:'));
  return withoutHeadings ?? null;
}

function compactMarkdown(value: string): string {
  return value
    .replace(/^#+\s*/gm, '')
    .replace(/\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromId(id: string): string {
  return id
    .replace(/-[a-f0-9]{8}$/i, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function countChildren(nodes: readonly ParsedNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
  }
  return counts;
}

function statusForNode(node: ParsedNode, childCounts: ReadonlyMap<string, number>): string {
  if (node.stage === 'case_study') return 'imported';
  if (node.stage === 'problem_recovery') return 'recovered';
  return childCounts.has(node.id) ? 'active' : 'selected';
}

function compareParsedNodes(a: ParsedNode, b: ParsedNode): number {
  if (a.stage !== b.stage) return stageOrder(a.stage) - stageOrder(b.stage);
  if (a.depth !== b.depth) return a.depth - b.depth;
  return a.relativePath.localeCompare(b.relativePath);
}

function stageOrder(stage: OuterStage): number {
  if (stage === 'case_study') return 0;
  if (stage === 'problem_recovery') return 1;
  return 2;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isProcessEntry(): boolean {
  try {
    const entry = process.argv[1];
    return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isProcessEntry()) {
  const caseDir = process.argv[2];
  const runId = process.argv[3];
  const databaseUrl = process.env.DATABASE_URL;
  if (caseDir === undefined || caseDir.trim() === '') {
    console.error('usage: seed-outer-bloom <agarden-case-dir> [runId]');
    process.exit(1);
  }
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    console.error('Missing required env var: DATABASE_URL');
    process.exit(1);
  }

  await runMigrations(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  seedOuterBloom({ db, caseDir, ...(runId !== undefined ? { runId } : {}) })
    .then((result) => {
      console.log(`seed-outer-bloom: imported ${result.nodes} nodes into run ${result.runId}`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
