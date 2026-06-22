import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot } from "./vaultPaths";

const sourcePath = join(repoRoot, "calibrator/dist");
const outputPath = join(repoRoot, "published/calibrator");

await rm(outputPath, { recursive: true, force: true });
await mkdir(outputPath, { recursive: true });
await cp(sourcePath, outputPath, { recursive: true });
await writeFile(join(outputPath, ".nojekyll"), "", "utf8");

console.log(`Exported ${sourcePath} -> ${outputPath}`);
