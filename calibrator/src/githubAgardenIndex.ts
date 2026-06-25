import type {
  CalibratorCase,
  CalibratorIndex,
  CalibratorProblemRecovery,
  CalibratorSolution,
} from "./types";

export interface GitHubAgardenIndexConfig {
  owner: string;
  repo: string;
  branch?: string;
  source?: "github" | "jsdelivr";
  apiBaseUrl?: string;
  rawBaseUrl?: string;
  cdnBaseUrl?: string;
  packageApiBaseUrl?: string;
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url?: string | null;
}

interface JsDelivrFlatFile {
  name: string;
  size: number;
}

interface JsDelivrFlatListing {
  files: JsDelivrFlatFile[];
}

interface AgardenScores {
  judge?: number | null;
  human?: number | null;
  n?: number;
}

interface AgardenNodeFrontmatter {
  id: string;
  stage: "case_study" | "problem_recovery" | "doppl";
  name?: string;
  kernel?: string;
  temporal?: boolean;
  next?: string | null;
  scores?: AgardenScores;
}

interface ParsedAgardenNode {
  id: string;
  stage: AgardenNodeFrontmatter["stage"];
  title: string;
  content: string;
  relativePath: string;
  parentIds: string[];
  childIds: string[];
  frontmatter: AgardenNodeFrontmatter;
}

const DEFAULT_API_BASE = "https://api.github.com";
const DEFAULT_RAW_BASE = "https://raw.githubusercontent.com";
const DEFAULT_CDN_BASE = "https://cdn.jsdelivr.net/gh";
const DEFAULT_PACKAGE_API_BASE = "https://data.jsdelivr.com/v1/package/gh";

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function contentsUrl(config: Required<GitHubAgardenIndexConfig>, path: string): string {
  const suffix = path ? `/${encodedPath(path)}` : "";
  return `${config.apiBaseUrl}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(
    config.repo,
  )}/contents${suffix}?ref=${encodeURIComponent(config.branch)}`;
}

function rawUrl(config: Required<GitHubAgardenIndexConfig>, path: string): string {
  return `${config.rawBaseUrl}/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(
    config.branch,
  )}/${encodedPath(path)}`;
}

function cdnUrl(config: Required<GitHubAgardenIndexConfig>, path: string): string {
  return `${config.cdnBaseUrl}/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}@${encodeURIComponent(
    config.branch,
  )}/${encodedPath(path)}`;
}

function packageFlatUrl(config: Required<GitHubAgardenIndexConfig>): string {
  return `${config.packageApiBaseUrl}/${encodeURIComponent(config.owner)}/${encodeURIComponent(
    config.repo,
  )}@${encodeURIComponent(config.branch)}/flat`;
}

function withCacheBust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
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

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentObjectKey = "";

  for (const rawLine of yaml.split("\n")) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const nested = rawLine.match(/^\s{2,}([^:]+):\s*(.*)$/);
    if (nested && currentObjectKey) {
      const current = result[currentObjectKey];
      if (!current || typeof current !== "object" || Array.isArray(current)) result[currentObjectKey] = {};
      (result[currentObjectKey] as Record<string, unknown>)[nested[1].trim()] = parseFrontmatterValue(nested[2]);
      continue;
    }

    const topLevel = rawLine.match(/^([^:]+):\s*(.*)$/);
    if (!topLevel) continue;
    const key = topLevel[1].trim();
    const value = topLevel[2].trim();
    currentObjectKey = value ? "" : key;
    result[key] = value ? parseFrontmatterValue(value) : {};
  }

  return result;
}

function parseAgardenFrontmatter(data: Record<string, unknown>): AgardenNodeFrontmatter | null {
  if (typeof data.id !== "string" || !data.id.trim()) return null;
  if (data.stage !== "case_study" && data.stage !== "problem_recovery" && data.stage !== "doppl") return null;
  const scores = data.scores && typeof data.scores === "object" && !Array.isArray(data.scores)
    ? (data.scores as Record<string, unknown>)
    : undefined;

  return {
    id: data.id,
    stage: data.stage,
    name: typeof data.name === "string" ? data.name : undefined,
    kernel: typeof data.kernel === "string" ? data.kernel : undefined,
    temporal: typeof data.temporal === "boolean" ? data.temporal : undefined,
    next: typeof data.next === "string" || data.next === null ? data.next : undefined,
    scores: scores
      ? {
          judge: typeof scores.judge === "number" || scores.judge === null ? scores.judge : undefined,
          human: typeof scores.human === "number" || scores.human === null ? scores.human : undefined,
          n: typeof scores.n === "number" ? scores.n : undefined,
        }
      : undefined,
  };
}

function parseAgardenMarkdown(raw: string, relativePath: string): ParsedAgardenNode | null {
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return null;
  const frontmatter = parseAgardenFrontmatter(parseSimpleYaml(frontmatterMatch[1]));
  if (!frontmatter) return null;
  const content = raw.slice(frontmatterMatch[0].length).trim();
  return {
    id: frontmatter.id,
    stage: frontmatter.stage,
    title: titleFromContent(content, frontmatter.name ?? frontmatter.id),
    content,
    relativePath,
    parentIds: parentIdsFromContent(content),
    childIds: [],
    frontmatter,
  };
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

function toProblemRecovery(caseId: string, node: ParsedAgardenNode): CalibratorProblemRecovery {
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
    human_ratings: [],
  };
}

function toSolution(caseId: string, node: ParsedAgardenNode): CalibratorSolution {
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
    human_ratings: [],
  };
}

async function parseJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : `${label} failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function fetchContentsDir(
  config: Required<GitHubAgardenIndexConfig>,
  path: string,
  fetchImpl: typeof fetch,
): Promise<GitHubContentItem[]> {
  const response = await fetchImpl(withCacheBust(contentsUrl(config, path)), {
    cache: "no-store",
    headers: { accept: "application/vnd.github+json" },
  });
  const body = await parseJson<GitHubContentItem[] | GitHubContentItem>(response, `GitHub contents read for ${path}`);
  return Array.isArray(body) ? body : [];
}

async function fetchMarkdownFile(
  config: Required<GitHubAgardenIndexConfig>,
  file: GitHubContentItem,
  fetchImpl: typeof fetch,
): Promise<ParsedAgardenNode | null> {
  const response = await fetchImpl(withCacheBust(file.download_url ?? rawUrl(config, file.path)), { cache: "no-store" });
  if (!response.ok) throw new Error(`GitHub raw read for ${file.path} failed with ${response.status}`);
  return parseAgardenMarkdown(await response.text(), file.path);
}

async function collectMarkdownFiles(
  config: Required<GitHubAgardenIndexConfig>,
  path: string,
  fetchImpl: typeof fetch,
): Promise<GitHubContentItem[]> {
  const entries = await fetchContentsDir(config, path, fetchImpl);
  const files: GitHubContentItem[] = [];
  for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    if (entry.type === "dir") {
      files.push(...(await collectMarkdownFiles(config, entry.path, fetchImpl)));
    } else if (entry.type === "file" && entry.name.endsWith(".md")) {
      files.push(entry);
    }
  }
  return files;
}

async function readRootCase(
  config: Required<GitHubAgardenIndexConfig>,
  dirname: string,
  fetchImpl: typeof fetch,
): Promise<CalibratorCase | null> {
  const casePath = `flow/${dirname}`;
  const files = await collectMarkdownFiles(config, casePath, fetchImpl);
  const caseFile = files.find((file) => file.path === `${casePath}/${dirname}.md`);
  if (!caseFile) return null;

  const nodes = (
    await Promise.all(files.map((file) => fetchMarkdownFile(config, file, fetchImpl)))
  ).filter((node): node is ParsedAgardenNode => Boolean(node));
  const caseNode = nodes.find((node) => node.relativePath === caseFile.path && node.stage === "case_study");
  if (!caseNode) return null;

  attachChildIds(nodes);
  const descendants = nodes.filter((node) => node.id !== caseNode.id);
  const problemRecoveries = descendants
    .filter((node) => node.stage === "problem_recovery")
    .map((node) => toProblemRecovery(caseNode.id, node));
  const solutions = descendants
    .filter((node) => node.stage === "doppl")
    .map((node) => toSolution(caseNode.id, node));

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

async function fetchJsDelivrMarkdownFile(
  config: Required<GitHubAgardenIndexConfig>,
  path: string,
  fetchImpl: typeof fetch,
): Promise<ParsedAgardenNode | null> {
  const response = await fetchImpl(withCacheBust(cdnUrl(config, path)), { cache: "no-store" });
  if (response.ok) return parseAgardenMarkdown(await response.text(), path);

  const fallbackResponse = await fetchImpl(withCacheBust(rawUrl(config, path)), { cache: "no-store" });
  if (!fallbackResponse.ok) {
    throw new Error(
      `aGarden markdown read for ${path} failed with jsDelivr ${response.status} and raw ${fallbackResponse.status}`,
    );
  }
  return parseAgardenMarkdown(await fallbackResponse.text(), path);
}

async function readJsDelivrAgardenIndex(
  config: Required<GitHubAgardenIndexConfig>,
  fetchImpl: typeof fetch,
): Promise<CalibratorIndex> {
  const response = await fetchImpl(withCacheBust(packageFlatUrl(config)), { cache: "no-store" });
  const listing = await parseJson<JsDelivrFlatListing>(response, "jsDelivr aGarden file listing");
  const markdownPaths = listing.files
    .map((file) => file.name.replace(/^\//, ""))
    .filter((name) => name.startsWith("flow/") && name.endsWith(".md"))
    .sort();
  const nodes = (
    await Promise.all(markdownPaths.map((path) => fetchJsDelivrMarkdownFile(config, path, fetchImpl)))
  ).filter((node): node is ParsedAgardenNode => Boolean(node));
  attachChildIds(nodes);

  const nodesByPath = new Map(nodes.map((node) => [node.relativePath, node]));
  const caseDirs = Array.from(
    new Set(
      markdownPaths
        .map((path) => path.match(/^flow\/([^/]+)\/\1\.md$/)?.[1])
        .filter((dirname): dirname is string => Boolean(dirname)),
    ),
  ).sort();

  const cases: CalibratorCase[] = caseDirs
    .map<CalibratorCase | null>((dirname) => {
      const casePath = `flow/${dirname}/${dirname}.md`;
      const caseNode = nodesByPath.get(casePath);
      if (!caseNode || caseNode.stage !== "case_study") return null;
      const descendants = nodes.filter(
        (node) => node.relativePath.startsWith(`flow/${dirname}/`) && node.id !== caseNode.id,
      );
      return {
        node_id: caseNode.id,
        case_id: caseNode.id,
        title: caseNode.title,
        source_kind: "agarden",
        visibility: "internal",
        source_paths: [caseNode.relativePath],
        body: caseNode.content,
        problem: problemBodyForCase(caseNode),
        problem_recoveries: descendants
          .filter((node) => node.stage === "problem_recovery")
          .map((node) => toProblemRecovery(caseNode.id, node)),
        solutions: descendants
          .filter((node) => node.stage === "doppl")
          .map((node) => toSolution(caseNode.id, node)),
      } satisfies CalibratorCase;
    })
    .filter((item): item is CalibratorCase => Boolean(item));

  return {
    generated_at: new Date().toISOString(),
    source_kind: "agarden",
    comparison_sets: [],
    cases,
  };
}

export async function readGitHubAgardenIndex(
  input: GitHubAgardenIndexConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CalibratorIndex> {
  const config: Required<GitHubAgardenIndexConfig> = {
    owner: input.owner,
    repo: input.repo,
    branch: input.branch ?? "main",
    source: input.source ?? "github",
    apiBaseUrl: input.apiBaseUrl ?? DEFAULT_API_BASE,
    rawBaseUrl: input.rawBaseUrl ?? DEFAULT_RAW_BASE,
    cdnBaseUrl: input.cdnBaseUrl ?? DEFAULT_CDN_BASE,
    packageApiBaseUrl: input.packageApiBaseUrl ?? DEFAULT_PACKAGE_API_BASE,
  };
  if (config.source === "jsdelivr") return readJsDelivrAgardenIndex(config, fetchImpl);

  const rootEntries = await fetchContentsDir(config, "flow", fetchImpl);
  const dirs = rootEntries
    .filter((entry) => entry.type === "dir" && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  const cases = (await Promise.all(dirs.map((dirname) => readRootCase(config, dirname, fetchImpl)))).filter(
    (item): item is CalibratorCase => Boolean(item),
  );

  return {
    generated_at: new Date().toISOString(),
    source_kind: "agarden",
    comparison_sets: [],
    cases,
  };
}
