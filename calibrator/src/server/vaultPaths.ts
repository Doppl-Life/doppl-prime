import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
export const defaultVaultRoot = join(repoRoot, "calibration-vault");

export function caseRoot(vaultRoot: string, caseId: string): string {
  return join(vaultRoot, "cases", caseId);
}

export function ratingsRoot(vaultRoot: string, caseId: string): string {
  return join(caseRoot(vaultRoot, caseId), "ratings");
}

export function ratingsLedgerPath(vaultRoot: string): string {
  return join(vaultRoot, "ratings-ledger.jsonl");
}
