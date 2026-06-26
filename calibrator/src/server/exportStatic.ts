import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot } from "./vaultPaths";

const sourcePath = join(repoRoot, "calibrator/dist");
const outputPath = join(repoRoot, "published/calibrator");

await rm(outputPath, { recursive: true, force: true });
await mkdir(outputPath, { recursive: true });
await cp(sourcePath, outputPath, { recursive: true });
await mkdir(join(outputPath, "agora"), { recursive: true });
const indexHtml = await readFile(join(sourcePath, "index.html"), "utf8");
const nestedRouteHtml = indexHtml
  .replaceAll('href="./favicon.svg"', 'href="../favicon.svg"')
  .replaceAll('src="./assets/', 'src="../assets/')
  .replaceAll('href="./assets/', 'href="../assets/')
  .replaceAll('src="./calibrator-config.js"', 'src="../calibrator-config.js"');
await writeFile(join(outputPath, "agora/index.html"), nestedRouteHtml, "utf8");
await writeFile(join(outputPath, ".nojekyll"), "", "utf8");

console.log(`Exported ${sourcePath} -> ${outputPath}`);
