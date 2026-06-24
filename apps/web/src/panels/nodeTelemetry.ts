import { JudgeResult, LlmCallTelemetry } from '../data/contracts';
import type { RunEventEnvelope } from '../data/contracts';

/**
 * nodeTelemetry (FV.5b) — the PURE event-derived DEEP-telemetry selectors the node inspector surfaces
 * (same events-derived pattern as the FV.5a panels / LESSONS §6). The deep telemetry the FB cluster
 * persisted lives in EVENTS, not the lineage projection, so the inspector folds them per node:
 *  - an AGENOME's `llm_call_telemetry` captures (FB.6 raw response/reasoning + FB.4 executed temperature)
 *    and its `tool_call.finished` detail (FB.7 query/result),
 *  - a CANDIDATE's held-out-judge per-axis rationale (FB.8 `JudgeResult.axisRationales`).
 *
 * EMIT-ONLY / read-only (rule #6/#9): every selector DISPLAYS the persisted, scrubbed payload VERBATIM —
 * it parses through the FROZEN Zod (a malformed/old payload is skipped defensively, never crashes the
 * drawer) and recomputes NOTHING. Replay-identical (rule #7): pure over the events already in the fold,
 * no provider call. The captures are already redaction-scrubbed at the persistence boundary (rule #4), so
 * the inspector shows the safe persisted text — it adds no new secret surface.
 */

export interface LlmCallView {
  /** The gateway routing role of the captured call (FB.6 captures `population_generator`). */
  readonly role: string;
  /** The raw model response (scrubbed + possibly truncated-with-marker at persistence). */
  readonly rawResponse: string;
  /** A distinct provider reasoning channel, when an adapter surfaced one (absent for OpenRouter today). */
  readonly rawReasoning?: string;
  /** The EXECUTED sampling temperature (the FB.4 diverge/converge dial's nudge), when the dial was engaged. */
  readonly temperature?: number;
  /** True iff a raw field was truncated-with-marker to fit under the payload ceiling. */
  readonly truncated: boolean;
}

export interface ToolCallView {
  readonly toolName: string;
  /** The actual tool query (FB.7), scrubbed + possibly truncated. Absent if the call surfaced none. */
  readonly query?: string;
  /** The (raw) tool result (FB.7), scrubbed + possibly truncated. Absent if the call surfaced none. */
  readonly result?: string;
}

export interface AgenomeTelemetry {
  readonly llmCalls: readonly LlmCallView[];
  readonly toolCalls: readonly ToolCallView[];
}

/**
 * The deep generation telemetry for one agenome: its `llm_call_telemetry` captures (FB.6/FB.4) + its
 * `tool_call.finished` detail (FB.7), in `sequence` order. Both match the agenome by the payload's
 * `agenomeId` (telemetry) or the envelope's `agenomeId` (the generic tool_call payload carries none).
 */
export function deriveAgenomeTelemetry(
  events: readonly RunEventEnvelope[],
  agenomeId: string,
): AgenomeTelemetry {
  const llmCalls: LlmCallView[] = [];
  const toolCalls: ToolCallView[] = [];
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (e.type === 'llm_call_telemetry') {
      const parsed = LlmCallTelemetry.safeParse(e.payload);
      if (!parsed.success) continue; // skip a malformed/older payload defensively (never crash the drawer)
      const aid = parsed.data.agenomeId ?? e.agenomeId;
      if (aid !== agenomeId) continue;
      llmCalls.push({
        role: parsed.data.role,
        rawResponse: parsed.data.rawResponse,
        ...(parsed.data.rawReasoning !== undefined
          ? { rawReasoning: parsed.data.rawReasoning }
          : {}),
        ...(parsed.data.samplingParams?.temperature !== undefined
          ? { temperature: parsed.data.samplingParams.temperature }
          : {}),
        truncated: parsed.data.truncated,
      });
    } else if (e.type === 'tool_call.finished') {
      if (e.agenomeId !== agenomeId) continue;
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      const toolName = typeof payload.toolName === 'string' ? payload.toolName : '';
      if (toolName === '') continue;
      toolCalls.push({
        toolName,
        ...(typeof payload.query === 'string' ? { query: payload.query } : {}),
        ...(typeof payload.result === 'string' ? { result: payload.result } : {}),
      });
    }
  }
  return { llmCalls, toolCalls };
}

export interface JudgeRationaleView {
  /** The held-out judge's per-axis one-line rationale (FB.8) — empty when the judge supplied none. */
  readonly axisRationales: Readonly<Record<string, string>>;
  /** The per-axis 0–5 scores the rationale explains (read verbatim — the dashboard re-ranks nothing). */
  readonly axisScores: Readonly<Record<string, number>>;
}

/**
 * The held-out judge's per-axis rationale + scores for one candidate, from the authoritative
 * `judge.reviewed`←`JudgeResult` event (FB.8). Highest `sequence` wins (the latest review). Null if the
 * candidate was never judged. EMIT-ONLY (rule #6): the rationale is the judge's EXPLANATION, displayed
 * verbatim; the dashboard never derives acceptance or re-ranks.
 */
export function deriveJudgeRationale(
  events: readonly RunEventEnvelope[],
  candidateId: string,
): JudgeRationaleView | null {
  let found: JudgeRationaleView | null = null;
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (e.type !== 'judge.reviewed') continue;
    const parsed = JudgeResult.safeParse(e.payload);
    if (!parsed.success || parsed.data.candidateId !== candidateId) continue;
    found = {
      axisRationales: parsed.data.axisRationales ?? {},
      axisScores: parsed.data.axisScores,
    }; // highest-sequence wins
  }
  return found;
}
