import type { Agenome } from "@doppl/contracts";
import type { ModelGateway } from "../../model-gateway/gateway.js";

/**
 * Output-level synthesis (P5.9). Calls the gateway under
 * role=fusion_synthesis to merge two parents' systemPrompts into a
 * single child prompt. Returns `null` if the gateway call fails — the
 * caller (U8 fuse orchestrator) falls back to crossover-only inheritance
 * (i.e., the systemPrompt from parentA).
 *
 * The fusion_synthesis input shape `{ messages: [{ role:'system' },
 * { role:'user', parents }] }` is documented by Phase 2's gateway
 * adapter. Provider trace IDs flow back to the caller for persistence
 * in the agenome.fused event.
 */

export interface OutputSynthesisInput {
  gateway: ModelGateway;
  parentA: Agenome;
  parentB: Agenome;
  runId: string;
  correlationId: string;
  generationId?: string;
}

export interface OutputSynthesisResult {
  synthesizedPrompt: string;
  providerTraceId?: string;
  langfuseObservationId?: string;
}

const FUSION_SYSTEM =
  "You synthesize one new agent system prompt from two parent prompts. Preserve the strongest interpretive moves from each parent while resolving any tension between them. Return only the new system prompt as plain text.";

export async function synthesizeFusedPrompt(
  input: OutputSynthesisInput,
): Promise<OutputSynthesisResult | null> {
  try {
    const response = await input.gateway.invoke({
      role: "fusion_synthesis",
      runId: input.runId,
      correlationId: input.correlationId,
      ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
      input: {
        messages: [
          { role: "system", content: FUSION_SYSTEM },
          {
            role: "user",
            content: `Parent A:\n${input.parentA.systemPrompt}\n\nParent B:\n${input.parentB.systemPrompt}`,
          },
        ],
      },
    });
    if (!response.ok) return null;
    const out = response.output;
    let prompt: string | null = null;
    if (typeof out === "string") {
      prompt = out;
    } else if (typeof out === "object" && out !== null) {
      const shape = out as { content?: unknown; text?: unknown };
      if (typeof shape.content === "string") prompt = shape.content;
      else if (typeof shape.text === "string") prompt = shape.text;
    }
    if (!prompt || prompt.length === 0) return null;
    return {
      synthesizedPrompt: prompt,
      ...(response.providerTraceId !== undefined
        ? { providerTraceId: response.providerTraceId }
        : {}),
      ...(response.langfuseObservationId !== undefined
        ? { langfuseObservationId: response.langfuseObservationId }
        : {}),
    };
  } catch (_err) {
    return null;
  }
}
