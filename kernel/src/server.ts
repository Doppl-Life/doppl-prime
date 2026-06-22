import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
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
  body: Record<string, unknown>;
};

type KernelHttpOptions = {
  env?: Record<string, string | undefined>;
  fetch?: OpenRouterModelClientInput['fetch'];
};

function jsonResponse(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
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
    if (request.method === 'GET' && request.url === '/health') {
      return { status: 200, body: { ok: true, service: 'doppl-kernel' } };
    }
    if (request.method === 'POST' && request.url === '/kernel/runs') {
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
      jsonResponse(response, result.status, result.body);
    })();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3000);
  createKernelHttpServer().listen(port, () => {
    console.log(JSON.stringify({ service: 'doppl-kernel', port }));
  });
}
