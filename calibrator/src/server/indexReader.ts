import { readAgardenIndex } from "./agardenReader";
import { readVaultIndex } from "./vaultReader";
import { defaultAgardenRoot, defaultVaultRoot } from "./vaultPaths";
import type { CalibratorIndex } from "../types";

export async function readDefaultCalibratorIndex(): Promise<CalibratorIndex> {
  try {
    return await readAgardenIndex(defaultAgardenRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Falling back to calibration-vault index: ${message}`);
    const index = await readVaultIndex(defaultVaultRoot);
    return { ...index, source_kind: "vault" };
  }
}
