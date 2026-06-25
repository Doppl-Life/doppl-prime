import { createServer, type Server } from 'node:http';
import {
  authorized,
  dashboardAssetResponse,
  dashboardIndexPage,
  KernelHttpError,
  outDirFromUrl,
  parsedUrl,
  readBody,
  routeParam,
  writeHttpResponse,
  type KernelHttpOptions,
  type KernelHttpRequest,
  type KernelHttpResponse,
} from './server-http.ts';
import {
  listDashboardRuns,
  readRunArtifact,
  readRunEventsResponse,
  readRunHealthResponse,
  readRunIndex,
  readRunStreamResponse,
} from './server-store.ts';
import { runDashboardCaseFromRequestBody, runFromRequestBody } from './server-runs.ts';

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
