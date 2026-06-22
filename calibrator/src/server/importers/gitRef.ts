import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot } from "../vaultPaths";

const execFileAsync = promisify(execFile);

export async function readGitRefText(ref: string, path: string): Promise<string | null> {
  try {
    const result = await execFileAsync("git", ["-C", repoRoot, "show", `${ref}:${path}`], {
      maxBuffer: 1024 * 1024 * 4,
    });
    return result.stdout;
  } catch {
    return null;
  }
}

export async function readGitRefCommit(ref: string): Promise<string> {
  try {
    const result = await execFileAsync("git", ["-C", repoRoot, "rev-parse", ref]);
    return result.stdout.trim();
  } catch {
    return "unavailable";
  }
}
