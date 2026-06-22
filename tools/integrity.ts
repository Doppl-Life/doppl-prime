import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type PackageJson = {
  scripts?: Record<string, string>;
};

const requiredScripts = [
  'typecheck',
  'proof',
  'build',
  'proof:export',
  'case-study:lint',
  'serve',
  'publish:html',
  'serve:static',
];

const requiredPaths = [
  '.gitignore',
  'AGENTS.md',
  'README.md',
  'MEMORY.md',
  'package.json',
  'src/trace.ts',
  'src/contracts/index.ts',
  'tools/run.ts',
  'tools/serve.ts',
  'tools/publish.ts',
  'tools/static-server.ts',
  'tools/integrity.ts',
  'published/assay.html',
  'published/microscope.html',
  'published/architecture.html',
  'published/architecture-v2.html',
  'specs/runtime-kernel.md',
  'specs/artifacts-deploy.md',
];

const requiredGitignoreEntries = [
  '.env',
  '.env.*',
  'node_modules/',
  'out/',
  'published/index.html',
  'records/assay-judgments/*.jsonl',
];

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function main(): void {
  const failures: string[] = [];
  const packageJson = readJson<PackageJson>(path.join(root, 'package.json'));
  const scripts = packageJson.scripts || {};

  for (const script of requiredScripts) {
    if (!scripts[script]) failures.push(`missing package script: ${script}`);
  }
  for (const script of Object.keys(scripts)) {
    if (!requiredScripts.includes(script)) failures.push(`unblessed package script: ${script}`);
  }
  for (const requiredPath of requiredPaths) {
    if (!existsSync(path.join(root, requiredPath))) failures.push(`missing required path: ${requiredPath}`);
  }
  const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const entry of requiredGitignoreEntries) {
    if (!gitignore.split(/\r?\n/).includes(entry)) failures.push(`.gitignore missing: ${entry}`);
  }

  if (failures.length) {
    console.error(`integrity failed: ${failures.length}`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`integrity passed: scripts=${requiredScripts.length}; paths=${requiredPaths.length}`);
}

main();
