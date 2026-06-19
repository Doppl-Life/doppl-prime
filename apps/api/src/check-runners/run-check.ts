import { randomUUID } from "node:crypto";
import { CheckResult } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { appendEvent } from "../event-store/append.js";
import type { CheckCtx, CheckInput, CheckRegistry } from "./registry.js";

/**
 * `runCheck` — single entry point for all non-live check execution
 * (ARCHITECTURE.md §7, IMPLEMENTATION_PLAN.md P4.5). Every invocation
 * — pass, fail, or skip — produces a schema-valid CheckResult and emits
 * exactly one `check.completed` event. Lookup misses and adapter throws
 * never silently pass; they land as `skipped` or `failed` with a reason.
 *
 * Live re-runs go through `live-rerun.ts` (U10), which calls back into
 * this function with `ctx.mode = "live"` for adapters on the
 * live-rerunnable sub-allowlist.
 */

export interface RunCheckInput {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle dialect-generic
  db: NodePgDatabase<any>;
  registry: CheckRegistry;
  adapterId: string;
  candidateId: string;
  candidate: unknown;
  ctx?: CheckCtx;
  runId: string;
  correlationId: string;
  generationId?: string;
  agenomeId?: string;
  extras?: Record<string, unknown>;
}

function buildResult(
  partial: Omit<CheckResult, "id" | "candidateId">,
  candidateId: string,
): CheckResult {
  // Build with id stamped, validate via CheckResult.parse to enforce the
  // closed shape (the refine guarantees skipReason on skipped).
  const candidate: CheckResult = {
    ...partial,
    id: `chk_${randomUUID()}`,
    candidateId,
  } as CheckResult;
  return CheckResult.parse(candidate);
}

export async function runCheck(input: RunCheckInput): Promise<CheckResult> {
  const ctx: CheckCtx = input.ctx ?? { mode: "recorded" };
  const registered = input.registry.get(input.adapterId);

  let result: CheckResult;

  if (!registered) {
    result = buildResult(
      {
        checkType: "unregistered",
        status: "skipped",
        skipReason: `adapter_not_registered:${input.adapterId}`,
        evidenceRefs: [],
      },
      input.candidateId,
    );
  } else {
    try {
      const partial = await registered.fn(
        {
          candidate: input.candidate,
          ...(input.extras !== undefined ? { extras: input.extras } : {}),
        },
        ctx,
      );
      result = buildResult(partial, input.candidateId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = buildResult(
        {
          checkType: registered.adapter.checkType,
          status: "failed",
          error: msg,
          evidenceRefs: [],
        },
        input.candidateId,
      );
    }
  }

  await appendEvent(input.db, {
    runId: input.runId,
    type: "check.completed",
    actor: "runtime",
    payload: { result },
    correlationId: input.correlationId,
    candidateId: input.candidateId,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    ...(input.agenomeId !== undefined ? { agenomeId: input.agenomeId } : {}),
  });

  return result;
}
