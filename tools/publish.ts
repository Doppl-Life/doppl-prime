// Publishes static HTML snapshots for the committed kernel viewer surfaces.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeedFixture } from '../src/contracts/index.ts';
import { buildRunTrace } from '../src/trace.ts';
import { capstoneDemoLens } from './lens-config.ts';
import { renderAssayPage } from './assay.ts';
import { renderArchitecture } from './microscope/architecture.ts';
import { renderHtml as renderMicroscope } from './microscope/view.ts';
import { renderViewNav, stripViewNav, type KernelView, type KernelViewHrefs } from './view-nav.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(root, 'fixtures');
const publishedDir = path.join(root, 'published');
const defaultFixturePath = path.join(fixturesDir, 'fsd-seed.json');
const architectureV2Path = path.join(root, 'tools', 'microscope', 'architecture-v2.html');

type Page = { to: string; view: KernelView; title: string; blurb: string; render: () => Promise<string> };

const publishedHrefs: KernelViewHrefs = {
  assay: 'assay.html',
  microscope: 'microscope.html',
  architecture: 'architecture.html',
  'architecture-v2': 'architecture-v2.html',
};

async function defaultTrace() {
  const raw = JSON.parse(await readFile(defaultFixturePath, 'utf8'));
  const fixture = assertSeedFixture(raw);
  return buildRunTrace(fixture, 'diverge', { lenses: [capstoneDemoLens] });
}

async function countFixtures(): Promise<number> {
  return (await readdir(fixturesDir)).filter((entry) => entry.endsWith('.json')).length;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function injectNav(html: string, active: KernelView): string {
  const nav = renderViewNav(active, publishedHrefs, { hubHref: '/', hubLabel: 'Hub' });
  const cleanHtml = stripViewNav(html);
  const bodyOpen = /<body[^>]*>/i.exec(cleanHtml);
  if (bodyOpen) {
    const insertAt = bodyOpen.index + bodyOpen[0].length;
    return cleanHtml.slice(0, insertAt) + nav + cleanHtml.slice(insertAt);
  }
  return nav + cleanHtml;
}

function assertNav(html: string, dest: string): void {
  const count = html.match(/class="kernel-view-nav"/g)?.length || 0;
  if (count !== 1) {
    throw new Error(`Published page must have exactly one kernel view header: ${dest} (${count})`);
  }
}

function assertPublicOutputClean(html: string, dest: string): void {
  const forbidden = [
    /known[- ]solution/i,
    /evaluator[- ]only/i,
    /solution\.md/i,
  ];
  const hit = forbidden.find((pattern) => pattern.test(html));
  if (hit) throw new Error(`Published page contains evaluator-only marker ${hit}: ${dest}`);
}

async function pages(): Promise<Page[]> {
  const trace = await defaultTrace();
  const fixtureCount = await countFixtures();
  return [
    { to: 'assay.html', view: 'assay', title: 'Pepsi Output', blurb: 'Pepsi-first output packets, controls, and feedback JSON export', render: renderAssayPage },
    { to: 'microscope.html', view: 'microscope', title: 'Trace microscope', blurb: 'single RunTrace projection with generation and selection lanes', render: async () => renderMicroscope(trace) },
    { to: 'architecture.html', view: 'architecture', title: 'Architecture', blurb: 'trace-derived system map and contract view', render: async () => renderArchitecture(trace, fixtureCount) },
    { to: 'architecture-v2.html', view: 'architecture-v2', title: 'Architecture v2', blurb: 'static design artifact; /api/trace remains live truth', render: async () => readFile(architectureV2Path, 'utf8') },
  ];
}

function hubHtml(pagesToLink: Page[]): string {
  const cards = pagesToLink
    .map((page) => `<a class="card" href="${page.to}"><h2>${escapeHtml(page.title)}</h2><p>${escapeHtml(page.blurb)}</p></a>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Doppl Kernel</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#080b09;color:#f1f5ee;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:38px 20px 64px}
h1{font-size:28px;margin:0 0 6px}
.sub{max-width:700px;color:#a9b8ad;margin:0 0 28px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.card{display:block;text-decoration:none;color:#f1f5ee;background:#101711;border:1px solid #334339;border-radius:10px;padding:16px}
.card:hover{border-color:#43d17d}
.card h2{font-size:16px;margin:0 0 6px}
.card p{color:#a9b8ad;margin:0;font-size:13px}
code{color:#d5f2dc}
</style>
</head>
<body>
<main>
<h1>Doppl Kernel</h1>
<p class="sub">Committed deploy views rendered from the same kernel view functions used by <code>pnpm serve</code>. The live local trace API is a development surface; this hub is static HTML.</p>
<div class="grid">${cards}</div>
</main>
</body>
</html>`;
}

async function main(): Promise<void> {
  await mkdir(publishedDir, { recursive: true });
  const pageList = await pages();
  const published: string[] = ['index.html'];

  await writeFile(path.join(publishedDir, 'index.html'), hubHtml(pageList), 'utf8');

  for (const page of pageList) {
    const dest = path.join(publishedDir, page.to);
    const output = injectNav(await page.render(), page.view);
    assertNav(output, path.relative(root, dest));
    assertPublicOutputClean(output, path.relative(root, dest));
    await writeFile(dest, output, 'utf8');
    published.push(page.to);
  }

  for (const name of published) {
    console.log(`published: ${path.relative(root, path.join(publishedDir, name))}`);
  }

  const live = (await readdir(publishedDir)).filter((f) => f.endsWith('.html')).sort();
  console.log(`published/ now serves ${live.length} page(s): ${live.join(', ')}`);
}

await main();
