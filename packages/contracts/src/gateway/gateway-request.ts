import { z } from 'zod';
import { ModelRole } from './model-role';
import { SamplingParams } from './sampling-params';
import { ToolDescriptor, ToolCallRequest, ToolName } from './tool';

/**
 * ChatRole — the CLOSED chat-message role union (ARCHITECTURE.md §6). DISTINCT from {@link ModelRole}
 * (which routes the call): this is the role of one message inside a `messages` array. The rule-#5
 * isolation puts untrusted candidate text in a `user` message (wrapped via `wrapUntrusted`).
 *
 * Deliberately KEPT 3-member across the tool-use epic: the multi-turn tool conversation's extra message
 * variants (assistant-tool-call echo + tool-result) ride the {@link ChatMessage} union SEPARATELY, never
 * as new `ChatRole` members — so the trusted(system)/untrusted(user) isolation reasoning (rule #5) rests on
 * an unchanged closed 3-member set.
 */
export const ChatRole = z.enum(['system', 'user', 'assistant']);

export type ChatRole = z.infer<typeof ChatRole>;

/**
 * ChatMessage — one entry in a gateway `messages` array. A union of three strict variants, disjoint by
 * key/role so a malformed entry can't masquerade as another:
 *  - the TRUSTED/UNTRUSTED chat message `{role: ChatRole, content}` (system|user|assistant) — UNCHANGED;
 *  - (TU.5) an assistant-tool-call echo `{role:'assistant', content, toolCalls[≥1]}` — the model's
 *    requested calls re-sent on the next turn so the provider keeps multi-turn context (the OpenRouter
 *    protocol requires echoing the assistant tool_calls before the tool results);
 *  - (TU.5) a tool-result `{role:'tool', toolCallId, toolName, content}` — an executed tool's result
 *    carried as DATA. The tool-orchestrator wraps `content` via `wrapUntrusted` before it lands here
 *    (rule #5 — a tool result, esp. fetched web content, is the prime injection vector).
 * The `'tool'` literal does NOT widen {@link ChatRole}; a bare `{role:'tool', content}` (missing the
 * tool-result fields) still rejects. `content` is a uniform `string` on every variant (empty allowed on
 * the tool-use variants) so a consumer reading `message.content` sees no union-induced `| undefined`.
 */
const ChatMessageEntry = z.strictObject({ role: ChatRole, content: z.string().min(1) });

const AssistantToolCallEntry = z.strictObject({
  role: z.literal('assistant'),
  content: z.string(),
  toolCalls: z.array(ToolCallRequest).min(1),
});

const ToolResultEntry = z.strictObject({
  role: z.literal('tool'),
  toolCallId: z.string().min(1),
  toolName: ToolName,
  content: z.string(),
});

export const ChatMessage = z.union([ChatMessageEntry, AssistantToolCallEntry, ToolResultEntry]);

export type ChatMessage = z.infer<typeof ChatMessage>;

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
    messages: z.array(ChatMessage).optional(),
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
