import type { RunEventEnvelope } from "@doppl/contracts";

/**
 * Per-run energy accumulator (P3.5). Maintains the in-process sum of
 * persisted `energy.spent` events and gates pre-call estimates against
 * the run's `energyBudget`. Crash-forward safe: the accumulator is
 * rebuilt from `replayReader` at construction, so a process restart
 * never loses the count.
 *
 * The ledger does NOT persist events itself. The gateway is the only
 * emitter of `energy.spent` (success-only per ARCHITECTURE.md §4).
 */

interface ReplayReaderLike {
  events(runId: string): AsyncIterable<Pick<RunEventEnvelope, "type" | "payload">>;
}

export interface EnergyLedger {
  /** Returns false when accumulator + estimate would exceed budget. */
  estimateAllowed(estimate: number): boolean;
  /** Add a reconciled `actual` to the accumulator (gateway already persisted the event). */
  reconcile(actual: number): void;
  /** Current accumulator value in doppl_energy. */
  current(): number;
}

export interface CreateEnergyLedgerOptions {
  runId: string;
  budget: number;
  replayReader: ReplayReaderLike;
}

interface EnergySpentPayloadShape {
  energy?: { actual?: number };
}

function isEnergySpentPayload(payload: unknown): payload is EnergySpentPayloadShape {
  return typeof payload === "object" && payload !== null;
}

export async function createEnergyLedger(
  options: CreateEnergyLedgerOptions,
): Promise<EnergyLedger> {
  let accumulator = 0;
  // Rebuild from persisted events at construction.
  for await (const env of options.replayReader.events(options.runId)) {
    if (env.type !== "energy.spent") continue;
    if (!isEnergySpentPayload(env.payload)) continue;
    const actual = env.payload.energy?.actual;
    if (typeof actual === "number" && Number.isFinite(actual)) {
      accumulator += actual;
    }
  }

  return {
    estimateAllowed(estimate: number): boolean {
      return accumulator + estimate <= options.budget;
    },
    reconcile(actual: number): void {
      accumulator += actual;
    },
    current(): number {
      return accumulator;
    },
  };
}
