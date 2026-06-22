import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { defaultKernelArgs } from './cli.ts';
import { runKernel } from './run-kernel.ts';
import { exportRunToVault } from './vault-export.ts';
import { writeProofBoard } from './proof-board.ts';

type KernelRunRequest = {
  runId?: string;
  generations?: number;
  budget?: number;
  outDir?: string;
  proofBoardDir?: string;
};

type KernelHttpRequest = {
  method: string;
  url: string;
  body?: string;
};

type KernelHttpResponse = {
  status: number;
  body: Record<string, unknown>;
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

async function runFromRequestBody(body: string | undefined): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(body || '{}') as KernelRunRequest;
  const generations = parsePositiveInteger(parsed.generations, defaultKernelArgs.generations);
  const budget = parseBudget(parsed.budget, defaultKernelArgs.evolutionBudget.maxUnits);
  const run = await runKernel({
    ...defaultKernelArgs,
    runId: parsed.runId || defaultKernelArgs.runId,
    generations,
    evolutionBudget: { maxUnits: budget },
  });
  const manifest = await exportRunToVault(run, parsed.outDir || defaultKernelArgs.outDir);
  const proofBoard = await writeProofBoard(run, parsed.proofBoardDir || defaultKernelArgs.proofBoardDir);
  return {
    runId: run.id,
    caseId: run.caseStudy.id,
    generations: run.evolution.length,
    budget: run.budget,
    child: run.fusion?.child.id || null,
    proofBoard,
    files: manifest.files,
  };
}

export async function handleKernelHttpRequest(
  request: KernelHttpRequest,
): Promise<KernelHttpResponse> {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      return { status: 200, body: { ok: true, service: 'doppl-kernel' } };
    }
    if (request.method === 'POST' && request.url === '/kernel/runs') {
      return { status: 200, body: await runFromRequestBody(request.body) };
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
