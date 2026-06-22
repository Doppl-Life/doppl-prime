// One live server for every kernel view.
//
// Builds the RunTrace once per fixture and renders the live views from that
// source. Architecture v2 is the explicit static design artifact fork. Clean
// routes, one server-owned nav, and a kernel hub. /review + the judgments
// ledger live here too, so this is the single local front door.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertSeedFixture } from '../src/contracts/index.ts';
import type { RunTrace } from '../src/contracts/index.ts';
import { buildRunTrace } from '../src/trace.ts';
import { capstoneDemoLens } from './lens-config.ts';
import { renderViewNav, stripViewNav, type KernelNavActive, type KernelViewHrefs } from './view-nav.ts';
import { renderHtml as renderMicroscope } from './microscope/view.ts';
import { renderArchitecture } from './microscope/architecture.ts';
import { renderAssayPage } from './assay.ts';
import { appendJudgment, isStrong, isUseful, latestJudgments, readJudgments, relativeLedgerPath } from './judgments.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fixturesDir = path.join(root, 'fixtures');
const architectureV2Path = path.join(root, 'tools', 'microscope', 'architecture-v2.html');
const reviewDir = path.join(root, 'out', 'assay-review');
const execFileAsync = promisify(execFile);

const DEFAULT_FIXTURE = 'fsd-seed.json';

const cleanHrefs: KernelViewHrefs = {
  assay: '/assay',
  microscope: '/microscope',
  architecture: '/architecture',
  'architecture-v2': '/architecture-v2',
};
const redirectHrefs = new Map([
  ['/assay/index.html', '/assay'],
  ['/assay-review/index.html', '/review'],
  ['/microscope/index.html', '/microscope'],
  ['/microscope/architecture.html', '/architecture'],
]);

type Args = {
  port: number;
  host: string;
  reviewer: string;
  ledgerPath: string | undefined;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    port: 4317,
    host: '127.0.0.1',
    reviewer: process.env.USER || 'local',
    ledgerPath: undefined,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg.startsWith('--port=')) {
      const port = Number(arg.slice('--port='.length));
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Bad --port value: ${arg}`);
      args.port = port;
    } else if (arg.startsWith('--host=')) {
      args.host = arg.slice('--host='.length) || args.host;
    } else if (arg.startsWith('--reviewer=')) {
      args.reviewer = arg.slice('--reviewer='.length).trim() || args.reviewer;
    } else if (arg.startsWith('--ledger-path=')) {
      args.ledgerPath = path.resolve(root, arg.slice('--ledger-path='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

// ---------- single source of truth: build every trace once ----------
type TraceEntry = { fixtureName: string; seedId: string; seedTitle: string; trace: RunTrace };
const traces: TraceEntry[] = [];
let defaultSeedId = '';

async function buildTraces(): Promise<void> {
  const files = (await readdir(fixturesDir)).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No fixture JSON files found in ${path.relative(root, fixturesDir)}.`);
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(fixturesDir, file), 'utf8'));
    const fixture = assertSeedFixture(raw);
    const trace = buildRunTrace(fixture, 'diverge', { lenses: [capstoneDemoLens] });
    traces.push({ fixtureName: file, seedId: fixture.seed.id, seedTitle: fixture.seed.title, trace });
    if (file === DEFAULT_FIXTURE) defaultSeedId = fixture.seed.id;
  }
  if (!defaultSeedId) defaultSeedId = traces[0].seedId;
}

function traceFor(seed: string | null): TraceEntry {
  return traces.find((entry) => entry.seedId === seed)
    || traces.find((entry) => entry.seedId === defaultSeedId)
    || traces[0];
}

async function pidsListeningOn(port: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
    return [...new Set(
      stdout
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid),
    )];
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 1) return [];
    if (code === 'ENOENT') throw new Error('Cannot free port before serving: `lsof` is not available.');
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function waitForExit(pids: number[], attempts: number): Promise<number[]> {
  let alive = pids.filter(isProcessAlive);
  for (let attempt = 0; attempt < attempts && alive.length; attempt += 1) {
    await delay(50);
    alive = alive.filter(isProcessAlive);
  }
  return alive;
}

async function freePort(port: number): Promise<void> {
  const pids = await pidsListeningOn(port);
  if (!pids.length) return;

  console.log(`freeing port ${port}: stopping ${pids.join(', ')}`);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  const stillAlive = await waitForExit(pids, 20);
  for (const pid of stillAlive) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  const survivors = await waitForExit(stillAlive, 20);
  if (survivors.length) {
    throw new Error(`Could not free port ${port}; still listening: ${survivors.join(', ')}`);
  }
}

// ---------- one server-owned nav (clean routes) ----------
function injectNav(html: string, active: KernelNavActive): string {
  const nav = renderViewNav(active, cleanHrefs, { hubHref: '/', hubLabel: 'Hub', reviewHref: '/review' });
  const clean = stripViewNav(html);
  const body = /<body[^>]*>/i.exec(clean);
  if (body) {
    const at = body.index + body[0].length;
    return clean.slice(0, at) + nav + clean.slice(at);
  }
  return nav + clean;
}

// ---------- responders ----------
function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value, null, 2));
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location, 'cache-control': 'no-store' });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function runTool(label: string, scriptPath: string, toolArgs: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', scriptPath, ...toolArgs], { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${label} failed with exit code ${code}`))));
  });
}

// ---------- kernel hub ----------
function hubHtml(): string {
  const entry = traceFor(null);
  const trace = entry.trace;
  const failed = trace.goalChecks.filter((check) => !check.passed).length;
  const card = (href: string, title: string, sub: string) => `<a class="card" href="${href}"><h3>${title}</h3><p>${sub}</p></a>`;
  const seedLinks = traces
    .map((item) => `<a class="seed${item.seedId === entry.seedId ? ' on' : ''}" href="/microscope?seed=${encodeURIComponent(item.seedId)}">${item.seedTitle}</a>`)
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Doppl Kernel — Local Hub</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#080b09;color:#f1f5ee;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:30px 20px 60px}
h1{font-size:26px;margin:0 0 4px}
.sub{color:#a9b8ad;max-width:700px}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 26px}
.chip{border:1px solid #334339;border-radius:999px;padding:5px 11px;font-size:12px;color:#a9b8ad}
.chip b{color:#f1f5ee}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.card{display:block;border:1px solid #334339;border-radius:12px;padding:16px;background:#101711;text-decoration:none;color:#f1f5ee;transition:border-color .15s,transform .1s}
.card:hover{border-color:#43d17d;transform:translateY(-2px)}
.card h3{margin:0 0 5px;font-size:15.5px}
.card p{margin:0;color:#a9b8ad;font-size:12.5px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#a9b8ad;margin:30px 0 10px}
.seeds{display:flex;flex-wrap:wrap;gap:8px}
.seed{border:1px solid #334339;border-radius:8px;padding:6px 11px;font-size:12.5px;color:#cde0d4;text-decoration:none}
.seed.on{border-color:#35c2e5;color:#35c2e5}
.seed:hover{border-color:#35c2e5}
code{color:#d5f2dc;font:12px ui-monospace,Menlo,monospace}
</style></head><body>
<main>
<h1>Doppl Kernel — Local Hub</h1>
<p class="sub">One server, one in-memory <code>RunTrace</code> per fixture. Assay, Architecture, and Microscope are live projections; Architecture v2 is a labeled static design artifact.</p>
<div class="facts">
<span class="chip"><b>${trace.schemaVersion}</b></span>
<span class="chip">fixtures <b>${traces.length}</b></span>
<span class="chip">default seed <b>${entry.seedTitle}</b></span>
<span class="chip">candidates <b>${trace.candidateCount}</b></span>
<span class="chip">generations <b>${trace.generations.length}</b></span>
<span class="chip">dial <b>${trace.dial}</b></span>
<span class="chip">failed checks <b>${failed}</b></span>
</div>
<div class="grid">
${card('/architecture-v2', "Architecture v2 — static artifact", 'Hand-authored engineer map; use /api/trace for live trace truth.')}
${card('/architecture', 'Architecture — system map', 'The original contract + spine card view.')}
${card('/microscope', 'Microscope — single trace', 'One run: generation, scoring, two selectors, post-selection lens.')}
${card('/assay', 'Pepsi Output — cases + controls', 'Pepsi-first output packets with controls, feedback, and judgments.')}
${card('/review', 'Review — judgments digest', 'Aggregated reviewer verdicts from the ledger.')}
${card('/api/trace', 'API — /api/trace', 'The raw RunTrace JSON used by the live views.')}
</div>
<h2>Switch default seed</h2>
<div class="seeds">${seedLinks}</div>
</main>
</body></html>`;
}

// ---------- judgments API ----------
function judgmentStatus(events: Awaited<ReturnType<typeof readJudgments>>, args: Args): Record<string, unknown> {
  const latest = latestJudgments(events);
  const reviewers = new Set(latest.map((event) => event.reviewer || 'local'));
  return {
    connected: true,
    reviewer: args.reviewer,
    ledgerPath: relativeLedgerPath(args.ledgerPath),
    reviewUrl: '/review',
    eventCount: events.length,
    latestCount: latest.length,
    reviewerCount: reviewers.size,
    usefulCount: latest.filter((event) => isUseful(event.verdict)).length,
    strongCount: latest.filter((event) => isStrong(event.verdict)).length,
  };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, args: Args, url: URL): Promise<void> {
  if (req.method === 'GET' && url.pathname === '/api/traces') {
    sendJson(res, 200, { defaultSeedId, seeds: traces.map((entry) => ({ seedId: entry.seedId, title: entry.seedTitle, fixture: entry.fixtureName })) });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/trace') {
    sendJson(res, 200, traceFor(url.searchParams.get('seed')).trace);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/judgments/status') {
    sendJson(res, 200, judgmentStatus(await readJudgments(args.ledgerPath), args));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/judgments/latest') {
    const runId = url.searchParams.get('runId');
    const events = latestJudgments(await readJudgments(args.ledgerPath)).filter((event) => !runId || event.runId === runId);
    sendJson(res, 200, { events });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/judgments') {
    const event = await appendJudgment(await readBody(req), { reviewer: args.reviewer, ledgerPath: args.ledgerPath });
    sendJson(res, 200, { ok: true, event, ...judgmentStatus(await readJudgments(args.ledgerPath), args) });
    return;
  }
  sendJson(res, 404, { error: 'Unknown API route' });
}

// ---------- view routes ----------
let assayCache: string | undefined;
async function assayHtml(): Promise<string> {
  if (assayCache === undefined) assayCache = await renderAssayPage();
  return assayCache;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, args: Args): Promise<void> {
  try {
    const url = new URL(req.url || '/', `http://${args.host}:${args.port}`);
    const seed = url.searchParams.get('seed');
    const redirect = redirectHrefs.get(url.pathname);
    if (redirect) {
      sendRedirect(res, redirect);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, args, url);
      return;
    }

    if (url.pathname === '/') {
      sendHtml(res, injectNav(hubHtml(), 'none'));
      return;
    }
    if (url.pathname === '/microscope') {
      sendHtml(res, injectNav(renderMicroscope(traceFor(seed).trace), 'microscope'));
      return;
    }
    if (url.pathname === '/architecture') {
      sendHtml(res, injectNav(renderArchitecture(traceFor(seed).trace, traces.length), 'architecture'));
      return;
    }
    if (url.pathname === '/architecture-v2') {
      const html = await readFile(architectureV2Path, 'utf8');
      sendHtml(res, injectNav(html, 'architecture-v2'));
      return;
    }
    if (url.pathname === '/assay') {
      sendHtml(res, injectNav(await assayHtml(), 'assay'));
      return;
    }
    if (url.pathname === '/review' || url.pathname === '/review/') {
      await runTool('assay review generation', path.join(root, 'tools', 'assay-report.ts'), args.ledgerPath ? [`--ledger-path=${args.ledgerPath}`] : []);
      const html = await readFile(path.join(reviewDir, 'index.html'), 'utf8');
      sendHtml(res, injectNav(html, 'review'));
      return;
    }

    sendJson(res, 404, { error: 'Not found', routes: ['/', '/microscope', '/architecture', '/architecture-v2', '/assay', '/review', '/api/trace', '/api/traces'] });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await freePort(args.port);
  await buildTraces();

  const server = createServer((req, res) => {
    void handleRequest(req, res, args);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${args.port} is already in use. Try a different port: pnpm serve -- --port=4318`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });

  server.listen(args.port, args.host, () => {
    const base = `http://${args.host}:${args.port}`;
    console.log(`kernel hub:      ${base}/`);
    console.log(`architecture v2: ${base}/architecture-v2`);
    console.log(`architecture:    ${base}/architecture`);
    console.log(`microscope:      ${base}/microscope`);
    console.log(`assay / review:  ${base}/assay  ·  ${base}/review`);
    console.log(`trace api:       ${base}/api/trace  (+ ?seed=, /api/traces)`);
    console.log(`traces:          ${traces.length} fixture(s); default seed ${defaultSeedId}`);
    console.log('press Ctrl-C to stop');
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
