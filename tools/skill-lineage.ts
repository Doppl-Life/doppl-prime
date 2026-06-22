import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain } from './cli.ts';

export type SkillLineageStatus = 'coined' | 'working' | 'stable' | 'deprecated';
export type SkillLineageEdgeKind = 'parent' | 'progenitor';

export type SkillLineage = {
  id: string;
  aka: string | null;
  parent: string | null;
  progenitor: string | null;
  generation: number;
  mutagenClass: string | null;
  mutation: string | null;
  stratum: string;
  status: SkillLineageStatus;
  bedrock: string[];
  note: string | null;
};

export type SkillRecord = {
  name: string;
  description: string | null;
  lineage: SkillLineage;
  expressesAt: string[];
};

export type SkillLineageNode = SkillLineage & {
  label: string;
  expressesAt: string[];
};

export type SkillLineageEdge = {
  from: string;
  to: string;
  kind: SkillLineageEdgeKind;
};

export type SkillLineageGraph = {
  nodes: SkillLineageNode[];
  edges: SkillLineageEdge[];
};

export type SkillLineageMismatch = {
  id: string;
  field: 'generation' | 'status';
  frontmatter: string;
  table: string;
};

export type SkillLineageDrift = {
  ok: boolean;
  missingFromTable: string[];
  missingFromGraph: string[];
  mismatches: SkillLineageMismatch[];
};

export type UnlineagedSkill = {
  path: string;
  reason: string;
};

export type SkillLineageReport = {
  repoRoot: string;
  skillDirs: string[];
  lineageMdPath: string;
  skills: SkillRecord[];
  graph: SkillLineageGraph;
  drift: SkillLineageDrift;
  unlineaged: UnlineagedSkill[];
};

type Scalar = string | number | null | string[];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const statuses: SkillLineageStatus[] = ['coined', 'working', 'stable', 'deprecated'];
const defaultSkillDirs: string[] = [];

function defaultRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function defaultKernelRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function extractFrontmatter(markdown: string): string {
  const match = FRONTMATTER_RE.exec(markdown.replace(/^\uFEFF/, '').trimStart());
  if (match?.[1] === undefined) {
    throw new Error('no leading frontmatter block');
  }
  return match[1];
}

function stripInlineComment(input: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if ((char === '"' || char === "'") && input[i - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === '#' && quote === null && (i === 0 || /\s/.test(input[i - 1] ?? ''))) {
      return input.slice(0, i).trimEnd();
    }
  }
  return input.trimEnd();
}

function unquote(input: string): string {
  const trimmed = input.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(input: string): Scalar {
  const value = stripInlineComment(input).trim();
  if (value === '' || value === 'null') return null;
  if (value === '[]') return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => unquote(stripInlineComment(item).trim()));
  }
  if (/^-?\d+$/.test(value)) return Number(value);
  return unquote(value);
}

function topLevelValue(frontmatter: string, key: string): string | null {
  const lines = frontmatter.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const match = new RegExp(`^${key}:\\s*(.*)$`).exec(line);
    if (!match) continue;
    const value = match[1] ?? '';
    if (value !== '>' && value !== '|') return parseScalar(value)?.toString() ?? null;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? '';
      if (/^[A-Za-z0-9_-]+:/.test(next)) break;
      block.push(next.trim());
    }
    return block.join(' ').replace(/\s+/g, ' ').trim() || null;
  }
  return null;
}

function lineageFields(frontmatter: string): Map<string, Scalar> {
  const lines = frontmatter.split(/\r?\n/);
  const fields = new Map<string, Scalar>();
  const lineageIndex = lines.findIndex((line) => line.trim() === 'lineage:');
  if (lineageIndex === -1) {
    throw new Error('frontmatter has no lineage block');
  }
  for (let i = lineageIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^[A-Za-z0-9_-]+:/.test(line)) break;
    const match = /^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (key !== undefined && value !== undefined) {
      fields.set(key, parseScalar(value));
    }
  }
  return fields;
}

function requiredString(fields: Map<string, Scalar>, key: string): string {
  const value = fields.get(key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`lineage.${key} must be a string`);
  }
  return value;
}

function optionalString(fields: Map<string, Scalar>, key: string): string | null {
  const value = fields.get(key);
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`lineage.${key} must be a string or null`);
  }
  return value;
}

function requiredNumber(fields: Map<string, Scalar>, key: string): number {
  const value = fields.get(key);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`lineage.${key} must be an integer`);
  }
  return value;
}

function requiredStatus(fields: Map<string, Scalar>): SkillLineageStatus {
  const value = requiredString(fields, 'status');
  if (!statuses.includes(value as SkillLineageStatus)) {
    throw new Error(`lineage.status must be one of ${statuses.join(', ')}`);
  }
  return value as SkillLineageStatus;
}

function optionalStringArray(fields: Map<string, Scalar>, key: string): string[] {
  const value = fields.get(key);
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  throw new Error(`lineage.${key} must be an array`);
}

export function parseSkill(markdown: string, expressesAt: string[] = []): SkillRecord {
  const frontmatter = extractFrontmatter(markdown);
  const fields = lineageFields(frontmatter);
  const name = topLevelValue(frontmatter, 'name') ?? requiredString(fields, 'id');
  return {
    name,
    description: topLevelValue(frontmatter, 'description'),
    lineage: {
      id: requiredString(fields, 'id'),
      aka: optionalString(fields, 'aka'),
      parent: optionalString(fields, 'parent'),
      progenitor: optionalString(fields, 'progenitor'),
      generation: requiredNumber(fields, 'generation'),
      mutagenClass: optionalString(fields, 'mutagen_class'),
      mutation: optionalString(fields, 'mutation'),
      stratum: requiredString(fields, 'stratum'),
      status: requiredStatus(fields),
      bedrock: optionalStringArray(fields, 'bedrock'),
      note: optionalString(fields, 'note'),
    },
    expressesAt,
  };
}

export function buildSkillLineageGraph(skills: SkillRecord[]): SkillLineageGraph {
  const byId = new Map<string, SkillLineageNode>();
  for (const skill of skills) {
    const existing = byId.get(skill.lineage.id);
    if (existing) {
      for (const expression of skill.expressesAt) {
        if (!existing.expressesAt.includes(expression)) existing.expressesAt.push(expression);
      }
      continue;
    }
    byId.set(skill.lineage.id, {
      ...skill.lineage,
      label: skill.name || skill.lineage.aka || skill.lineage.id,
      expressesAt: [...skill.expressesAt],
    });
  }

  const nodes = [...byId.values()].sort(
    (a, b) => a.generation - b.generation || a.id.localeCompare(b.id),
  );
  const present = new Set(nodes.map((node) => node.id));
  const edges: SkillLineageEdge[] = [];
  for (const node of nodes) {
    if (node.parent && present.has(node.parent)) {
      edges.push({ from: node.parent, to: node.id, kind: 'parent' });
    }
    if (node.progenitor && node.progenitor !== node.parent && present.has(node.progenitor)) {
      edges.push({ from: node.progenitor, to: node.id, kind: 'progenitor' });
    }
  }
  return { nodes, edges };
}

type TableRow = {
  id: string;
  generation: string;
  status: string;
};

function parseLineageTable(markdown: string): TableRow[] {
  const rows: TableRow[] = [];
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const idCell = cells[0] ?? '';
    if (idCell === '' || idCell.toLowerCase().startsWith('lineage id')) continue;
    if (/^-{2,}$/.test(idCell.replace(/[\s:]/g, ''))) continue;
    const idMatch = /`([^`]+)`/.exec(idCell);
    if (idMatch?.[1] === undefined) continue;
    rows.push({
      id: idMatch[1],
      generation: (cells[1] ?? '').replace(/[^0-9]/g, ''),
      status: (cells[5] ?? '').toLowerCase(),
    });
  }
  return rows;
}

function graphFromLineageTable(markdown: string): SkillLineageGraph {
  const nodes: SkillLineageNode[] = parseLineageTable(markdown).map((row) => ({
    id: row.id,
    aka: null,
    parent: null,
    progenitor: null,
    generation: Number(row.generation || 0),
    mutagenClass: null,
    mutation: null,
    stratum: '',
    status: statuses.includes(row.status as SkillLineageStatus)
      ? (row.status as SkillLineageStatus)
      : 'coined',
    bedrock: [],
    note: null,
    label: row.id,
    expressesAt: [],
  }));
  return { nodes, edges: [] };
}

export function diffSkillLineage(graph: SkillLineageGraph, lineageMarkdown: string): SkillLineageDrift {
  const tableRows = parseLineageTable(lineageMarkdown);
  const tableById = new Map(tableRows.map((row) => [row.id, row]));
  const graphIds = new Set(graph.nodes.map((node) => node.id));

  const missingFromTable = graph.nodes.map((node) => node.id).filter((id) => !tableById.has(id));
  const missingFromGraph = tableRows.map((row) => row.id).filter((id) => !graphIds.has(id));
  const mismatches: SkillLineageMismatch[] = [];
  for (const node of graph.nodes) {
    const row = tableById.get(node.id);
    if (!row) continue;
    if (row.generation !== '' && row.generation !== String(node.generation)) {
      mismatches.push({
        id: node.id,
        field: 'generation',
        frontmatter: String(node.generation),
        table: row.generation,
      });
    }
    if (row.status !== '' && row.status !== node.status) {
      mismatches.push({
        id: node.id,
        field: 'status',
        frontmatter: node.status,
        table: row.status,
      });
    }
  }

  return {
    ok: missingFromTable.length === 0 && missingFromGraph.length === 0 && mismatches.length === 0,
    missingFromTable,
    missingFromGraph,
    mismatches,
  };
}

export function renderSkillLineageTable(graph: SkillLineageGraph): string {
  const header =
    '| Lineage id | Gen | Parent | Mutation (what changed) | Stratum (observed) | Status | Expresses at | Bedrock evidence |';
  const sep = '| ---------- | --- | ------ | ----------------------- | ------------------ | ------ | ------------ | ---------------- |';
  const rows = graph.nodes.map((node) => {
    const parent = node.parent ? `\`${node.parent}\`` : '—';
    const mutation = node.mutation ?? '—';
    const expressesAt = node.expressesAt.length ? node.expressesAt.join(', ') : '—';
    const bedrock = node.bedrock.length ? node.bedrock.join(', ') : '—';
    return `| \`${node.id}\` | ${node.generation} | ${parent} | ${mutation} | ${node.stratum} | ${node.status} | ${expressesAt} | ${bedrock} |`;
  });
  return [header, sep, ...rows].join('\n') + '\n';
}

function collectSkillDir(repoRoot: string, skillDir: string): {
  skills: SkillRecord[];
  unlineaged: UnlineagedSkill[];
} {
  const absoluteDir = path.join(repoRoot, skillDir);
  const skills: SkillRecord[] = [];
  const unlineaged: UnlineagedSkill[] = [];
  if (!existsSync(absoluteDir)) return { skills, unlineaged };

  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relativePath = `${skillDir}/${entry.name}/SKILL.md`;
    const absolutePath = path.join(repoRoot, relativePath);
    if (!existsSync(absolutePath)) continue;
    try {
      skills.push(parseSkill(readFileSync(absolutePath, 'utf8'), [path.dirname(relativePath)]));
    } catch (error) {
      unlineaged.push({
        path: relativePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { skills, unlineaged };
}

export function collectSkillLineage(
  repoRoot = defaultRepoRoot(),
  skillDirs = defaultSkillDirs,
  lineageMdPath = path.join(defaultKernelRoot(), 'skills/LINEAGE.md'),
): SkillLineageReport {
  const skills: SkillRecord[] = [];
  const unlineaged: UnlineagedSkill[] = [];
  for (const skillDir of skillDirs) {
    const collected = collectSkillDir(repoRoot, skillDir);
    skills.push(...collected.skills);
    unlineaged.push(...collected.unlineaged);
  }
  const lineageMarkdown = existsSync(lineageMdPath) ? readFileSync(lineageMdPath, 'utf8') : '';
  const graph = skills.length ? buildSkillLineageGraph(skills) : graphFromLineageTable(lineageMarkdown);
  return {
    repoRoot,
    skillDirs,
    lineageMdPath,
    skills,
    graph,
    drift: diffSkillLineage(graph, lineageMarkdown),
    unlineaged,
  };
}

function printReport(report: SkillLineageReport): void {
  console.log(
    [
      `skills=${report.skills.length}`,
      `nodes=${report.graph.nodes.length}`,
      `edges=${report.graph.edges.length}`,
      `unlineaged=${report.unlineaged.length}`,
      `drift=${report.drift.ok ? 'ok' : 'failed'}`,
    ].join('; '),
  );
  if (report.unlineaged.length) {
    console.log('unlineaged skills:');
    for (const skill of report.unlineaged) {
      console.log(`- ${skill.path}: ${skill.reason}`);
    }
  }
  if (!report.drift.ok) {
    console.log(JSON.stringify(report.drift, null, 2));
    process.exitCode = 1;
  }
}

runMain(import.meta.url, async () => {
  printReport(collectSkillLineage());
});
