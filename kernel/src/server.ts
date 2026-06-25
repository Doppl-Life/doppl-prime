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
import {
  appendRunEventSync,
  createMemoryEventRecorder,
  readRunEvents,
  replayRunProjection,
  type EventRecorderListener,
} from './event-store.ts';
import type { FitnessLensId, FitnessScheduleMode } from './scoring.ts';

type KernelRunRequest = {
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

class KernelHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DASHBOARD_CASE_STUDIES = [
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

function writeHttpResponse(response: ServerResponse, result: KernelHttpResponse): void {
  const contentType = result.contentType || 'application/json';
  response.writeHead(result.status, { 'Content-Type': contentType });
  response.end(result.bodyText ?? JSON.stringify(result.body));
}

function dashboardFallbackPage(): string {
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

async function dashboardIndexPage(): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), 'kernel/web/dist/index.html'), 'utf8');
  } catch {
    return dashboardFallbackPage();
  }
}

function dashboardAssetPath(urlPath: string): string | undefined {
  const relativePath = decodeURIComponent(urlPath.replace(/^\/dashboard\//, ''));
  const normalized = path.posix.normalize(relativePath);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return undefined;
  return path.join(process.cwd(), 'kernel/web/dist', normalized);
}

function contentTypeForAsset(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

async function dashboardAssetResponse(urlPath: string): Promise<KernelHttpResponse> {
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
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('generations must be an integer >= 1');
  }
  return value;
}

function parseBudget(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
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

function routeParam(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (value === undefined) throw new KernelHttpError(404, 'route parameter missing');
  return value;
}

function parseFitnessLens(value: unknown): FitnessLensId {
  if (value === 'feasibility' || value === 'novelty' || value === 'none') return value;
  if (value === undefined || value === null || value === '') return 'none';
  throw new Error('fitnessLens must be one of: none, feasibility, novelty');
}

function parseFitnessSchedule(value: unknown): FitnessScheduleMode {
  if (value === 'auto' || value === 'diverge' || value === 'balanced' || value === 'converge') {
    return value;
  }
  if (value === undefined || value === null || value === '') return 'auto';
  throw new Error('fitnessSchedule must be one of: auto, diverge, balanced, converge');
}

function envValue(options: KernelHttpOptions, name: string): string {
  return options.env?.[name] ?? process.env[name] ?? '';
}

function envFlagEnabled(options: KernelHttpOptions, name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(envValue(options, name).trim().toLowerCase());
}

function liveDemoAuthorized(request: KernelHttpRequest, options: KernelHttpOptions): boolean {
  if (!envFlagEnabled(options, 'DOPPL_REQUIRE_LIVE_DEMO_TOKEN')) return true;
  const configuredToken = envValue(options, 'DOPPL_LIVE_DEMO_TOKEN').trim();
  if (!configuredToken) return false;
  const suppliedToken =
    headerValue(request.headers, 'x-live-demo-token') ||
    headerValue(request.headers, 'x-doppl-live-demo-token');
  return suppliedToken === configuredToken;
}

function casePathFromRequest(value: unknown): string {
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

function approvedDashboardCase(casePath: string): (typeof DASHBOARD_CASE_STUDIES)[number] {
  const match = DASHBOARD_CASE_STUDIES.find((caseStudy) => caseStudy.path === casePath);
  if (!match) throw new Error('dashboard case is not approved');
  return match;
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
      try {
        await readFile(path.join(runDir, 'events.jsonl'), 'utf8');
        return runDir;
      } catch {
        // Keep looking through case directories.
      }
    }
  }
  return undefined;
}

async function readRunIndex(runId: string, rootDir: string): Promise<Record<string, unknown>> {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`run not found: ${runId}`);
  try {
    return JSON.parse(await readFile(path.join(runDir, 'run-index.json'), 'utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    const events = await readRunEvents(path.join(runDir, 'events.jsonl'));
    const projection = replayRunProjection(events);
    return {
      artifact_type: 'partial_run_index',
      runId,
      caseId: projection.caseId ?? null,
      status: projection.completed ? 'completed' : 'running',
      dashboardEvents: events,
      eventCount: projection.eventCount,
      sequenceThrough: projection.sequenceThrough,
    };
  }
}

async function replayModelCallsPathForRun(runId: string, rootDir: string): Promise<string> {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`replay source run not found: ${runId}`);
  const index = await readRunIndex(runId, rootDir);
  const trace = index.trace as { modelCallsPath?: unknown } | undefined;
  if (!trace || typeof trace.modelCallsPath !== 'string') {
    throw new Error(`replay source run has no model-call log: ${runId}`);
  }
  return path.join(runDir, safeArtifactPath(trace.modelCallsPath));
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

async function readDashboardEvents(runId: string, rootDir: string): Promise<Array<Record<string, unknown>>> {
  try {
    return await readRunEventLog(runId, rootDir);
  } catch {
    return [];
  }
}

async function readRunEventLog(runId: string, rootDir: string) {
  const runDir = await findRunDir(rootDir, runId);
  if (!runDir) throw new Error(`run not found: ${runId}`);
  return readRunEvents(path.join(runDir, 'events.jsonl'));
}

function eventSequence(event: { sequence?: number; index?: number }): number {
  return event.sequence ?? event.index ?? -1;
}

function eventsAfter(
  events: Array<{ sequence?: number; index?: number }>,
  afterSequence: number,
) {
  return events.filter((event) => eventSequence(event) > afterSequence);
}

function lastEventIdFromRequest(request: KernelHttpRequest, url: URL): number {
  const rawQueryAfter = url.searchParams.get('after') ?? url.searchParams.get('afterSequence');
  if (rawQueryAfter !== null) {
    const queryAfter = Number(rawQueryAfter);
    if (Number.isFinite(queryAfter)) return queryAfter;
  }
  const rawHeaderAfter = headerValue(request.headers, 'last-event-id');
  if (rawHeaderAfter !== undefined) {
    const headerAfter = Number(rawHeaderAfter);
    if (Number.isFinite(headerAfter)) return headerAfter;
  }
  return -1;
}

async function readRunEventsResponse(
  request: KernelHttpRequest,
  url: URL,
  runId: string,
  rootDir: string,
): Promise<KernelHttpResponse> {
  const events = await readRunEventLog(runId, rootDir);
  const filteredEvents = eventsAfter(events, lastEventIdFromRequest(request, url));
  return {
    status: 200,
    body: {
      runId,
      events: filteredEvents,
      sequenceThrough: events.length ? Math.max(...events.map(eventSequence)) : -1,
    },
  };
}

function sseLine(value: string): string {
  return value.replace(/\r?\n/g, '\ndata: ');
}

async function readRunStreamResponse(
  request: KernelHttpRequest,
  url: URL,
  runId: string,
  rootDir: string,
): Promise<KernelHttpResponse> {
  const events = await readRunEventLog(runId, rootDir);
  const filteredEvents = eventsAfter(events, lastEventIdFromRequest(request, url));
  const bodyText = filteredEvents
    .map((event) => {
      const sequence = eventSequence(event);
      return `id: ${sequence}\ndata: ${sseLine(JSON.stringify(event))}\n\n`;
    })
    .join('');
  return {
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    bodyText: bodyText || ': no events after requested sequence\n\n',
  };
}

async function readRunHealthResponse(runId: string, rootDir: string): Promise<KernelHttpResponse> {
  const events = await readRunEventLog(runId, rootDir);
  const projection = replayRunProjection(events);
  const generationEvents = events.filter((event) => event.type === 'generation.started');
  const lastGeneration = generationEvents
    .map((event) => Number(event.payload.generation))
    .filter(Number.isFinite)
    .at(-1);
  const terminalEvent = events.find(
    (event) => event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.stopped',
  );
  return {
    status: 200,
    body: {
      runId,
      status: terminalEvent ? String(terminalEvent.type).replace('run.', '') : 'running',
      currentGeneration: lastGeneration ?? null,
      candidatesInFlight: 0,
      lastEventAt: projection.lastEventAt ?? null,
      eventCount: projection.eventCount,
      sequenceThrough: projection.sequenceThrough,
      capsConsumed: {
        candidates: projection.candidateIds.length,
      },
    },
  };
}

async function listDashboardRuns(rootDir: string): Promise<Array<Record<string, unknown>>> {
  const runs: Array<Record<string, unknown>> = [];
  const caseEntries = await readdir(rootDir, { withFileTypes: true }).catch(() => null);
  if (!caseEntries) return [];
  for (const caseEntry of caseEntries) {
    if (!caseEntry.isDirectory()) continue;
    const caseDir = path.join(rootDir, caseEntry.name);
    const runEntries = await readdir(caseDir, { withFileTypes: true }).catch(() => null);
    if (!runEntries) continue;
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory()) continue;
      try {
        const index = JSON.parse(
          await readFile(path.join(caseDir, runEntry.name, 'run-index.json'), 'utf8'),
        ) as Record<string, unknown>;
        const child = index.child as { id?: string } | undefined;
        const trace = index.trace as { modelCallsPath?: unknown } | undefined;
        runs.push({
          runId: index.runId,
          caseId: index.caseId,
          caseTitle: index.caseTitle,
          child: child?.id ?? null,
          candidates: Array.isArray(index.candidates) ? index.candidates.length : 0,
          generations: Array.isArray(index.evolution) ? index.evolution.length : 0,
          hasModelCalls: Boolean(trace && typeof trace.modelCallsPath === 'string'),
        });
      } catch {
        // Ignore partial run directories.
      }
    }
  }
  return runs.sort((left, right) => String(right.runId).localeCompare(String(left.runId))).slice(0, 12);
}

async function generationProvidersFromRequest(
  parsed: KernelRunRequest,
  options: KernelHttpOptions,
): Promise<GenerationProviders | undefined> {
  if (parsed.liveModel && parsed.replayModelCallsPath) {
    throw new Error('liveModel cannot be combined with replay model calls');
  }
  if (parsed.liveModel) {
    if (!parsed.model) throw new Error('model is required when liveModel is set');
    return createModelGenerationProviders({
      client: createOpenRouterModelClient({
        apiKey: envValue(options, 'OPENROUTER_API_KEY'),
        fetch: options.fetch,
      }),
      model: parsed.model,
    });
  }
  if (!parsed.replayModelCallsPath) return undefined;
  const records = await readModelCallRecords(parsed.replayModelCallsPath);
  const model = parsed.model || records[0]?.model;
  if (!model) throw new Error('model is required when replayModelCallsPath is set');
  return createModelGenerationProviders({
    client: createReplayModelClient(records, {
      sourceRunId: parsed.replayRunId,
      targetRunId: parsed.runId,
    }),
    model,
  });
}

async function runFromRequestBody(
  body: string | undefined,
  options: KernelHttpOptions,
  runtime: { onEvent?: EventRecorderListener } = {},
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(body || '{}') as KernelRunRequest;
  const generations = parsePositiveInteger(parsed.generations, defaultKernelArgs.generations);
  const budget = parseBudget(parsed.budget, defaultKernelArgs.evolutionBudget.maxUnits);
  const casePath = casePathFromRequest(parsed.casePath);
  const fitnessLens = parseFitnessLens(parsed.fitnessLens);
  const fitnessSchedule = parseFitnessSchedule(parsed.fitnessSchedule);
  if (parsed.replayModelCallsPath && parsed.replayRunId) {
    throw new Error('replayModelCallsPath cannot be combined with replayRunId');
  }
  const replayModelCallsPath = parsed.replayRunId
    ? await replayModelCallsPathForRun(parsed.replayRunId, parsed.outDir || defaultKernelArgs.outDir)
    : parsed.replayModelCallsPath;
  const generationProviders = await generationProvidersFromRequest(
    { ...parsed, replayModelCallsPath },
    options,
  );
  const run = await runKernel({
    ...defaultKernelArgs,
    runId: parsed.runId || defaultKernelArgs.runId,
    casePath,
    fixturePath: parsed.fixturePath || defaultKernelArgs.fixturePath,
    knowledgePacketPath: parsed.knowledgePacketPath || defaultKernelArgs.knowledgePacketPath,
    generations,
    evolutionBudget: { maxUnits: budget },
    fitnessLens,
    fitnessSchedule,
    generationProviders,
    onEvent: runtime.onEvent,
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

function appendFailureEvent(eventLogPath: string, runId: string, error: unknown): void {
  const recorder = createMemoryEventRecorder([], runId);
  const event = recorder.push(
    'run.failed',
    {
      runId,
      error: error instanceof Error ? error.message : String(error),
    },
    { actor: 'runtime' },
  );
  appendRunEventSync(eventLogPath, event);
}

function startAsyncRun(
  body: string,
  options: KernelHttpOptions,
  eventLogPath: string,
): void {
  void runFromRequestBody(body, options, {
    onEvent(event) {
      appendRunEventSync(eventLogPath, event);
    },
  }).catch((error) => {
    const parsedBody = JSON.parse(body) as { runId?: unknown };
    const failedRunId =
      typeof parsedBody.runId === 'string' ? parsedBody.runId : defaultKernelArgs.runId;
    appendFailureEvent(eventLogPath, failedRunId, error);
  });
}

async function runDashboardCaseFromRequestBody(
  request: KernelHttpRequest,
  body: string | undefined,
  options: KernelHttpOptions,
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(body || '{}') as KernelRunRequest;
  const casePath = casePathFromRequest(parsed.casePath);
  const dashboardCase = approvedDashboardCase(casePath);
  const outDir = parsed.outDir || defaultKernelArgs.outDir;
  const liveModel = Boolean(parsed.liveModel);
  const replayRunId = typeof parsed.replayRunId === 'string' && parsed.replayRunId.trim()
    ? parsed.replayRunId.trim()
    : undefined;
  if (liveModel && !envFlagEnabled(options, 'DOPPL_ENABLE_LIVE_LLM')) {
    throw new KernelHttpError(403, 'live dashboard generation is disabled');
  }
  if (liveModel && !liveDemoAuthorized(request, options)) {
    throw new KernelHttpError(403, 'live demo token is required');
  }
  const requestedGenerations = parsePositiveInteger(parsed.generations, liveModel ? 1 : 4);
  const generations = liveModel ? Math.min(requestedGenerations, 1) : Math.min(requestedGenerations, 4);
  const runId = parsed.runId || `${dashboardCase.id}_${Date.now()}`;
  const runRequestBody = JSON.stringify({
      runId,
      casePath,
      fixturePath: dashboardCase.fixturePath,
      knowledgePacketPath: dashboardCase.knowledgePacketPath,
      generations,
      budget: generations,
      liveModel,
      replayRunId,
      model: liveModel ? parsed.model || 'openai/gpt-4.1-mini' : undefined,
      fitnessLens: parseFitnessLens(parsed.fitnessLens),
      fitnessSchedule: parseFitnessSchedule(parsed.fitnessSchedule),
      outDir,
      proofBoardDir: parsed.proofBoardDir || defaultKernelArgs.proofBoardDir,
    });
  if (parsed.async) {
    const eventLogPath = path.join(outDir, dashboardCase.id, runId, 'events.jsonl');
    startAsyncRun(runRequestBody, options, eventLogPath);
    return {
      runId,
      caseId: dashboardCase.id,
      caseTitle: dashboardCase.title,
      runMode: replayRunId ? 'replay' : liveModel ? 'live' : 'fixture',
      status: 'running',
      async: true,
      generations: 0,
      candidateCount: 0,
      modelCalls: null,
      replaySourceRunId: replayRunId ?? null,
      dashboardEvents: await readDashboardEvents(runId, outDir),
    };
  }
  const summary = await runFromRequestBody(runRequestBody, options);
  const completedRunId = String(summary.runId);
  const runIndex = await readRunIndex(completedRunId, outDir);
  const problemRecovery = runIndex.problemRecovery as { path?: string } | undefined;
  const artifact = problemRecovery?.path
    ? await readRunArtifact(completedRunId, outDir, problemRecovery.path)
    : undefined;
  return {
    ...runIndex,
    runMode: replayRunId ? 'replay' : liveModel ? 'live' : 'fixture',
    generations: Array.isArray(runIndex.evolution) ? runIndex.evolution.length : 0,
    candidateCount: Array.isArray(runIndex.candidates) ? runIndex.candidates.length : 0,
    modelCalls: runIndex.trace &&
      typeof runIndex.trace === 'object' &&
      'modelCallsPath' in runIndex.trace &&
      typeof runIndex.trace.modelCallsPath === 'string'
      ? { path: runIndex.trace.modelCallsPath }
      : null,
    replaySourceRunId: replayRunId ?? null,
    dashboardArtifact: artifact?.content,
    dashboardEvents: await readDashboardEvents(runId, outDir),
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
        bodyText: await dashboardIndexPage(),
      };
    }
    if (request.method === 'GET' && url.pathname.startsWith('/dashboard/')) {
      return await dashboardAssetResponse(url.pathname);
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return { status: 200, body: { ok: true, service: 'doppl-kernel' } };
    }
    if (request.method === 'GET' && url.pathname === '/kernel/dashboard/runs') {
      return { status: 200, body: { runs: await listDashboardRuns(outDirFromUrl(url)) } };
    }
    if (request.method === 'POST' && url.pathname === '/kernel/dashboard/runs') {
      return { status: 200, body: await runDashboardCaseFromRequestBody(request, request.body, options) };
    }
    const dashboardEventRoute = url.pathname.match(
      /^\/kernel\/dashboard\/runs\/([^/]+)\/(events|stream|health)$/,
    );
    if (request.method === 'GET' && dashboardEventRoute) {
      const runId = decodeURIComponent(routeParam(dashboardEventRoute, 1));
      const rootDir = outDirFromUrl(url);
      if (dashboardEventRoute[2] === 'events') {
        return await readRunEventsResponse(request, url, runId, rootDir);
      }
      if (dashboardEventRoute[2] === 'stream') {
        return await readRunStreamResponse(request, url, runId, rootDir);
      }
      return await readRunHealthResponse(runId, rootDir);
    }
    const dashboardRunRoute = url.pathname.match(/^\/kernel\/dashboard\/runs\/([^/]+)$/);
    if (request.method === 'GET' && dashboardRunRoute) {
      const runId = decodeURIComponent(routeParam(dashboardRunRoute, 1));
      return { status: 200, body: await readRunIndex(runId, outDirFromUrl(url)) };
    }
    const eventRoute = url.pathname.match(/^\/kernel\/runs\/([^/]+)\/(events|stream|health)$/);
    if (request.method === 'GET' && eventRoute) {
      if (!authorized(request, options)) return { status: 401, body: { error: 'unauthorized' } };
      const runId = decodeURIComponent(routeParam(eventRoute, 1));
      const rootDir = outDirFromUrl(url);
      if (eventRoute[2] === 'events') return await readRunEventsResponse(request, url, runId, rootDir);
      if (eventRoute[2] === 'stream') return await readRunStreamResponse(request, url, runId, rootDir);
      return await readRunHealthResponse(runId, rootDir);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/kernel/runs/')) {
      if (!authorized(request, options)) return { status: 401, body: { error: 'unauthorized' } };
      const match = url.pathname.match(/^\/kernel\/runs\/([^/]+)(?:\/artifacts\/(.+))?$/);
      if (!match) return { status: 404, body: { error: 'not_found' } };
      const runId = decodeURIComponent(routeParam(match, 1));
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
    if (error instanceof KernelHttpError) {
      return {
        status: error.status,
        body: { error: error.message },
      };
    }
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
