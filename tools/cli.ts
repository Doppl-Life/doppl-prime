import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isMain(importMetaUrl: string): boolean {
  return path.resolve(process.argv[1] ?? '') === fileURLToPath(importMetaUrl);
}

export function runMain(importMetaUrl: string, main: () => Promise<void>): void {
  if (!isMain(importMetaUrl)) return;
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
