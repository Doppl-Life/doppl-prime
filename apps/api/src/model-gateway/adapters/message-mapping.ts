import type { ChatMessage } from '@doppl/contracts';

/**
 * TU.5 — translate the contract `ChatMessage` union → OpenAI-compatible provider messages. Both the
 * OpenRouter and Ollama adapters speak the OpenAI chat shape, so this single mapper serves both (lesson §5,
 * extract-at-the-2nd-consumer). The multi-turn tool conversation's two extra contract variants map to the
 * provider's tool protocol WITHOUT leaking a vendor SDK type (rule #9 — OUR vendor-free shape):
 *  - an assistant-tool-call echo → `{role:'assistant', content, tool_calls:[{id, type:'function', function}]}`
 *  - a tool-result → `{role:'tool', tool_call_id, content}` (the content is already `wrapUntrusted` DATA).
 */

export interface ProviderToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ProviderChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string; tool_calls: ProviderToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** Map one contract `ChatMessage` to its OpenAI-compatible provider shape. */
export function toProviderMessage(message: ChatMessage): ProviderChatMessage {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === 'assistant' && 'toolCalls' in message) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

export function toProviderMessages(messages: readonly ChatMessage[]): ProviderChatMessage[] {
  return messages.map(toProviderMessage);
}
