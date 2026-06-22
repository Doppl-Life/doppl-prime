import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultKernelArgs } from './cli.ts';
import { createModelGenerationProviders, type GenerationProviders } from './generation-providers.ts';
import {
  createOpenRouterModelClient,
  createReplayModelClient,
  readModelCallRecords,
  type OpenRouterModelClientInput,
} from './model-gateway.ts';
import { runKernel } from './run-kernel.ts';
import { exportRunToVault } from './vault-export.ts';
import { writeProofBoard } from './proof-board.ts';

type KernelRunRequest = {
  runId?: string;
  generations?: number;
  budget?: number;
  outDir?: string;
  proofBoardDir?: string;
  replayModelCallsPath?: string;
  liveModel?: boolean;
  model?: string;
};

type KernelHttpRequest = {
  method: string;
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
};

type KernelHttpResponse = {
  status: number;
  body?: Record<string, unknown>;
  bodyText?: string;
  contentType?: string;
};

type KernelHttpOptions = {
  env?: Record<string, string | undefined>;
  fetch?: OpenRouterModelClientInput['fetch'];
};

function writeHttpResponse(response: ServerResponse, result: KernelHttpResponse): void {
  const contentType = result.contentType || 'application/json';
  response.writeHead(result.status, { 'Content-Type': contentType });
  response.end(result.bodyText ?? JSON.stringify(result.body));
}

function productionPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Doppl Kernel</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f8fa; color: #17191c; }
    main { max-width: 880px; margin: 0 auto; padding: 56px 24px; }
    h1 { font-size: 38px; line-height: 1.05; margin: 0 0 12px; letter-spacing: 0; }
    p { color: #515761; font-size: 16px; line-height: 1.6; margin: 0 0 28px; }
    section { border-top: 1px solid #d8dde5; padding: 22px 0; }
    h2 { font-size: 15px; margin: 0 0 12px; text-transform: uppercase; color: #69707d; letter-spacing: 0; }
    code { background: #e9edf3; border-radius: 5px; padding: 2px 6px; font-size: 14px; }
    ul { margin: 0; padding-left: 20px; color: #30343a; line-height: 1.8; }
    a { color: #0b5cad; }
    @media (prefers-color-scheme: dark) {
      body { background: #111316; color: #f1f3f5; }
      p, h2 { color: #a9b0bb; }
      section { border-color: #2d333b; }
      code { background: #252b33; }
      ul { color: #dbe0e6; }
      a { color: #8ab8ff; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Doppl Kernel</h1>
    <p>Production kernel service for running, inspecting, and exporting Doppl synthesis runs.</p>
    <section>
      <h2>Status</h2>
      <ul>
        <li><a href="/health">/health</a> returns service health.</li>
        <li><code>POST /kernel/runs</code> creates fixture, replayed, or live model runs.</li>
        <li><code>GET /kernel/runs/:runId</code> returns an exported run index.</li>
        <li><code>GET /kernel/runs/:runId/artifacts/:path</code> returns exported artifact content.</li>
      </ul>
    </section>
    <section>
      <h2>Access</h2>
      <p>Run creation and artifact inspection use the configured kernel API key when enabled. Health stays public for deployment checks.</p>
    </section>
  </main>
</body>
</html>`;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('generations must be an integer >= 1');
  }
  return value;
}

function parseBudget(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('budget must be an integer >= 0');
  }
  return value;
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  if (Array.isArray(value)) return value[0];
  return value;
}

function authorized(request: KernelHttpRequest, options: KernelHttpOptions): boolean {
  const configuredKey = options.env?.KERNEL_API_KEY ?? process.env.KERNEL_API_KEY ?? '';
  if (!configuredKey.trim()) return true;
  const bearer = headerValue(request.headers, 'authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const explicit = headerValue(request.headers, 'x-kernel-api-key');
  return bearer === configuredKey || explicit === configuredKey;
}

function parsedUrl(url: string): URL {
  return new URL(url, 'http://doppl-kernel.local');
}

function outDirFromUrl(url: URL): string {
  return url.searchParams.get('outDir') || defaultKernelArgs.outDir;
}

async function findRunDir(rootDir: string, runId: string): Promise<string | undefined> {
  const caseEntries = await readdir(rootDir, { withFileTypes: true });
  for (const caseEntry of caseEntries) {
    if (!caseEntry.isDirectory()) continue;
    const runDir = path.join(rootDir, caseEntry.name, runId);
    try {
      await readFile(path.join(runDir, 'run-index.json'), 'utf8');
      return runDir;
    } catch {
      // Keep looking through case directories.
    }
  }
  return undefined;
}

async function readRunIndex(runId: string, rootDir: string): Promise<Record<string, unknown>> {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`run not found: ${runId}`);
  return JSON.parse(await readFile(path.join(runDir, 'run-index.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function safeArtifactPath(rawArtifactPath: string): string {
  const decoded = decodeURIComponent(rawArtifactPath);
  const normalized = path.normalize(decoded);
  if (path.isAbsolute(normalized) || normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error('artifact path is invalid');
  }
  return normalized;
}

async function readRunArtifact(
  runId: string,
  rootDir: string,
  rawArtifactPath: string,
): Promise<Record<string, unknown>> {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`run not found: ${runId}`);
  const artifactPath = safeArtifactPath(rawArtifactPath);
  const absoluteArtifactPath = path.join(runDir, artifactPath);
  const relative = path.relative(runDir, absoluteArtifactPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('artifact path is invalid');
  }
  return {
    runId,
    artifactPath,
    content: await readFile(absoluteArtifactPath, 'utf8'),
  };
}

async function generationProvidersFromRequest(
  parsed: KernelRunRequest,
  options: KernelHttpOptions,
): Promise<GenerationProviders | undefined> {
  if (parsed.liveModel && parsed.replayModelCallsPath) {
    throw new Error('liveModel cannot be combined with replayModelCallsPath');
  }
  if (parsed.liveModel) {
    if (!parsed.model) throw new Error('model is required when liveModel is set');
    return createModelGenerationProviders({
      client: createOpenRouterModelClient({
        apiKey: options.env?.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '',
        fetch: options.fetch,
      }),
      model: parsed.model,
    });
  }
  if (!parsed.replayModelCallsPath) return undefined;
  if (!parsed.model) throw new Error('model is required when replayModelCallsPath is set');
  const records = await readModelCallRecords(parsed.replayModelCallsPath);
  return createModelGenerationProviders({
    client: createReplayModelClient(records),
    model: parsed.model,
  });
}

async function runFromRequestBody(
  body: string | undefined,
  options: KernelHttpOptions,
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(body || '{}') as KernelRunRequest;
  const generations = parsePositiveInteger(parsed.generations, defaultKernelArgs.generations);
  const budget = parseBudget(parsed.budget, defaultKernelArgs.evolutionBudget.maxUnits);
  const generationProviders = await generationProvidersFromRequest(parsed, options);
  const run = await runKernel({
    ...defaultKernelArgs,
    runId: parsed.runId || defaultKernelArgs.runId,
    generations,
    evolutionBudget: { maxUnits: budget },
    generationProviders,
  });
  const manifest = await exportRunToVault(run, parsed.outDir || defaultKernelArgs.outDir);
  const proofBoard = await writeProofBoard(run, parsed.proofBoardDir || defaultKernelArgs.proofBoardDir);
  return {
    runId: run.id,
    caseId: run.caseStudy.id,
    candidates: run.candidates.length,
    generations: run.evolution.length,
    budget: run.budget,
    child: run.fusion?.child.id || null,
    proofBoard,
    files: manifest.files,
  };
}

export async function handleKernelHttpRequest(
  request: KernelHttpRequest,
  options: KernelHttpOptions = {},
): Promise<KernelHttpResponse> {
  try {
    const url = parsedUrl(request.url);
    if (request.method === 'GET' && url.pathname === '/') {
      return {
        status: 200,
        contentType: 'text/html; charset=utf-8',
        bodyText: productionPage(),
      };
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return { status: 200, body: { ok: true, service: 'doppl-kernel' } };
    }
    if (request.method === 'GET' && url.pathname.startsWith('/kernel/runs/')) {
      if (!authorized(request, options)) return { status: 401, body: { error: 'unauthorized' } };
      const match = url.pathname.match(/^\/kernel\/runs\/([^/]+)(?:\/artifacts\/(.+))?$/);
      if (!match) return { status: 404, body: { error: 'not_found' } };
      const runId = decodeURIComponent(match[1]!);
      const rootDir = outDirFromUrl(url);
      if (match[2]) {
        return { status: 200, body: await readRunArtifact(runId, rootDir, match[2]) };
      }
      return { status: 200, body: await readRunIndex(runId, rootDir) };
    }
    if (request.method === 'POST' && url.pathname === '/kernel/runs') {
      if (!authorized(request, options)) return { status: 401, body: { error: 'unauthorized' } };
      return { status: 200, body: await runFromRequestBody(request.body, options) };
    }
    return { status: 404, body: { error: 'not_found' } };
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

export function createKernelHttpServer(): Server {
  return createServer((request, response) => {
    void (async () => {
      const result = await handleKernelHttpRequest({
        method: request.method || 'GET',
        url: request.url || '/',
        headers: request.headers,
        body: request.method === 'POST' ? await readBody(request) : undefined,
      });
      writeHttpResponse(response, result);
    })();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3000);
  createKernelHttpServer().listen(port, () => {
    console.log(JSON.stringify({ service: 'doppl-kernel', port }));
  });
}
