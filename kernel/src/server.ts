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
  <title>Doppl Evolution Graph</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090b0f;
      --panel: #10151d;
      --panel-2: #141b25;
      --ink: #edf4ff;
      --muted: #8f9bad;
      --line: #253142;
      --blue: #63a4ff;
      --teal: #4fd1b7;
      --gold: #f2c66d;
      --rose: #f27b9b;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    main { display: grid; grid-template-columns: 320px minmax(0, 1fr); min-height: 100vh; }
    aside { border-right: 1px solid var(--line); background: #0c1016; padding: 28px 22px; }
    .workspace { padding: 28px; min-width: 0; }
    h1 { font-size: 32px; line-height: 1.05; margin: 0 0 10px; letter-spacing: 0; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0; color: var(--muted); margin: 0 0 12px; }
    p { color: var(--muted); line-height: 1.55; margin: 0 0 18px; }
    label { display: block; color: var(--muted); font-size: 12px; margin: 14px 0 6px; }
    input, select, button {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      color: var(--ink);
      padding: 10px 11px;
      font: inherit;
    }
    button { cursor: pointer; font-weight: 700; margin-top: 10px; }
    button.primary { background: var(--blue); border-color: var(--blue); color: #06101f; }
    button.secondary { background: var(--panel-2); }
    button:focus, input:focus, select:focus { outline: 2px solid var(--teal); outline-offset: 2px; }
    .status { min-height: 22px; color: var(--muted); font-size: 13px; margin-top: 12px; }
    .topline { display: flex; justify-content: space-between; gap: 20px; align-items: start; margin-bottom: 18px; }
    .topline p { max-width: 720px; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin-bottom: 18px; }
    .metric { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 12px; }
    .metric strong { display: block; font-size: 24px; }
    .metric span { color: var(--muted); font-size: 12px; }
    .graph-shell { border: 1px solid var(--line); border-radius: 8px; background: #0b1119; overflow: hidden; }
    .graph-header { display: flex; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
    .graph-header strong { display: block; }
    .graph-header span { color: var(--muted); font-size: 13px; }
    svg { width: 100%; height: min(62vh, 620px); display: block; }
    .edge { stroke: #536174; stroke-width: 2; marker-end: url(#arrow); }
    .node rect { stroke-width: 1.4; rx: 9; }
    .node text { fill: var(--ink); font-size: 12px; }
    .node .sub { fill: var(--muted); font-size: 11px; }
    .node.recovery rect { fill: #152033; stroke: var(--blue); }
    .node.candidate rect { fill: #13201f; stroke: var(--teal); }
    .node.parent rect { fill: #262011; stroke: var(--gold); }
    .node.child rect { fill: #281724; stroke: var(--rose); }
    .details { display: grid; grid-template-columns: 1.2fr .8fr; gap: 18px; margin-top: 18px; }
    .panel { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 16px; min-width: 0; }
    .panel ul { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.7; }
    code { color: var(--blue); overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; color: var(--muted); margin: 0; max-height: 260px; overflow: auto; }
    @media (max-width: 880px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .topline, .details { display: block; }
      .metrics { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      svg { height: 540px; }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <h1>Doppl Evolution Graph</h1>
      <p>Run the kernel, inspect selection pressure, and watch candidates fuse into the next child.</p>
      <label for="api-key-input">Kernel API key</label>
      <input id="api-key-input" autocomplete="off" spellcheck="false" placeholder="Bearer token">
      <label for="run-id-input">Run ID</label>
      <input id="run-id-input" value="dashboard_fixture_run">
      <label for="model-input">Live model</label>
      <input id="model-input" value="openai/gpt-4.1-mini">
      <button id="fixture-button" class="primary">Run fixture</button>
      <button id="live-button" class="secondary">Run live model</button>
      <button id="fetch-button" class="secondary">Fetch run graph</button>
      <p id="status" class="status">Sample graph loaded. Enter an API key to run or fetch protected runs.</p>
    </aside>
    <section class="workspace" aria-label="Kernel run graph workspace">
      <div class="topline">
        <div>
          <h2>Lineage workspace</h2>
          <p id="run-summary">A representative Doppl run: recovery creates candidates, critics score them, selected parents fuse into a child.</p>
        </div>
      </div>
      <div class="metrics">
        <div class="metric"><strong id="metric-candidates">3</strong><span>candidates</span></div>
        <div class="metric"><strong id="metric-generations">1</strong><span>generations</span></div>
        <div class="metric"><strong id="metric-budget">1</strong><span>budget used</span></div>
        <div class="metric"><strong id="metric-child">1</strong><span>fused child</span></div>
      </div>
      <div class="graph-shell">
        <div class="graph-header">
          <div><strong id="graph-title">fsd-ownership-unwind / sample</strong><span>Recovery -> candidates -> selected parents -> fused child</span></div>
          <span id="graph-mode">sample</span>
        </div>
        <svg id="lineage-graph" viewBox="0 0 980 520" role="img" aria-label="Doppl evolving run graph">
          <defs>
            <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="#536174"></path>
            </marker>
          </defs>
          <line class="edge" x1="230" y1="260" x2="360" y2="150"></line>
          <line class="edge" x1="230" y1="260" x2="360" y2="260"></line>
          <line class="edge" x1="230" y1="260" x2="360" y2="370"></line>
          <line class="edge" x1="570" y1="150" x2="720" y2="250"></line>
          <line class="edge" x1="570" y1="260" x2="720" y2="250"></line>
          <g class="node recovery" data-node-kind="recovery" transform="translate(60 220)">
            <rect width="180" height="82"></rect><text x="14" y="28">Problem recovery</text><text class="sub" x="14" y="52">ownership premise</text>
          </g>
          <g class="node candidate parent" data-node-kind="candidate" transform="translate(360 110)">
            <rect width="210" height="82"></rect><text x="14" y="28">Liability clock</text><text class="sub" x="14" y="52">fitness 86.0 selected</text>
          </g>
          <g class="node candidate parent" data-node-kind="candidate" transform="translate(360 220)">
            <rect width="210" height="82"></rect><text x="14" y="28">Residual value stress</text><text class="sub" x="14" y="52">fitness 40.0 selected</text>
          </g>
          <g class="node candidate" data-node-kind="candidate" transform="translate(360 330)">
            <rect width="210" height="82"></rect><text x="14" y="28">Credit exposure</text><text class="sub" x="14" y="52">fitness 20.0 culled</text>
          </g>
          <g class="node child" data-node-kind="child" transform="translate(720 210)">
            <rect width="210" height="92"></rect><text x="14" y="30">Fused child</text><text class="sub" x="14" y="56">liability + residual</text>
          </g>
        </svg>
      </div>
      <div class="details">
        <article class="panel">
          <h2>Selected run</h2>
          <ul id="selected-run-list">
            <li><code>cand_liability_clock</code> and <code>cand_recovery_market</code> selected as parents.</li>
            <li>Child inherits upstream legal-clock signal and balance-sheet stress framing.</li>
          </ul>
        </article>
        <article class="panel">
          <h2>Artifact preview</h2>
          <pre id="artifact-preview">Run an authenticated fixture/live model request, then click Fetch run graph to inspect exported artifacts.</pre>
        </article>
      </div>
    </section>
  </main>
  <script>
    const sampleRun = {
      runId: 'sample',
      caseId: 'fsd-ownership-unwind',
      problemRecovery: { id: 'recovery_fsd', path: 'problem-recovery.md' },
      candidates: [
        { id: 'cand_liability_clock', agenomeId: 'ag_blindside', fitnessTotal: 86, selectedParent: true },
        { id: 'cand_recovery_market', agenomeId: 'ag_first_principles', fitnessTotal: 40, selectedParent: true },
        { id: 'cand_lender_residual', agenomeId: 'ag_constraint_injection', fitnessTotal: 20, selectedParent: false }
      ],
      child: { id: 'child_cand_liability_clock_cand_recovery_market', parentCandidateIds: ['cand_liability_clock', 'cand_recovery_market'] },
      evolution: [{ generation: 0, candidateIds: ['cand_liability_clock', 'cand_recovery_market', 'cand_lender_residual'], selectedParentIds: ['cand_liability_clock', 'cand_recovery_market'], childId: 'child_cand_liability_clock_cand_recovery_market' }],
      budget: { usedUnits: 1 }
    };
    const state = { runId: sampleRun.runId };
    const status = document.getElementById('status');
    const apiKeyInput = document.getElementById('api-key-input');
    const runIdInput = document.getElementById('run-id-input');
    const modelInput = document.getElementById('model-input');
    const artifactPreview = document.getElementById('artifact-preview');
    function authHeaders() {
      const key = apiKeyInput.value.trim();
      return key ? { Authorization: 'Bearer ' + key } : {};
    }
    function node(label, detail, kind, x, y) {
      const classes = ['node', kind].join(' ');
      return '<g class="' + classes + '" data-node-kind="' + kind + '" transform="translate(' + x + ' ' + y + ')"><rect width="210" height="86"></rect><text x="14" y="30">' + label + '</text><text class="sub" x="14" y="56">' + detail + '</text></g>';
    }
    function edge(x1, y1, x2, y2) {
      return '<line class="edge" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"></line>';
    }
    function renderGraph(run) {
      state.runId = run.runId;
      document.getElementById('graph-title').textContent = run.caseId + ' / ' + run.runId;
      document.getElementById('graph-mode').textContent = run.child ? 'fused' : 'unfused';
      document.getElementById('metric-candidates').textContent = String(run.candidates.length);
      document.getElementById('metric-generations').textContent = String(run.evolution.length);
      document.getElementById('metric-budget').textContent = String(run.budget?.usedUnits ?? 0);
      document.getElementById('metric-child').textContent = run.child ? '1' : '0';
      document.getElementById('run-summary').textContent = 'Run ' + run.runId + ' evolved ' + run.candidates.length + ' candidates across ' + run.evolution.length + ' generation(s).';
      const selected = new Set(run.child?.parentCandidateIds || run.evolution[0]?.selectedParentIds || []);
      const candidateY = [88, 214, 340];
      let svg = '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="#536174"></path></marker></defs>';
      svg += node('Problem recovery', run.problemRecovery?.id || 'recovery', 'recovery', 58, 218);
      run.candidates.forEach((candidate, index) => {
        const y = candidateY[index] || 340 + (index - 2) * 104;
        svg += edge(228, 260, 360, y + 42);
        svg += node(candidate.id, 'fitness ' + (candidate.fitnessTotal ?? 'unscored') + (selected.has(candidate.id) ? ' selected' : ''), selected.has(candidate.id) ? 'candidate parent' : 'candidate', 360, y);
        if (run.child && selected.has(candidate.id)) svg += edge(570, y + 42, 720, 252);
      });
      if (run.child) svg += node(run.child.id, 'fused child', 'child', 720, 208);
      document.getElementById('lineage-graph').innerHTML = svg;
      document.getElementById('selected-run-list').innerHTML = (run.child?.parentCandidateIds || []).map((id) => '<li><code>' + id + '</code> contributes to the fused child.</li>').join('') || '<li>No child selected yet.</li>';
    }
    async function runKernel(liveModel) {
      const runId = runIdInput.value.trim() || ('dashboard_' + Date.now());
      status.textContent = liveModel ? 'Running live model...' : 'Running fixture...';
      const response = await fetch('/kernel/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ runId, generations: 1, budget: 1, liveModel, model: modelInput.value.trim() || undefined })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'run failed');
      runIdInput.value = body.runId;
      status.textContent = 'Run complete. Fetching graph...';
      await fetchRunGraph();
    }
    async function fetchRunGraph() {
      const runId = runIdInput.value.trim();
      status.textContent = 'Fetching run graph...';
      const response = await fetch('/kernel/runs/' + encodeURIComponent(runId), { headers: authHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'fetch failed');
      renderGraph(body);
      status.textContent = 'Graph loaded for ' + runId + '.';
      const artifact = body.problemRecovery?.path;
      if (artifact) {
        const artifactResponse = await fetch('/kernel/runs/' + encodeURIComponent(runId) + '/artifacts/' + encodeURIComponent(artifact), { headers: authHeaders() });
        const artifactBody = await artifactResponse.json();
        if (artifactResponse.ok) artifactPreview.textContent = artifactBody.content;
      }
    }
    document.getElementById('fixture-button').addEventListener('click', () => runKernel(false).catch((error) => { status.textContent = error.message; }));
    document.getElementById('live-button').addEventListener('click', () => runKernel(true).catch((error) => { status.textContent = error.message; }));
    document.getElementById('fetch-button').addEventListener('click', () => fetchRunGraph().catch((error) => { status.textContent = error.message; }));
    renderGraph(sampleRun);
  </script>
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
