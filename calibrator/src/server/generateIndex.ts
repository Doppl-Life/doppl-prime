import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readVaultIndex } from "./vaultReader";
import { defaultVaultRoot, repoRoot } from "./vaultPaths";

const index = await readVaultIndex(defaultVaultRoot);
const outputPath = join(repoRoot, "calibrator/public/calibration-index.json");
await mkdir(join(repoRoot, "calibrator/public"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
