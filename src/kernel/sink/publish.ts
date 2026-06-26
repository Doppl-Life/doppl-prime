import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { KernelRun } from '../boundary.ts';
import { renderProofBoard } from '../projection/proof-board.ts';
import { exportRunToVault } from './vault-export.ts';

export type StaticPublishManifest = {
  rootDir: string;
  indexHtml: string;
  files: string[];
};

export type PublishedIndexInput = {
  kernelHref: string;
  kernelTitle: string;
  runId: string;
};

function artifactLabel(relativePath: string): string {
  if (relativePath === 'run-index.json') return 'Run index';
  if (relativePath === 'problem-recovery.md') return 'Problem recovery';
  if (relativePath === 'events.jsonl') return 'Events';
  if (relativePath === 'trace.json') return 'Trace JSON';
  if (relativePath === 'model-calls.jsonl') return 'Model calls';
  if (relativePath.endsWith('.md')) return relativePath.replace(/\.md$/, '');
  return relativePath;
}

function linkPublishedVault(html: string, artifactPaths: string[]): string {
  const preferredOrder = [
    'run-index.json',
    'problem-recovery.md',
    'trace.json',
    'events.jsonl',
    'model-calls.jsonl',
  ];
  const sorted = [...artifactPaths].sort((left, right) => {
    const leftRank = preferredOrder.indexOf(left);
    const rightRank = preferredOrder.indexOf(right);
    if (leftRank !== -1 || rightRank !== -1) {
      return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
    }
    return left.localeCompare(right);
  });
  const links = sorted
    .map(
      (relativePath) =>
        `<a href="published-vault/${escapeHtml(relativePath)}">${escapeHtml(artifactLabel(relativePath))}</a>`,
    )
    .join('');
  return html.replace(
    '</header>',
    `<p><a href="published-vault/" aria-label="Published vault artifacts">published-vault/</a></p>
    <div class="artifact-links" aria-label="Published artifact links">${links}</div>
  </header>`,
  );
}

export async function publishStaticKernelRun(
  run: KernelRun,
  rootDir: string,
): Promise<StaticPublishManifest> {
  await mkdir(rootDir, { recursive: true });
  const vaultBuildDir = await mkdtemp(path.join(tmpdir(), 'doppl-published-vault-'));
  const vaultManifest = await exportRunToVault(run, vaultBuildDir);
  const publishedVaultDir = path.join(rootDir, 'published-vault');
  await mkdir(publishedVaultDir, { recursive: true });
  await cp(vaultManifest.rootDir, publishedVaultDir, { recursive: true });

  const indexHtml = path.join(rootDir, 'index.html');
  const artifactPaths = vaultManifest.files.map((file) => path.relative(vaultManifest.rootDir, file));
  await writeFile(indexHtml, linkPublishedVault(renderProofBoard(run), artifactPaths), 'utf8');

  const files = [indexHtml];
  for (const file of vaultManifest.files) {
    const relative = path.relative(vaultManifest.rootDir, file);
    const copied = path.join(publishedVaultDir, relative);
    files.push(copied);
  }

  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest: StaticPublishManifest = { rootDir, indexHtml, files: [...files, manifestPath] };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  await readFile(indexHtml, 'utf8');
  return manifest;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderPublishedIndex(input: PublishedIndexInput): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Doppl Published Previews</title>
  <style>
    :root {
      --ink: #172033;
      --muted: #5d6880;
      --line: #d9e1ee;
      --paper: #f7f9fc;
      --panel: #ffffff;
      --blue: #2357d6;
      --blue-soft: #eaf0ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background: var(--paper);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    main {
      width: min(960px, calc(100% - 40px));
      margin: 0 auto;
      padding: 56px 0;
    }
    h1 {
      margin: 0;
      font-size: clamp(34px, 6vw, 64px);
      line-height: 1;
      letter-spacing: 0;
    }
    p { color: var(--muted); max-width: 700px; }
    a {
      display: block;
      margin-top: 28px;
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--ink);
      background: var(--panel);
      text-decoration: none;
    }
    a:hover,
    a:focus {
      outline: none;
      border-color: var(--blue);
      background: var(--blue-soft);
    }
    strong { display: block; font-size: 22px; }
    code {
      display: inline-block;
      margin-top: 6px;
      color: var(--blue);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Doppl Published Previews</h1>
    <p>Static, secret-free previews generated from deterministic kernel artifacts.</p>
    <a href="${escapeHtml(input.kernelHref)}">
      <strong>${escapeHtml(input.kernelTitle)}</strong>
      <code>${escapeHtml(input.runId)}</code>
    </a>
  </main>
</body>
</html>`;
}

export async function writePublishedIndex(
  rootDir: string,
  input: PublishedIndexInput,
): Promise<string> {
  await mkdir(rootDir, { recursive: true });
  const indexPath = path.join(rootDir, 'index.html');
  await writeFile(indexPath, renderPublishedIndex(input), 'utf8');
  return indexPath;
}
