import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultKernelArgs } from './cli.ts';
import type { OpenRouterModelClientInput } from './model-gateway.ts';
import type { FitnessLensId, FitnessScheduleMode } from './scoring.ts';

export type KernelRunRequest = {
  runId?: string;
  casePath?: string;
  fixturePath?: string;
  knowledgePacketPath?: string;
  generations?: number;
  budget?: number;
  outDir?: string;
  proofBoardDir?: string;
  replayModelCallsPath?: string;
  liveModel?: boolean;
  model?: string;
  replayRunId?: string;
  fitnessLens?: string;
  fitnessSchedule?: string;
  async?: boolean;
};

export type KernelHttpRequest = {
  method: string;
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
};

export type KernelHttpResponse = {
  status: number;
  body?: Record<string, unknown>;
  bodyText?: string;
  contentType?: string;
};

export type KernelHttpOptions = {
  env?: Record<string, string | undefined>;
  fetch?: OpenRouterModelClientInput['fetch'];
};

export class KernelHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const DASHBOARD_CASE_STUDIES = [
  {
    id: 'fsd-ownership-unwind',
    title: 'FSD Ownership Unwind',
    path: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    mode: 'fixture',
  },
  {
    id: 'glp1-snack-demand-destruction',
    title: 'GLP-1 Snack Demand',
    path: 'case-studies/glp1-snack-demand-destruction/problem-statement.md',
    fixturePath: 'kernel/fixtures/glp1-snack-demand-destruction/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/glp1-snack-demand-destruction/knowledge-packet.json',
    mode: 'fixture',
  },
  {
    id: 'ai-overviews-zero-click-publishing',
    title: 'AI Overviews Publishing',
    path: 'case-studies/ai-overviews-zero-click-publishing/problem-statement.md',
    fixturePath: 'kernel/fixtures/ai-overviews-zero-click-publishing/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/ai-overviews-zero-click-publishing/knowledge-packet.json',
    mode: 'fixture',
  },
  {
    id: 'starship-launch-cost-collapse',
    title: 'Starship Launch Cost',
    path: 'case-studies/starship-launch-cost-collapse/problem-statement.md',
    fixturePath: 'kernel/fixtures/starship-launch-cost-collapse/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/starship-launch-cost-collapse/knowledge-packet.json',
    mode: 'fixture',
  },
] as const;

export function writeHttpResponse(response: ServerResponse, result: KernelHttpResponse): void {
  const contentType = result.contentType || 'application/json';
  response.writeHead(result.status, { 'Content-Type': contentType });
  response.end(result.bodyText ?? JSON.stringify(result.body));
}

export function dashboardFallbackPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Doppl React Flow dashboard for inspecting kernel evolution runs.">
    <title>Doppl React Flow dashboard</title>
  </head>
  <body>
    <div id="root">Doppl React Flow dashboard</div>
  </body>
</html>`;
}

export async function dashboardIndexPage(): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), 'kernel/web/dist/index.html'), 'utf8');
  } catch {
    return dashboardFallbackPage();
  }
}

export function dashboardAssetPath(urlPath: string): string | undefined {
  const relativePath = decodeURIComponent(urlPath.replace(/^\/dashboard\//, ''));
  const normalized = path.posix.normalize(relativePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return undefined;
  return path.join(process.cwd(), 'kernel/web/dist', normalized);
}

export function contentTypeForAsset(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

export async function dashboardAssetResponse(urlPath: string): Promise<KernelHttpResponse> {
  const filePath = dashboardAssetPath(urlPath);
  if (!filePath) return { status: 404, body: { error: 'not_found' } };
  try {
    return {
      status: 200,
      contentType: contentTypeForAsset(filePath),
      bodyText: await readFile(filePath, 'utf8'),
    };
  } catch {
    return { status: 404, body: { error: 'not_found' } };
  }
}

export function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      resolve(body);
    });
    request.on('error', reject);
  });
}

export function parsePositiveInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('generations must be an integer >= 1');
  }
  return value;
}

export function parseBudget(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('budget must be an integer >= 0');
  }
  return value;
}

export function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function authorized(request: KernelHttpRequest, options: KernelHttpOptions): boolean {
  const configuredKey = options.env?.KERNEL_API_KEY ?? process.env.KERNEL_API_KEY ?? '';
  if (!configuredKey.trim()) return true;
  const bearer = headerValue(request.headers, 'authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const explicit = headerValue(request.headers, 'x-kernel-api-key');
  return bearer === configuredKey || explicit === configuredKey;
}

export function parsedUrl(url: string): URL {
  return new URL(url, 'http://doppl-kernel.local');
}

export function outDirFromUrl(url: URL): string {
  return url.searchParams.get('outDir') || defaultKernelArgs.outDir;
}

export function routeParam(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (value === undefined) throw new KernelHttpError(404, 'route parameter missing');
  return value;
}

export function runModeFor(
  replayRunId: string | undefined,
  liveModel: boolean | undefined,
): 'replay' | 'live' | 'fixture' {
  if (replayRunId) return 'replay';
  if (liveModel) return 'live';
  return 'fixture';
}

export function parseFitnessLens(value: unknown): FitnessLensId {
  if (value === 'feasibility' || value === 'novelty' || value === 'none') return value;
  if (value === undefined || value === null || value === '') return 'none';
  throw new Error('fitnessLens must be one of: none, feasibility, novelty');
}

export function parseFitnessSchedule(value: unknown): FitnessScheduleMode {
  if (value === 'auto' || value === 'diverge' || value === 'balanced' || value === 'converge') {
    return value;
  }
  if (value === undefined || value === null || value === '') return 'auto';
  throw new Error('fitnessSchedule must be one of: auto, diverge, balanced, converge');
}

export function envValue(options: KernelHttpOptions, name: string): string {
  return options.env?.[name] ?? process.env[name] ?? '';
}

export function envFlagEnabled(options: KernelHttpOptions, name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(envValue(options, name).trim().toLowerCase());
}

export function liveDemoAuthorized(request: KernelHttpRequest, options: KernelHttpOptions): boolean {
  if (!envFlagEnabled(options, 'DOPPL_REQUIRE_LIVE_DEMO_TOKEN')) return true;
  const configuredToken = envValue(options, 'DOPPL_LIVE_DEMO_TOKEN').trim();
  if (!configuredToken) return false;
  const suppliedToken =
    headerValue(request.headers, 'x-live-demo-token') ||
    headerValue(request.headers, 'x-doppl-live-demo-token');
  return suppliedToken === configuredToken;
}

export function casePathFromRequest(value: unknown): string {
  if (value === undefined) return defaultKernelArgs.casePath;
  if (typeof value !== 'string') throw new Error('casePath must be a string');
  const normalized = path.posix.normalize(value);
  if (
    path.isAbsolute(value) ||
    normalized.startsWith('..') ||
    normalized.includes('/../') ||
    !normalized.startsWith('case-studies/') ||
    !normalized.endsWith('/problem-statement.md')
  ) {
    throw new Error('casePath must point at a case-studies problem-statement.md file');
  }
  return normalized;
}

export function approvedDashboardCase(casePath: string): (typeof DASHBOARD_CASE_STUDIES)[number] {
  const match = DASHBOARD_CASE_STUDIES.find((caseStudy) => caseStudy.path === casePath);
  if (!match) throw new Error('dashboard case is not approved');
  return match;
}
