import { resolve } from "node:path";
import { defaultVaultRoot } from "../vaultPaths";
import { importKernelRunFile } from "./kernelRunMarkdown";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const input = argValue("--input");
  if (!input) {
    throw new Error("Usage: tsx src/server/importers/importKernelRuns.ts --input <kernel-run.json> [--vault-root <path>]");
  }
  const vaultRoot = resolve(argValue("--vault-root") ?? defaultVaultRoot);
  const outputPaths = await importKernelRunFile(resolve(input), vaultRoot);
  for (const outputPath of outputPaths) {
    console.log(`Imported ${outputPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
