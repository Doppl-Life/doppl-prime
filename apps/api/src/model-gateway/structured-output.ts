import type { ZodTypeAny, z } from "zod";
import type { AppendEventInput, AppendEventResult } from "../event-store/append.js";

/**
 * Per ARCHITECTURE.md §9 and IMPLEMENTATION_PLAN.md P2.4, every model
 * output is validated against its Zod schema and either:
 *  - accepted on first try, or
 *  - repaired ONCE (the adapter is invoked again with the validation
 *    error in the prompt), or
 *  - rejected with an `output_schema_rejected` event.
 *
 * The function NEVER retries more than once. Failed attempts do NOT
 * debit energy (the gateway's success-only invariant is preserved
 * because this function never calls `appendEvent("energy.spent", ...)`).
 *
 * `repair` is a callback the gateway constructs — typically a closure
 * over the adapter that appends the validation error to the prompt.
 */
export interface StructuredOutputContext {
  appendEvent: (input: AppendEventInput) => Promise<AppendEventResult>;
  runId: string;
  correlationId: string;
  role: string;
  routeId: string;
  generationId?: string;
  agenomeId?: string;
  candidateId?: string;
  langfuseTraceId?: string;
  langfuseObservationId?: string;
}

export type StructuredOutputResult<T> =
  | { ok: true; output: T; repairAttempts: 0 | 1 }
  | { ok: false; validationError: string; repairAttempts: 1 };

function formatZodError(error: z.ZodError): string {
  return error.errors.map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`).join("; ");
}

/**
 * Coerce model output into an object before schema validation. The
 * OpenRouter/OpenAI adapter returns `completion.choices[0].message.content`
 * verbatim — a JSON string when the model is asked to "return JSON".
 * Zod object schemas reject strings ("Expected object, received string"),
 * so without this step every critic / subtype_check / final_judge call
 * fails validation despite the model returning valid JSON.
 *
 * Strips markdown code fences (```json ... ```) before parsing because
 * some routes emit JSON wrapped in a markdown block.
 */
function coerceToObject(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence?.[1] !== undefined) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    return raw;
  }
}

export async function pipeStructuredOutput<S extends ZodTypeAny>(opts: {
  raw: unknown;
  schema: S;
  repair: () => Promise<unknown>;
  ctx: StructuredOutputContext;
}): Promise<StructuredOutputResult<z.infer<S>>> {
  const { raw, schema, repair, ctx } = opts;

  const first = schema.safeParse(coerceToObject(raw));
  if (first.success) {
    return { ok: true, output: first.data, repairAttempts: 0 };
  }

  const firstError = formatZodError(first.error);
  // Repair attempt — the adapter call. If it throws, the error propagates
  // (the gateway treats it as an adapter failure).
  const repaired = await repair();

  const second = schema.safeParse(coerceToObject(repaired));
  if (second.success) {
    return { ok: true, output: second.data, repairAttempts: 1 };
  }

  const secondError = formatZodError(second.error);
  const combined = `first: [${firstError}] | repair: [${secondError}]`;

  // Emit output_schema_rejected. Failed validation does NOT debit energy.
  await ctx.appendEvent({
    runId: ctx.runId,
    type: "output_schema_rejected",
    actor: "runtime",
    payload: {
      reason: "Model output failed schema validation after one repair attempt",
      validationError: combined,
      role: ctx.role,
    },
    correlationId: ctx.correlationId,
    ...(ctx.generationId !== undefined ? { generationId: ctx.generationId } : {}),
    ...(ctx.agenomeId !== undefined ? { agenomeId: ctx.agenomeId } : {}),
    ...(ctx.candidateId !== undefined ? { candidateId: ctx.candidateId } : {}),
    ...(ctx.langfuseTraceId !== undefined ? { langfuseTraceId: ctx.langfuseTraceId } : {}),
    ...(ctx.langfuseObservationId !== undefined
      ? { langfuseObservationId: ctx.langfuseObservationId }
      : {}),
  });

  return { ok: false, validationError: combined, repairAttempts: 1 };
}
