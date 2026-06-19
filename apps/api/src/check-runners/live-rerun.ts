import type { CheckResult } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { replayReader } from "../event-store/replay-reader.js";
import type { CheckCtx, CheckRegistry } from "./registry.js";
import { runCheck } from "./run-check.js";

/**
 * Live allowlisted-check re-run affordance (IMPLEMENTATION_PLAN.md
 * P4.11, REQ-E-003). For the demo, the operator can re-run a winning
 * candidate's allowlisted check live against the live retrieval source
 * (Phase 2). On stall / failure, falls back to the most recent persisted
 * `check.completed` for that (candidateId, adapterId) — never auto-
 * fabricated.
 *
 * The live re-run reuses the U2 `runCheck` path with `ctx.mode = "live"`.
 * Adapters that don't support live mode silently ignore the flag (it's
 * opaque to them); only the two retrieval-using adapters
 * (transfer.prior_art, zeitgeist.current_signal_grounding) actually
 * change behaviour under it. For the MVP shipped here, the live flag is
 * propagated but the adapters themselves still read from the recorded
 * corpus — Phase D wires live Tavily / Brave retrieval.
 *
 * SAFETY: the live re-run is gated to a sub-allowlist of adapter IDs.
 * Adapters NOT on this list — gateway-routed critic-style checks, for
 * instance — return `skipped` with `not_live_rerunnable:<id>` and emit
 * NO event (operator-initiated, not part of the run's evidence log).
 */

export const LIVE_RERUNNABLE_ADAPTER_IDS: ReadonlySet<string> = new Set([
  "transfer.allowlisted_executable",
  "transfer.prior_art",
  "zeitgeist.current_signal_grounding",
]);

export interface RerunCheckInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>;
  registry: CheckRegistry;
  adapterId: string;
  candidateId: string;
  candidate: unknown;
  runId: string;
  correlationId: string;
  generationId?: string;
  agenomeId?: string;
  extras?: Record<string, unknown>;
  checkCtxDeps?: Record<string, unknown>;
  timeoutMs?: number;
}

export type RerunCheckOutcome =
  | { ok: true; result: CheckResult; mode: "live" }
  | { ok: true; result: CheckResult; mode: "replay_fallback" }
  | { ok: false; reason: "not_live_rerunnable" | "no_recorded_fallback" };

const DEFAULT_TIMEOUT_MS = Number(process.env.DOPPL_LIVE_RERUN_TIMEOUT_MS ?? "30000");

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`live-rerun timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function findLatestRecordedResult(
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>,
  runId: string,
  candidateId: string,
  adapterId: string,
): Promise<CheckResult | null> {
  let latest: CheckResult | null = null;
  for await (const env of replayReader(db).events(runId)) {
    if (env.type !== "check.completed") continue;
    if (env.candidateId !== candidateId) continue;
    const payload = env.payload as { result: CheckResult };
    if (
      payload.result.checkType === adapterId ||
      payload.result.checkType === adapterIdToCheckType(adapterId)
    ) {
      latest = payload.result;
    }
  }
  return latest;
}

function adapterIdToCheckType(adapterId: string): string {
  // U7/U8 adapters use adapterId === checkType, so the comparison above
  // matches without translation. Provided as a hook in case future
  // adapters diverge their id from checkType.
  return adapterId;
}

export async function rerunCheck(input: RerunCheckInput): Promise<RerunCheckOutcome> {
  if (!LIVE_RERUNNABLE_ADAPTER_IDS.has(input.adapterId)) {
    return { ok: false, reason: "not_live_rerunnable" };
  }
  if (!input.registry.has(input.adapterId)) {
    // Adapter is on live-rerunnable list but not in this registry.
    // Treat as a missing adapter and try the replay fallback before
    // giving up.
    const recorded = await findLatestRecordedResult(
      input.db,
      input.runId,
      input.candidateId,
      input.adapterId,
    );
    if (recorded) return { ok: true, result: recorded, mode: "replay_fallback" };
    return { ok: false, reason: "no_recorded_fallback" };
  }

  const ctx: CheckCtx = {
    mode: "live",
    ...(input.checkCtxDeps !== undefined ? { deps: input.checkCtxDeps } : {}),
  };

  try {
    const result = await withTimeout(
      runCheck({
        db: input.db,
        registry: input.registry,
        adapterId: input.adapterId,
        candidateId: input.candidateId,
        candidate: input.candidate,
        ctx,
        runId: input.runId,
        correlationId: input.correlationId,
        ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
        ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
        ...(input.extras !== undefined ? { extras: input.extras } : {}),
      }),
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    return { ok: true, result, mode: "live" };
  } catch (_err) {
    const recorded = await findLatestRecordedResult(
      input.db,
      input.runId,
      input.candidateId,
      input.adapterId,
    );
    if (recorded) {
      return { ok: true, result: recorded, mode: "replay_fallback" };
    }
    return { ok: false, reason: "no_recorded_fallback" };
  }
}
