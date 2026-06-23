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
import { readRunEvents, replayRunProjection } from './event-store.ts';
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
  fitnessLens?: string;
  fitnessSchedule?: string;
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

function productionPage(options: KernelHttpOptions = {}): string {
  const caseStudiesJson = JSON.stringify(DASHBOARD_CASE_STUDIES);
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
    main { display: grid; grid-template-columns: 360px minmax(0, 1fr); min-height: 100vh; }
    aside { border-right: 1px solid var(--line); background: #0c1016; padding: 24px 20px; }
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
    .case-list { display: grid; gap: 8px; margin: 12px 0 16px; }
    .case-button { text-align: left; background: var(--panel); font-weight: 600; margin: 0; }
    .case-button span { display: block; color: var(--muted); font-size: 12px; font-weight: 500; margin-top: 3px; }
    .case-button.active { border-color: var(--teal); background: #10201f; }
    .run-history { display: grid; gap: 8px; margin-top: 12px; }
    .run-button { text-align: left; margin: 0; background: #0f1722; }
    .run-button span { display: block; color: var(--muted); font-size: 12px; margin-top: 3px; }
    .topline { display: flex; justify-content: space-between; gap: 20px; align-items: start; margin-bottom: 18px; }
    .topline p { max-width: 720px; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin-bottom: 18px; }
    .metric { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 12px; }
    .metric strong { display: block; font-size: 24px; }
    .metric span { color: var(--muted); font-size: 12px; }
    .graph-shell {
      border: 1px solid var(--line);
      border-radius: 8px;
      background-color: #07111d;
      background-image: radial-gradient(#17304b 1px, transparent 1px);
      background-size: 12px 12px;
      overflow: hidden;
      position: relative;
    }
    .graph-header { display: flex; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
    .graph-header strong { display: block; }
    .graph-header span { color: var(--muted); font-size: 13px; }
    svg { width: 100%; height: min(70vh, 760px); display: block; }
    .edge { stroke: #536174; stroke-width: 2; marker-end: url(#arrow); }
    .edge.survivor { stroke: var(--teal); stroke-width: 3; }
    .edge.rejected { stroke-dasharray: 4 7; opacity: .5; }
    .node rect { stroke-width: 1.4; rx: 9; }
    .node text { fill: var(--ink); font-size: 12px; }
    .node .sub { fill: var(--muted); font-size: 11px; }
    .node .tag { fill: var(--teal); font-size: 9px; text-transform: uppercase; }
    .node.recovery rect { fill: #152033; stroke: var(--blue); }
    .node.candidate rect { fill: #13201f; stroke: var(--teal); }
    .node.parent rect { fill: #262011; stroke: var(--gold); }
    .node.child rect { fill: #281724; stroke: var(--rose); }
    .node.survivor rect { stroke: #33f0b2; stroke-width: 2.4; }
    .node.rejected rect { stroke: #ef5d84; fill: #23111b; }
    .node.seeded rect { stroke: #3eb7ff; }
    .node { cursor: pointer; transition: opacity .18s ease; }
    .node:hover { opacity: .82; }
    .node.entering { animation: node-in .34s ease both; }
    @keyframes node-in { from { opacity: 0; } to { opacity: 1; } }
    .generation-lane { fill: rgba(18, 35, 55, .34); stroke: rgba(99, 164, 255, .14); }
    .generation-label { fill: var(--muted); font-size: 11px; text-transform: uppercase; }
    .flow-minimap {
      position: absolute;
      right: 16px;
      bottom: 16px;
      width: 180px;
      height: 118px;
      border: 1px solid #1b2a3f;
      background: rgba(5, 11, 18, .9);
      box-shadow: 0 0 0 1px rgba(79, 209, 183, .12);
    }
    .details { display: grid; grid-template-columns: 1.2fr .8fr; gap: 18px; margin-top: 18px; }
    .live-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
    .panel { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 16px; min-width: 0; }
    .panel ul { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.7; }
    .survivor-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: 10px; }
    .survivor-item { border: 1px solid #24435b; border-left: 3px solid var(--teal); border-radius: 6px; padding: 10px; background: #0d151f; }
    .survivor-item strong { display: block; }
    .survivor-item span { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; }
    .event-stream { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; max-height: 220px; overflow: auto; }
    .event-stream li { border-left: 2px solid var(--teal); padding: 6px 8px; background: #0d131c; color: var(--muted); font-size: 12px; }
    .event-stream li.active { color: var(--ink); border-color: var(--gold); }
    code { color: var(--blue); overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; color: var(--muted); margin: 0; max-height: 260px; overflow: auto; }
    @media (max-width: 880px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .topline, .details { display: block; }
      .live-grid { grid-template-columns: 1fr; }
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
      <input id="api-key-input" autocomplete="off" spellcheck="false" placeholder="Optional for protected readback">
      <h2>Real case studies</h2>
      <div id="case-list" class="case-list" aria-label="Real case studies"></div>
      <label for="run-id-input">Run ID</label>
      <input id="run-id-input" value="dashboard_fixture_run">
      <label for="model-input">Live model</label>
      <input id="model-input" value="openai/gpt-4.1-mini">
      <button id="live-button" class="primary">Run selected case</button>
      <button id="fixture-button" class="secondary">Run FSD fixture</button>
      <button id="fetch-button" class="secondary">Fetch run graph</button>
      <p id="status" class="status">Choose a case and run Doppl. Secrets stay server-side.</p>
      <h2>Run history</h2>
      <div id="run-history-list" class="run-history" aria-label="Recent Doppl runs"></div>
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
          <g class="node candidate parent survivor" data-node-kind="candidate" data-node-status="survivor" transform="translate(360 110)">
            <rect width="210" height="82"></rect><text x="14" y="28">Liability clock</text><text class="sub" x="14" y="52">fitness 86.0 selected</text>
          </g>
          <g class="node candidate parent survivor" data-node-kind="candidate" data-node-status="survivor" transform="translate(360 220)">
            <rect width="210" height="82"></rect><text x="14" y="28">Residual value stress</text><text class="sub" x="14" y="52">fitness 40.0 selected</text>
          </g>
          <g class="node candidate rejected" data-node-kind="candidate" data-node-status="rejected" transform="translate(360 330)">
            <rect width="210" height="82"></rect><text x="14" y="28">Credit exposure</text><text class="sub" x="14" y="52">fitness 20.0 culled</text>
          </g>
          <g class="node child survivor" data-node-kind="child" data-node-status="survivor" transform="translate(720 210)">
            <rect width="210" height="92"></rect><text x="14" y="30">Fused child</text><text class="sub" x="14" y="56">liability + residual</text>
          </g>
        </svg>
        <svg id="flow-minimap" class="flow-minimap" viewBox="0 0 180 118" aria-label="Evolution graph minimap"></svg>
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
      <article class="panel">
        <h2>Final surviving solutions</h2>
        <div id="survivor-list" class="survivor-list"></div>
      </article>
      <div class="live-grid">
        <article class="panel">
          <h2>Event stream</h2>
          <ul id="event-stream" class="event-stream"></ul>
        </article>
        <article class="panel">
          <h2>Node inspector</h2>
          <pre id="node-inspector">Select a graph node to inspect its role in the run.</pre>
        </article>
      </div>
    </section>
  </main>
  <script>
    const dashboardCases = ${caseStudiesJson};
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
    const state = { runId: sampleRun.runId, selectedCase: dashboardCases[0] };
    const status = document.getElementById('status');
    const apiKeyInput = document.getElementById('api-key-input');
    const runIdInput = document.getElementById('run-id-input');
    const modelInput = document.getElementById('model-input');
    const artifactPreview = document.getElementById('artifact-preview');
    const eventStream = document.getElementById('event-stream');
    const nodeInspector = document.getElementById('node-inspector');
    const survivorList = document.getElementById('survivor-list');
    function slugTime() {
      return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    }
    function renderCaseList() {
      document.getElementById('case-list').innerHTML = dashboardCases.map((caseStudy) => {
        const active = caseStudy.id === state.selectedCase.id ? ' active' : '';
        return '<button class="case-button' + active + '" data-case-id="' + caseStudy.id + '">' + caseStudy.title + '<span>' + caseStudy.id + ' / ' + caseStudy.mode + '</span></button>';
      }).join('');
      document.querySelectorAll('.case-button').forEach((button) => {
        button.addEventListener('click', () => {
          const next = dashboardCases.find((caseStudy) => caseStudy.id === button.dataset.caseId);
          if (!next) return;
          state.selectedCase = next;
          runIdInput.value = next.id + '_' + slugTime();
          status.textContent = 'Selected ' + next.title + '.';
          renderCaseList();
        });
      });
    }
    function authHeaders() {
      const key = apiKeyInput.value.trim();
      return key ? { Authorization: 'Bearer ' + key } : {};
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    function node(label, detail, kind, x, y, status) {
      const nodeStatus = status || 'seeded';
      const classes = ['node', kind, nodeStatus].join(' ');
      return '<g class="' + classes + '" data-node-kind="' + kind + '" data-node-status="' + nodeStatus + '" data-node-id="' + escapeHtml(label) + '" transform="translate(' + x + ' ' + y + ')"><rect width="220" height="78"></rect><text class="tag" x="14" y="17">' + escapeHtml(kind + ' / ' + nodeStatus) + '</text><text x="14" y="38">' + escapeHtml(label) + '</text><text class="sub" x="14" y="60">' + escapeHtml(detail) + '</text></g>';
    }
    function edge(x1, y1, x2, y2, status) {
      return '<line class="edge ' + escapeHtml(status || '') + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"></line>';
    }
    function candidateById(run, id) {
      return (run.candidates || []).find((candidate) => candidate.id === id);
    }
    function unique(values) {
      return Array.from(new Set(values.filter(Boolean)));
    }
    function layoutEvolutionTree(run) {
      const evolution = run.evolution && run.evolution.length > 0 ? run.evolution : [{
        generation: 0,
        candidateIds: (run.candidates || []).map((candidate) => candidate.id),
        selectedParentIds: run.child?.parentCandidateIds || [],
        childId: run.child?.id
      }];
      const width = Math.max(1260, 260 + evolution.length * 330);
      const allRows = Math.max(4, ...evolution.map((generation) => unique([...(generation.candidateIds || []), generation.childId]).length + 1));
      const height = Math.max(620, 130 + allRows * 104);
      const nodes = [{ id: run.problemRecovery?.id || 'problem_recovery', kind: 'recovery', status: 'seeded', x: 54, y: height / 2 - 38, detail: 'problem recovery' }];
      const edges = [];
      const lanes = [];
      let priorId = nodes[0].id;
      let priorX = 274;
      let priorY = height / 2;
      evolution.forEach((generation, generationIndex) => {
        const x = 350 + generationIndex * 330;
        lanes.push({ generation: generation.generation ?? generationIndex, x: x - 28, width: 276 });
        const selected = new Set(generation.selectedParentIds || run.child?.parentCandidateIds || []);
        const candidateIds = unique(generation.candidateIds || []);
        const top = Math.max(70, (height - candidateIds.length * 96) / 2);
        candidateIds.forEach((candidateId, index) => {
          const candidate = candidateById(run, candidateId) || { id: candidateId, fitnessTotal: 'unscored' };
          const y = top + index * 96;
          const status = selected.has(candidateId) ? 'survivor' : 'rejected';
          nodes.push({ id: candidateId, kind: 'candidate', status, x, y, detail: 'fitness ' + (candidate.fitnessTotal ?? 'unscored') });
          edges.push({ fromX: priorX, fromY: priorY, toX: x, toY: y + 39, status });
        });
        if (generation.childId || (generationIndex === evolution.length - 1 && run.child)) {
          const childId = generation.childId || run.child.id;
          const childY = Math.max(70, top + candidateIds.length * 96 + 18);
          nodes.push({ id: childId, kind: 'child', status: 'survivor', x: x + 250, y: childY, detail: 'fused survivor' });
          candidateIds.filter((candidateId) => selected.has(candidateId)).forEach((candidateId) => {
            const parentNode = nodes.find((item) => item.id === candidateId && item.x === x);
            if (parentNode) edges.push({ fromX: parentNode.x + 220, fromY: parentNode.y + 39, toX: x + 250, toY: childY + 39, status: 'survivor' });
          });
          priorId = childId;
          priorX = x + 470;
          priorY = childY + 39;
        }
      });
      return { width, height, lanes, nodes, edges };
    }
    function renderMiniMap(layout) {
      const sx = 180 / layout.width;
      const sy = 118 / layout.height;
      document.getElementById('flow-minimap').innerHTML = layout.nodes.map((item) => '<rect x="' + Math.round(item.x * sx) + '" y="' + Math.round(item.y * sy) + '" width="5" height="5" fill="' + (item.status === 'survivor' ? '#4fd1b7' : item.status === 'rejected' ? '#f27b9b' : '#63a4ff') + '"></rect>').join('');
    }
    function renderSurvivors(run) {
      const survivorIds = new Set(run.child?.parentCandidateIds || []);
      const survivors = (run.candidates || []).filter((candidate) => survivorIds.has(candidate.id));
      if (run.child) survivors.push({ id: run.child.id, title: 'Fused child', fitnessTotal: 'final' });
      survivorList.innerHTML = survivors.map((item) => '<div class="survivor-item"><strong>' + escapeHtml(item.title || item.id) + '</strong><span>' + escapeHtml(item.id) + ' / fitness ' + escapeHtml(item.fitnessTotal ?? 'survivor') + '</span></div>').join('') || '<p class="status">No survivors selected yet.</p>';
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
      const layout = layoutEvolutionTree(run);
      document.getElementById('lineage-graph').setAttribute('viewBox', '0 0 ' + layout.width + ' ' + layout.height);
      let svg = '<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="#536174"></path></marker></defs>';
      layout.lanes.forEach((lane) => {
        svg += '<rect class="generation-lane" x="' + lane.x + '" y="42" width="' + lane.width + '" height="' + (layout.height - 84) + '"></rect><text class="generation-label" x="' + (lane.x + 14) + '" y="64">Generation ' + lane.generation + '</text>';
      });
      layout.edges.forEach((item) => { svg += edge(item.fromX, item.fromY, item.toX, item.toY, item.status); });
      layout.nodes.forEach((item) => { svg += node(item.id, item.detail, item.kind, item.x, item.y, item.status); });
      document.getElementById('lineage-graph').innerHTML = svg;
      document.getElementById('selected-run-list').innerHTML = (run.child?.parentCandidateIds || []).map((id) => '<li><code>' + id + '</code> contributes to the fused child.</li>').join('') || '<li>No child selected yet.</li>';
      document.querySelectorAll('#lineage-graph .node').forEach((nodeElement, index) => {
        nodeElement.classList.add('entering');
        nodeElement.style.animationDelay = String(index * 55) + 'ms';
        nodeElement.addEventListener('click', () => inspectNode(nodeElement.dataset.nodeId, nodeElement.dataset.nodeKind, run));
      });
      renderMiniMap(layout);
      renderSurvivors(run);
      renderEvents(run.dashboardEvents || []);
    }
    function inspectNode(nodeId, nodeKind, run) {
      const candidate = (run.candidates || []).find((item) => item.id === nodeId);
      const child = run.child && run.child.id === nodeId ? run.child : null;
      nodeInspector.textContent = JSON.stringify({ nodeId, nodeKind, candidate, child }, null, 2);
    }
    function renderEvents(events) {
      const visible = events.slice(-24);
      eventStream.innerHTML = visible.map((event, index) => '<li class="' + (index === visible.length - 1 ? 'active' : '') + '">' + escapeHtml(event.type || event.eventType || 'event') + '</li>').join('') || '<li>No events loaded yet.</li>';
    }
    function animateProgress() {
      const ticks = ['request accepted', 'recovering problem', 'generating candidates', 'scoring parents', 'fusing child'];
      renderEvents(ticks.map((type) => ({ type })));
    }
    async function refreshRunHistory() {
      const response = await fetch('/kernel/dashboard/runs');
      const body = await response.json();
      const runs = body.runs || [];
      document.getElementById('run-history-list').innerHTML = runs.map((run) => '<button class="run-button" data-run-id="' + escapeHtml(run.runId) + '"><strong>' + escapeHtml(run.caseId) + '</strong><span>' + escapeHtml(run.runId) + ' / ' + escapeHtml(run.child || 'unfused') + '</span></button>').join('') || '<p class="status">No saved runs yet.</p>';
      document.querySelectorAll('.run-button').forEach((button) => {
        button.addEventListener('click', () => {
          runIdInput.value = button.dataset.runId || '';
          fetchRunGraph().catch((error) => { status.textContent = error.message; });
        });
      });
    }
    async function runKernel(liveModel) {
      const selectedCase = liveModel ? state.selectedCase : dashboardCases[0];
      const runId = runIdInput.value.trim() || ('dashboard_' + Date.now());
      status.textContent = liveModel ? 'Running ' + selectedCase.title + ' through Doppl...' : 'Running FSD fixture...';
      animateProgress();
      const response = await fetch('/kernel/dashboard/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          casePath: selectedCase.path,
          generations: liveModel ? 1 : 4,
          budget: liveModel ? 1 : 4,
          liveModel,
          model: liveModel ? modelInput.value.trim() || undefined : undefined
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'run failed');
      runIdInput.value = body.runId;
      renderGraph(body);
      if (body.dashboardArtifact) artifactPreview.textContent = body.dashboardArtifact;
      status.textContent = 'Graph loaded for ' + body.runId + '.';
      await refreshRunHistory();
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
      renderEvents(body.dashboardEvents || []);
    }
    document.getElementById('live-button').addEventListener('click', () => runKernel(true).catch((error) => { status.textContent = error.message; }));
    document.getElementById('fixture-button').addEventListener('click', () => runKernel(false).catch((error) => { status.textContent = error.message; }));
    document.getElementById('fetch-button').addEventListener('click', () => fetchRunGraph().catch((error) => { status.textContent = error.message; }));
    runIdInput.value = state.selectedCase.id + '_' + slugTime();
    renderCaseList();
    renderGraph(sampleRun);
    refreshRunHistory().catch(() => {});
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

async function readDashboardEvents(runId: string, rootDir: string): Promise<Array<Record<string, unknown>>> {
  try {
    return (await readRunEventLog(runId, rootDir)) as unknown as Array<Record<string, unknown>>;
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
  let caseEntries: Awaited<ReturnType<typeof readdir>>;
  try {
    caseEntries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const caseEntry of caseEntries) {
    if (!caseEntry.isDirectory()) continue;
    const caseDir = path.join(rootDir, caseEntry.name);
    let runEntries: Awaited<ReturnType<typeof readdir>>;
    try {
      runEntries = await readdir(caseDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory()) continue;
      try {
        const index = JSON.parse(
          await readFile(path.join(caseDir, runEntry.name, 'run-index.json'), 'utf8'),
        ) as Record<string, unknown>;
        const child = index.child as { id?: string } | undefined;
        runs.push({
          runId: index.runId,
          caseId: index.caseId,
          caseTitle: index.caseTitle,
          child: child?.id ?? null,
          candidates: Array.isArray(index.candidates) ? index.candidates.length : 0,
          generations: Array.isArray(index.evolution) ? index.evolution.length : 0,
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
    throw new Error('liveModel cannot be combined with replayModelCallsPath');
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
  const casePath = casePathFromRequest(parsed.casePath);
  const fitnessLens = parseFitnessLens(parsed.fitnessLens);
  const fitnessSchedule = parseFitnessSchedule(parsed.fitnessSchedule);
  const generationProviders = await generationProvidersFromRequest(parsed, options);
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
  if (liveModel && !envFlagEnabled(options, 'DOPPL_ENABLE_LIVE_LLM')) {
    throw new KernelHttpError(403, 'live dashboard generation is disabled');
  }
  if (liveModel && !liveDemoAuthorized(request, options)) {
    throw new KernelHttpError(403, 'live demo token is required');
  }
  const requestedGenerations = parsePositiveInteger(parsed.generations, liveModel ? 1 : 4);
  const generations = liveModel ? Math.min(requestedGenerations, 1) : Math.min(requestedGenerations, 4);
  const summary = await runFromRequestBody(
    JSON.stringify({
      runId: parsed.runId || `${dashboardCase.id}_${Date.now()}`,
      casePath,
      fixturePath: dashboardCase.fixturePath,
      knowledgePacketPath: dashboardCase.knowledgePacketPath,
      generations,
      budget: generations,
      liveModel,
      model: liveModel ? parsed.model || 'openai/gpt-4.1-mini' : undefined,
      fitnessLens: parseFitnessLens(parsed.fitnessLens),
      fitnessSchedule: parseFitnessSchedule(parsed.fitnessSchedule),
      outDir,
      proofBoardDir: parsed.proofBoardDir || defaultKernelArgs.proofBoardDir,
    }),
    options,
  );
  const runId = String(summary.runId);
  const runIndex = await readRunIndex(runId, outDir);
  const problemRecovery = runIndex.problemRecovery as { path?: string } | undefined;
  const artifact = problemRecovery?.path
    ? await readRunArtifact(runId, outDir, problemRecovery.path)
    : undefined;
  return {
    ...runIndex,
    runMode: liveModel ? 'live' : 'fixture',
    generations: Array.isArray(runIndex.evolution) ? runIndex.evolution.length : 0,
    candidateCount: Array.isArray(runIndex.candidates) ? runIndex.candidates.length : 0,
    modelCalls: runIndex.trace &&
      typeof runIndex.trace === 'object' &&
      'modelCallsPath' in runIndex.trace &&
      typeof runIndex.trace.modelCallsPath === 'string'
      ? { path: runIndex.trace.modelCallsPath }
      : null,
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
      const runId = decodeURIComponent(dashboardEventRoute[1]!);
      const rootDir = outDirFromUrl(url);
      if (dashboardEventRoute[2] === 'events') {
        return await readRunEventsResponse(request, url, runId, rootDir);
      }
      if (dashboardEventRoute[2] === 'stream') {
        return await readRunStreamResponse(request, url, runId, rootDir);
      }
      return await readRunHealthResponse(runId, rootDir);
    }
    const eventRoute = url.pathname.match(/^\/kernel\/runs\/([^/]+)\/(events|stream|health)$/);
    if (request.method === 'GET' && eventRoute) {
      if (!authorized(request, options)) return { status: 401, body: { error: 'unauthorized' } };
      const runId = decodeURIComponent(eventRoute[1]!);
      const rootDir = outDirFromUrl(url);
      if (eventRoute[2] === 'events') return await readRunEventsResponse(request, url, runId, rootDir);
      if (eventRoute[2] === 'stream') return await readRunStreamResponse(request, url, runId, rootDir);
      return await readRunHealthResponse(runId, rootDir);
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
