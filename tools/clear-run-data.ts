// Clears disposable local run artifacts while preserving committed publish snapshots.
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { label: 'out/**', path: path.join(root, 'out') },
];

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function main(): Promise<void> {
  const cleared: string[] = [];
  for (const target of targets) {
    if (await exists(target.path)) cleared.push(target.label);
    await rm(target.path, { recursive: true, force: true });
  }
  console.log(`cleared run data: ${cleared.length ? cleared.join(', ') : 'nothing to clear'}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
