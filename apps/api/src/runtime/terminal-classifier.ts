import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../event-store/replay-reader.js";

/**
 * Run terminal classification (P3.11). Pure read against the persisted
 * event log via `replayReader`. Returns one of `completed | stopped |
 * failed | cancelled | running` plus a partial terminal summary
 * capturing counts the dashboard cares about (generations completed,
 * candidate creations, cullings, the operator-supplied terminal reason).
 *
 * Per ARCHITECTURE.md §3, the classifier rule is:
 *   - `run.completed` event present → 'completed'.
 *   - `run.stopped` event present → 'stopped'.
 *   - `run.failed` event OR `energy_exhausted` / `generation_failed`
 *     without a subsequent `run.completed` → 'failed'.
 *   - `run.cancelled` event → 'cancelled'.
 *   - Otherwise → 'running' (the run has not reached a terminal state).
 *
 * Provider failures (`provider_call_failed`) by themselves never
 * terminate a run; they're just operational noise the run survives.
 */

export type TerminalStatus = "completed" | "stopped" | "failed" | "cancelled" | "running";

export interface TerminalSummary {
  generationsCompleted: number;
  candidatesCreated: number;
  cullingsCount: number;
  terminalReason?: string;
}

export interface TerminalClassification {
  status: TerminalStatus;
  summary: TerminalSummary;
}

interface PayloadWithReason {
  reason?: string;
}

interface PayloadWithTerminalSummary {
  terminalSummary?: string;
  reason?: string;
}

export async function classifyTerminal(
  runId: string,
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>,
): Promise<TerminalClassification> {
  let status: TerminalStatus = "running";
  let terminalReason: string | undefined;
  let generationsCompleted = 0;
  let candidatesCreated = 0;
  let cullingsCount = 0;

  for await (const env of replayReader(db).events(runId)) {
    switch (env.type) {
      case "run.completed": {
        status = "completed";
        const p = env.payload as PayloadWithTerminalSummary;
        terminalReason = p.terminalSummary;
        break;
      }
      case "run.stopped": {
        if (status === "running" || status === "failed") {
          status = "stopped";
        }
        const p = env.payload as PayloadWithReason;
        terminalReason = p.reason ?? terminalReason;
        break;
      }
      case "run.failed": {
        if (status === "running") {
          status = "failed";
        }
        const p = env.payload as PayloadWithReason;
        terminalReason = p.reason ?? terminalReason;
        break;
      }
      case "energy_exhausted":
      case "generation_failed": {
        if (status === "running") {
          status = "failed";
        }
        const p = env.payload as PayloadWithReason;
        terminalReason = p.reason ?? terminalReason;
        break;
      }
      case "generation.completed":
        generationsCompleted += 1;
        break;
      case "candidate.created":
        candidatesCreated += 1;
        break;
      case "lineage.culled":
        cullingsCount += 1;
        break;
      default:
        break;
    }
  }

  const summary: TerminalSummary = {
    generationsCompleted,
    candidatesCreated,
    cullingsCount,
    ...(terminalReason !== undefined ? { terminalReason } : {}),
  };

  return { status, summary };
}
