import { z } from 'zod';
import { ModelRole } from './model-role';
import { SamplingParams } from './sampling-params';
import { ToolDescriptor } from './tool';

/**
 * ChatRole — the CLOSED chat-message role union (ARCHITECTURE.md §6). DISTINCT from {@link ModelRole}
 * (which routes the call): this is the role of one message inside a `messages` array. The rule-#5
 * isolation puts untrusted candidate text in a `user` message (wrapped via `wrapUntrusted`).
 *
 * Deliberately KEPT 3-member across the tool-use epic (sv9→10): the multi-turn tool conversation's extra
 * message variants (assistant-tool-call echo + tool-result) are added in the tool-orchestrator slice
 * SEPARATELY, never as new `ChatRole` members — so the trusted(system)/untrusted(user) isolation reasoning
 * (rule #5) rests on an unchanged closed 3-member set.
 */
export const ChatRole = z.enum(['system', 'user', 'assistant']);

export type ChatRole = z.infer<typeof ChatRole>;

/**
 * ModelGatewayRequest — the ONLY request surface domain code uses (ARCHITECTURE.md §6, Appendix A line
 * 480). The gateway port speaks exactly this; no vendor SDK type leaks into domain/runtime modules.
 * Strict object.
 *
 * Prompt content is EXACTLY ONE of `prompt` (a single string) or `messages` (a chat array) — enforced
 * by a refine, so a request can't carry both or neither. `schema?` is an opaque structured-output
 * descriptor (the contract can't meaningfully type "a schema"). Carries NO credential field —
 * provider keys load from env only (KEY SAFETY RULE #4 / §14), unrepresentable by `strictObject`.
 */
export const ModelGatewayRequest = z
  .strictObject({
    role: ModelRole,
    prompt: z.string().min(1).optional(),
    messages: z.array(z.strictObject({ role: ChatRole, content: z.string().min(1) })).optional(),
    schema: z.unknown().optional(),
    maxTokens: z.int().positive().optional(),
    // FB.4 (sv7→8) — optional sampling params (the diverge/converge dial sets `temperature` on the
    // population_generator request ONLY; the judge/critic chokepoint never sets it — rule #6 SOLO).
    samplingParams: SamplingParams.optional(),
    // tool-use TU.1 (sv9→10) — the OPTIONAL allowlist of research tools offered to the model. Set ONLY on
    // the population_generator route (rule #6: a critic/judge request never carries it → never gets tool
    // calls back → byte-identical to pre-sv10). Absent → no tool-use (the byte-identical baseline).
    tools: z.array(ToolDescriptor).optional(),
  })
  .superRefine((value, ctx) => {
    const hasPrompt = value.prompt !== undefined;
    const hasMessages = value.messages !== undefined;
    if (hasPrompt === hasMessages) {
      ctx.addIssue({
        code: 'custom',
        message: 'exactly one of `prompt` or `messages` must be provided',
        path: ['prompt'],
      });
    }
  });

export type ModelGatewayRequest = z.infer<typeof ModelGatewayRequest>;
