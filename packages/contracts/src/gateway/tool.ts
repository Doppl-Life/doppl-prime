import { z } from 'zod';

/**
 * Tool-use surface (tool-use TU.1, sv9→10; ARCHITECTURE.md §6, KEY SAFETY RULES #3 + #5 + #6).
 *
 * Agents do their own research (web + X + YouTube) to generate ideas. The tools are offered to the model
 * ONLY on the `population_generator` route (rule #6 — the held-out judge / critics never receive tools, so
 * the evaluation/scoring anchor is structurally unreachable from tool-use and stays byte-identical across
 * the bump). The shapes here are the gateway WIRE contract; no vendor SDK type leaks (rule #9).
 */

/**
 * ToolName — the FROZEN allowlist of agent-callable research tools (KEY SAFETY RULE #3). A closed 4-member
 * union, so an unlisted/arbitrary tool is unrepresentable — the same allowlist discipline as the
 * check-runner registry (`CheckRunnerAdapter`, lesson §11/§39). Any other value is rejected.
 */
export const ToolName = z.enum(['web_search', 'fetch_url', 'x_search', 'youtube_search']);

export type ToolName = z.infer<typeof ToolName>;

/**
 * ToolDescriptor — a NON-EXECUTING descriptor for one offered tool (rule #3 BY SHAPE). `z.strictObject` of
 * pure descriptor fields, so any code-carrying field (`exec`/`command`/`handler`/`fn`/`script`/`code` …) is
 * unrepresentable — rejected as unknown (lesson §11, the `CheckRunnerAdapter` technique). `name` is the
 * closed {@link ToolName}; `description` is the model-facing one-liner. The tool's parameter JSON-schema is
 * NOT here — it lives in the runtime tool registry (model-gateway) keyed by name, so the contract stays
 * closed + minimal and the descriptor carries no executable surface.
 */
export const ToolDescriptor = z.strictObject({
  name: ToolName,
  description: z.string().min(1),
});

export type ToolDescriptor = z.infer<typeof ToolDescriptor>;

/**
 * ToolCallRequest — one tool call the model REQUESTED (the {@link ModelGatewayResponse} tool-call surface,
 * and the assistant-message echo re-sent on the next turn so the provider keeps context). `id` correlates
 * the result; `name` is the closed {@link ToolName}; `arguments` is the RAW provider JSON-arg STRING kept
 * as a string — it is DATA, never interpolated as code (rule #5). The orchestrator parses it only inside
 * the SSRF/allowlist guard. Strict — no extra wire fields (e.g. a provider `type`) leak in.
 */
export const ToolCallRequest = z.strictObject({
  id: z.string().min(1),
  name: ToolName,
  arguments: z.string(),
});

export type ToolCallRequest = z.infer<typeof ToolCallRequest>;
