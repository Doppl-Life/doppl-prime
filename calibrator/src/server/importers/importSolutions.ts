import { writeImportedSolution } from "./solutionMarkdown";
import type { ImportAdapter, ImportSource } from "./importTypes";
import { defaultVaultRoot } from "../vaultPaths";

interface CliOptions {
  caseId: string;
  sources: ImportSource[];
  comparisonSetId: string;
  comparisonInputHash: string;
  comparisonInputPaths: string[];
}

const adapters: Partial<Record<ImportSource, ImportAdapter>> = {};

function parseArgs(argv: string[]): CliOptions {
  const getValue = (name: string) => {
    const prefix = `--${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const caseId = getValue("case") ?? "fsd-accident-economy";
  const sourceArg = getValue("source") ?? getValue("sources") ?? "michael,cody,melissa";
  const sources = sourceArg
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as ImportSource[];

  return {
    caseId,
    sources,
    comparisonSetId: getValue("comparison-set") ?? `${caseId}-v0`,
    comparisonInputHash: getValue("input-hash") ?? `sha256:fixture-${caseId}-v0`,
    comparisonInputPaths: [
      `calibration-vault/cases/${caseId}/case.md`,
      `calibration-vault/cases/${caseId}/problem.md`,
    ],
  };
}

export async function runImportSolutions(argv: string[] = process.argv.slice(2)): Promise<string[]> {
  const options = parseArgs(argv);
  const written: string[] = [];

  for (const source of options.sources) {
    const adapter = adapters[source];
    if (!adapter) {
      throw new Error(`No import adapter registered for source "${source}"`);
    }
    const result = await adapter({
      caseId: options.caseId,
      comparisonSetId: options.comparisonSetId,
      comparisonInputHash: options.comparisonInputHash,
      comparisonInputPaths: options.comparisonInputPaths,
    });
    for (const artifact of result.artifacts) {
      written.push(await writeImportedSolution(defaultVaultRoot, artifact));
    }
  }

  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runImportSolutions()
    .then((written) => {
      for (const path of written) console.log(`Wrote ${path}`);
      if (written.length === 0) console.log("No solution artifacts imported.");
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
