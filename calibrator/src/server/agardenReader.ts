import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type {
  CalibratorCase,
  CalibratorIndex,
  CalibratorProblemRecovery,
  CalibratorRating,
  CalibratorSolution,
} from "../types";
import { AgardenNodeFrontmatter } from "./agardenSchemas";

const AgardenLedgerRating = z.object({
  rater_id: z.string().min(1),
  score: z.number().int().min(-5).max(5),
  rate_date: z.string().min(1),
});

const AgardenLedgerEntry = z.object({
  node_id: z.string().min(1),
  ratings: z.array(AgardenLedgerRating).default([]),
});

const AgardenRatingsLedger = z.array(AgardenLedgerEntry);
type AgardenLedgerEntry = z.infer<typeof AgardenLedgerEntry>;

interface ParsedAgardenNode {
  id: string;
  stage: "case_study" | "problem_recovery" | "doppl";
  title: string;
  content: string;
  sourcePath: string;
  relativePath: string;
  parentIds: string[];
  childIds: string[];
  frontmatter: AgardenNodeFrontmatter;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch (err) {
    const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return false;
    throw err;
  }
}

function decodeBasicEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function titleFromContent(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return decodeBasicEntities(heading || fallback);
}

function parentIdsFromContent(content: string): string[] {
  const wikilinkPrev = content.match(/^prev:\s*(.+)$/m)?.[1] ?? "";
  const wikilinkIds = Array.from(wikilinkPrev.matchAll(/\[\[([^\]]+)\]\]/g)).map((match) => match[1]);
  const prevId = content.match(/^prev_id:\s*(.+)$/m)?.[1]?.trim().replace(/^\[\[|\]\]$/g, "");
  return [...wikilinkIds, ...(prevId && prevId !== "null" ? [prevId] : [])].filter(Boolean);
}

async function readAgardenMarkdown(agardenRoot: string, path: string): Promise<ParsedAgardenNode | null> {
  const raw = await readFile(path, "utf8");
  const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
  const result = AgardenNodeFrontmatter.safeParse(parsed.data);
  if (!result.success) return null;

  return {
    id: result.data.id,
    stage: result.data.stage,
    title: titleFromContent(parsed.content, result.data.name ?? result.data.id),
    content: parsed.content.trim(),
    sourcePath: path,
    relativePath: relative(agardenRoot, path),
    parentIds: parentIdsFromContent(parsed.content),
    childIds: [],
    frontmatter: result.data,
  };
}

async function readRatingsLedger(agardenRoot: string): Promise<Map<string, AgardenLedgerEntry>> {
  try {
    const raw = await readFile(join(agardenRoot, "ratings-ledger.json"), "utf8");
    const entries = AgardenRatingsLedger.parse(JSON.parse(raw));
    return new Map(entries.map((entry) => [entry.node_id, entry]));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return new Map();
    throw error;
  }
}

async function collectMarkdownFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const next = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(next)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(next);
    }
  }
  return files.sort();
}

function attachChildIds(nodes: ParsedAgardenNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const parentId of node.parentIds) {
      const parent = byId.get(parentId);
      if (parent && !parent.childIds.includes(node.id)) parent.childIds.push(node.id);
    }
  }
  for (const node of nodes) {
    node.childIds.sort();
  }
}

function problemBodyForCase(caseNode: ParsedAgardenNode): { body: string; source: string } {
  const contextMatch = caseNode.content.match(/## Context\s+([\s\S]*?)(?=\n## |$)/);
  return {
    body: (contextMatch?.[1]?.trim() || caseNode.content).trim(),
    source: "agarden",
  };
}

function ratingsForNode(
  caseId: string,
  node: ParsedAgardenNode,
  target: "problem_recovery" | "solution",
  ledger: Map<string, AgardenLedgerEntry>,
): CalibratorRating[] {
  const entry = ledger.get(node.id);
  if (!entry) return [];
  return entry.ratings.map((rating) => ({
    rating_id: `rating_${node.id}_${rating.rater_id.replace(/[^a-z0-9_-]+/gi, "_").replace(/_+$/g, "")}`,
    rating_target: target,
    case_id: caseId,
    problem_recovery_id: target === "problem_recovery" ? node.id : undefined,
    solution_id: target === "solution" ? node.id : undefined,
    score: rating.score,
    reviewer_email: rating.rater_id,
    submitted_at: rating.rate_date,
    app_version: "calibrator-v0",
    body: "",
  }));
}

function toProblemRecovery(
  caseId: string,
  node: ParsedAgardenNode,
  ledger: Map<string, AgardenLedgerEntry>,
): CalibratorProblemRecovery {
  return {
    node_id: node.id,
    case_id: caseId,
    problem_recovery_id: node.id,
    title: node.title,
    parent_ids: node.parentIds,
    child_ids: node.childIds,
    source_path: node.relativePath,
    ledger_path: "ratings-ledger.json",
    stage: "problem_recovery",
    temporal: node.frontmatter.temporal,
    next: node.frontmatter.next === "doppl" || node.frontmatter.next === "terminal" ? node.frontmatter.next : undefined,
    scores: node.frontmatter.scores,
    source_type: node.frontmatter.kernel ? "kernel" : "unknown",
    source_status: "imported",
    kernel: node.frontmatter.kernel,
    body: node.content,
    human_ratings: ratingsForNode(caseId, node, "problem_recovery", ledger),
  };
}

function toSolution(
  caseId: string,
  node: ParsedAgardenNode,
  ledger: Map<string, AgardenLedgerEntry>,
): CalibratorSolution {
  return {
    node_id: node.id,
    case_id: caseId,
    solution_id: node.id,
    title: node.title,
    parent_ids: node.parentIds,
    child_ids: node.childIds,
    source_path: node.relativePath,
    ledger_path: "ratings-ledger.json",
    stage: "doppl",
    temporal: node.frontmatter.temporal,
    next: node.frontmatter.next === "terminal" ? "terminal" : null,
    scores: node.frontmatter.scores,
    source_type: node.frontmatter.kernel ? "kernel" : "unknown",
    source_status: "imported",
    kernel: node.frontmatter.kernel,
    body: node.content,
    human_ratings: ratingsForNode(caseId, node, "solution", ledger),
  };
}

async function readRootCase(
  agardenRoot: string,
  dirname: string,
  ledger: Map<string, AgardenLedgerEntry>,
): Promise<CalibratorCase | null> {
  const casePath = join(agardenRoot, dirname);
  const caseMarkdownPath = join(casePath, `${dirname}.md`);
  if (!(await pathExists(caseMarkdownPath))) return null;

  const caseNode = await readAgardenMarkdown(agardenRoot, caseMarkdownPath);
  if (!caseNode || caseNode.stage !== "case_study") return null;

  const descendantPaths = (await collectMarkdownFiles(casePath)).filter((path) => path !== caseMarkdownPath);
  const descendants = (
    await Promise.all(descendantPaths.map((path) => readAgardenMarkdown(agardenRoot, path)))
  ).filter((node): node is ParsedAgardenNode => Boolean(node));
  attachChildIds([caseNode, ...descendants]);

  const problemRecoveries = descendants
    .filter((node) => node.stage === "problem_recovery")
    .map((node) => toProblemRecovery(caseNode.id, node, ledger));
  const solutions = descendants
    .filter((node) => node.stage === "doppl")
    .map((node) => toSolution(caseNode.id, node, ledger));

  return {
    node_id: caseNode.id,
    case_id: caseNode.id,
    title: caseNode.title,
    source_kind: "agarden",
    visibility: "internal",
    source_paths: [caseNode.relativePath],
    body: caseNode.content,
    problem: problemBodyForCase(caseNode),
    problem_recoveries: problemRecoveries,
    solutions,
  };
}

export async function readAgardenIndex(agardenRoot: string): Promise<CalibratorIndex> {
  const graphRoot = resolve(agardenRoot, "flow");
  const ledger = await readRatingsLedger(agardenRoot);
  const entries = await readdir(graphRoot, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();

  const cases = (await Promise.all(dirs.map((dirname) => readRootCase(graphRoot, dirname, ledger)))).filter(
    (item): item is CalibratorCase => Boolean(item),
  );

  return {
    generated_at: process.env.DOPPL_CALIBRATOR_GENERATED_AT || new Date().toISOString(),
    source_kind: "agarden",
    comparison_sets: [],
    cases,
  };
}
