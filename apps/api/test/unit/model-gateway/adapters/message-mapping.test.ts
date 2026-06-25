// TU.5 — the contract `ChatMessage` union → OpenAI-compatible provider message mapper (shared by the
// OpenRouter + Ollama adapters, lesson §5). Rule #9: OUR vendor-free shape, no SDK type. The two multi-turn
// tool variants map to the provider's tool protocol; the trusted/untrusted chat messages pass through.
import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@doppl/contracts';
import { toProviderMessages } from '../../../../src/model-gateway/adapters/message-mapping';

describe('toProviderMessages (TU.5)', () => {
  it('maps system/user/assistant + the assistant-tool-call echo + the tool-result', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'web_search', arguments: '{"q":"x"}' }],
      },
      { role: 'tool', toolCallId: 'c1', toolName: 'web_search', content: 'result text' },
    ];
    expect(toProviderMessages(messages)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{"q":"x"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: 'result text' },
    ]);
  });

  it('a plain assistant message (no toolCalls) maps to {role, content}, not a tool-call echo', () => {
    expect(toProviderMessages([{ role: 'assistant', content: 'just text' }])).toEqual([
      { role: 'assistant', content: 'just text' },
    ]);
  });
});
