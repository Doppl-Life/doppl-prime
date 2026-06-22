import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { KernelRun } from './contracts.ts';
import { renderProofBoard } from './proof-board.ts';
import { exportRunToVault } from './vault-export.ts';

export type StaticPublishManifest = {
  rootDir: string;
  indexHtml: string;
  files: string[];
};

function linkPublishedVault(html: string): string {
  return html.replace(
    '</header>',
    `<p><a href="published-vault/" aria-label="Published vault artifacts">published-vault/</a></p>
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
  await writeFile(indexHtml, linkPublishedVault(renderProofBoard(run)), 'utf8');

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
