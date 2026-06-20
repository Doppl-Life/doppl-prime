// P0.12 — ModelGatewayRequest: the ONLY request surface domain code uses (ARCHITECTURE.md §6). No
// vendor SDK type leaks; the gateway port speaks exactly this. spec(§6): role is a ModelRole; the
// prompt content is EXACTLY ONE of `prompt` (string) or `messages` (chat array). spec(§14): carries
// NO credential field (env-only) — pinned by strict.
import { describe, it, expect } from 'vitest';
import { ModelGatewayRequest } from '@doppl/contracts';

const validPromptRequest = {
  role: 'critic',
  prompt: 'Evaluate this candidate for factual grounding.',
};

const validMessagesRequest = {
  role: 'population_generator',
  messages: [
    { role: 'system', content: 'You are an idea-generating agent.' },
    { role: 'user', content: 'Generate a cross-domain transfer idea.' },
  ],
};

describe('ModelGatewayRequest — the only request seam (spec §6/§14)', () => {
  it('gateway_request_strict_and_role', () => {
    // positive guard first (lesson §10): a prompt request and a messages request both round-trip;
    // schema?/maxTokens? are omittable; the full request parses.
    expect(ModelGatewayRequest.parse(validPromptRequest)).toEqual(validPromptRequest);
    expect(ModelGatewayRequest.parse(validMessagesRequest)).toEqual(validMessagesRequest);
    const full = {
      role: 'critic',
      prompt: 'Evaluate.',
      schema: { type: 'object' },
      maxTokens: 1024,
    };
    expect(ModelGatewayRequest.parse(full)).toEqual(full);

    // role is a ModelRole — a bad role is rejected.
    expect(() => ModelGatewayRequest.parse({ ...validPromptRequest, role: 'judge' })).toThrow();

    // EXACTLY ONE of prompt/messages: both present → rejected; neither → rejected.
    expect(() =>
      ModelGatewayRequest.parse({
        role: 'critic',
        prompt: 'x',
        messages: validMessagesRequest.messages,
      }),
    ).toThrow();
    expect(() => ModelGatewayRequest.parse({ role: 'critic' })).toThrow();

    // messages chat-role is closed (system|user|assistant); a bad chat role rejected; each entry's
    // content is a non-empty string (an empty message has no legitimate MVP use).
    expect(() =>
      ModelGatewayRequest.parse({ role: 'critic', messages: [{ role: 'tool', content: 'x' }] }),
    ).toThrow();
    expect(() =>
      ModelGatewayRequest.parse({ role: 'critic', messages: [{ role: 'user', content: '' }] }),
    ).toThrow();

    // maxTokens is a positive integer when present.
    expect(() => ModelGatewayRequest.parse({ ...validPromptRequest, maxTokens: 0 })).toThrow();
    expect(() => ModelGatewayRequest.parse({ ...validPromptRequest, maxTokens: 1.5 })).toThrow();

    // strict + §14: unknown field rejected; a credential field is unrepresentable.
    expect(() => ModelGatewayRequest.parse({ ...validPromptRequest, bogus: 1 })).toThrow();
    expect(() =>
      ModelGatewayRequest.parse({ ...validPromptRequest, apiKey: 'sk-secret' }),
    ).toThrow();
    expect(() => ModelGatewayRequest.parse({ ...validPromptRequest, secret: 'x' })).toThrow();
  });
});
