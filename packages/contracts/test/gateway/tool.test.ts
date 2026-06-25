// Tool-use surface (sv9→10) — the FROZEN agent-research tool allowlist (ARCHITECTURE.md §6, KEY SAFETY
// RULE #3). spec(§6): `ToolName` is the closed 4-member allowlist; `ToolDescriptor` is a NON-EXECUTING
// descriptor (no code field representable — rule #3 by shape, mirrors CheckRunnerAdapter lesson §11);
// `ToolCallRequest` carries the model's requested call (arguments kept as a raw JSON STRING = DATA, never
// code — rule #5). These attach ONLY to the population_generator route (rule #6 — verified at the loop).
import { describe, it, expect } from 'vitest';
import { ToolName, ToolDescriptor, ToolCallRequest } from '@doppl/contracts';

describe('ToolName — the frozen research-tool allowlist (spec §6, rule #3)', () => {
  it('tool_name_closed_four_member_set', () => {
    // positive guard first (lesson §10): every allowlisted member parses.
    for (const member of ['web_search', 'fetch_url', 'x_search', 'youtube_search'] as const) {
      expect(ToolName.parse(member)).toBe(member);
    }
    // the closed set is EXACTLY these four — no more, no fewer.
    expect([...ToolName.options].sort()).toEqual(
      ['fetch_url', 'web_search', 'x_search', 'youtube_search'].sort(),
    );
    // an unlisted tool is rejected (the allowlist gate, rule #3).
    expect(ToolName.safeParse('exec_shell').success).toBe(false);
    expect(ToolName.safeParse('eval').success).toBe(false);
    expect(ToolName.safeParse('').success).toBe(false);
  });
});

describe('ToolDescriptor — non-executing offered-tool descriptor (spec §6, rule #3)', () => {
  it('tool_descriptor_strict_non_executing', () => {
    const valid = {
      name: 'web_search',
      description: 'Search the public web for current information.',
    };
    expect(ToolDescriptor.parse(valid)).toEqual(valid);

    // `name` is a closed ToolName — an unlisted tool is rejected.
    expect(
      ToolDescriptor.safeParse({ name: 'rm_rf', description: 'delete everything' }).success,
    ).toBe(false);
    // description is a non-empty string.
    expect(ToolDescriptor.safeParse({ name: 'fetch_url', description: '' }).success).toBe(false);

    // rule #3 — non-executing BY SHAPE: a code-carrying field is unrepresentable (strict → unknown key
    // rejected). Mirrors the CheckRunnerAdapter pin (lesson §11).
    for (const codeField of ['exec', 'command', 'handler', 'fn', 'script', 'code', 'run']) {
      expect(
        ToolDescriptor.safeParse({ ...valid, [codeField]: 'payload' }).success,
        `code field ${codeField} must be rejected`,
      ).toBe(false);
    }
    // the field-set is frozen at exactly {name, description}.
    expect(Object.keys(ToolDescriptor.shape).sort()).toEqual(['description', 'name']);
  });
});

describe('ToolCallRequest — the model-requested call (spec §6, rule #5)', () => {
  it('tool_call_request_strict_arguments_are_data', () => {
    const valid = {
      id: 'call_abc123',
      name: 'web_search',
      arguments: '{"query":"latest battery chemistry"}',
    };
    expect(ToolCallRequest.parse(valid)).toEqual(valid);

    // `name` is a closed ToolName.
    expect(
      ToolCallRequest.safeParse({ id: 'c1', name: 'sql_query', arguments: '{}' }).success,
    ).toBe(false);
    // id is a non-empty string (correlates the result on the next turn).
    expect(ToolCallRequest.safeParse({ id: '', name: 'web_search', arguments: '{}' }).success).toBe(
      false,
    );
    // `arguments` is a STRING (the raw provider JSON-arg string — DATA, never parsed-as-code here). An
    // empty-string args is allowed (a no-arg tool); a non-string is rejected.
    expect(ToolCallRequest.parse({ id: 'c1', name: 'web_search', arguments: '' }).arguments).toBe(
      '',
    );
    expect(
      ToolCallRequest.safeParse({ id: 'c1', name: 'web_search', arguments: { query: 'x' } })
        .success,
    ).toBe(false);
    // strict — unknown field rejected.
    expect(ToolCallRequest.safeParse({ ...valid, type: 'function' }).success).toBe(false);
    expect(Object.keys(ToolCallRequest.shape).sort()).toEqual(['arguments', 'id', 'name']);
  });
});
