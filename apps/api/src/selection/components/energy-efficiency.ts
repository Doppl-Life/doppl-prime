import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../../event-store/replay-reader.js";

/**
 * Energy-efficiency component (P5.4). Reads success-only `energy.spent`
 * events from the persisted log for one agenome and returns
 * `1 / (1 + totalActualSpend)` in `[0, 1]`. The success-only invariant
 * is structural — `provider_call_failed` never produces `energy.spent`
 * per the Phase 2 gateway and Phase 0 EnergyEvent contract — so a flaky
 * provider never penalizes an agenome here.
 *
 * Zero successful spend → 1.0 (the defined boundary value). An agenome
 * that hasn't actually spent any energy yet is maximally efficient.
 */

interface EnergySpentPayload {
  energy?: {
    agenomeId?: string;
    actual?: number;
    estimate?: number;
  };
}

export interface EnergyEfficiencyInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  runId: string;
  agenomeId: string;
}

export async function energyEfficiencyForAgenome(input: EnergyEfficiencyInput): Promise<number> {
  let total = 0;
  for await (const env of replayReader(input.db).events(input.runId)) {
    if (env.type !== "energy.spent") continue;
    const payload = env.payload as EnergySpentPayload;
    const energy = payload.energy;
    if (!energy) continue;
    if (energy.agenomeId !== input.agenomeId) continue;
    total += energy.actual ?? energy.estimate ?? 0;
  }
  return 1 / (1 + total);
}
