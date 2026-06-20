// P0.2 — secret-redaction scrub (persistence-boundary filter). spec(§14): KEY SAFETY RULE #4 /
// REQ-S-004 / RISK-006-009 — secrets never enter event payloads or Langfuse traces; one pure scrub
// runs before append AND before Langfuse emit. Tests pin the frozen scrubSecrets contract.
import { describe, it, expect } from 'vitest';
import { scrubSecrets, REDACTION_PLACEHOLDER } from '@doppl/contracts';

describe('scrubSecrets — secret redaction at the persistence boundary (spec §14)', () => {
  it('redacts_provider_key_value', () => {
    // spec(§14): provider-key formats (sk-, sk-or-, sk-ant-) are redacted by value pattern.
    const out = scrubSecrets({
      field: 'sk-or-v1-abcdef0123456789',
      other: 'sk-ant-api03-XYZ9876543210',
      third: 'sk-proj-abcdef0123456789',
    }) as Record<string, string>;
    expect(out.field).toBe(REDACTION_PLACEHOLDER);
    expect(out.other).toBe(REDACTION_PLACEHOLDER);
    expect(out.third).toBe(REDACTION_PLACEHOLDER);
  });

  it('pattern_preserves_dictionary_words', () => {
    // spec(§14): before-append corruption guard — `sk-` inside dictionary words (risk-, task-,
    // disk-, desk-) has no word boundary + no real-key length, so legit idea text is UNCHANGED.
    const out = scrubSecrets({
      a: 'risk-assessment',
      b: 'task-management',
      c: 'a disk-usage report and desk-work',
    }) as Record<string, string>;
    expect(out.a).toBe('risk-assessment');
    expect(out.b).toBe('task-management');
    expect(out.c).toBe('a disk-usage report and desk-work');
  });

  it('redacts_authorization_header_value', () => {
    // spec(§14): Authorization header credentials (Bearer <token>, Basic <base64>) are redacted.
    const out = scrubSecrets({
      h1: 'Bearer abcdefghij0123456789klmnopqrstuv',
      h2: 'Basic dXNlcjpwYXNzd29yZA==',
    }) as Record<string, string>;
    expect(out.h1).toBe(REDACTION_PLACEHOLDER);
    expect(out.h2).toBe(REDACTION_PLACEHOLDER);
  });

  it('bearer_basic_in_prose_not_redacted', () => {
    // spec(§14): the before-append corruption guard — short "Bearer"/"Basic" prose is NOT a
    // credential, so it must survive untouched (length gate, not just the keyword).
    const out = scrubSecrets({
      a: 'Bearer of bad news',
      b: 'Basic understanding of things',
    }) as Record<string, string>;
    expect(out.a).toBe('Bearer of bad news');
    expect(out.b).toBe('Basic understanding of things');
  });

  it('redacts_lowercase_authorization_scheme', () => {
    // spec(§14) SAFETY: Authorization schemes are case-insensitive (RFC 7235) — lowercase/upper
    // `bearer`/`BASIC` credentials embedded mid-value under a non-sensitive key must still redact.
    const out = scrubSecrets({
      log: 'bearer abcdefghij0123456789klmnopqrstuv',
      note: 'BASIC dXNlcjpwYXNzd29yZA==',
    }) as Record<string, string>;
    expect(out.log).toBe(REDACTION_PLACEHOLDER);
    expect(out.note).toBe(REDACTION_PLACEHOLDER);
  });

  it('redacts_value_under_sensitive_key_name', () => {
    // spec(§14): values under a sensitive key-name (case-insensitive contains) are redacted whole,
    // regardless of the value's format.
    const out = scrubSecrets({
      apiKey: 'plaintext-no-format',
      api_key: 'snake-case-value',
      Authorization: 'literally anything here',
      secret: 'xyz',
      token: 'abc',
      access_token: 'qqq',
      client_secret: 'www',
      password: 'hunter2',
    }) as Record<string, string>;
    for (const k of Object.keys(out)) {
      expect(out[k], `value under sensitive key ${k}`).toBe(REDACTION_PLACEHOLDER);
    }
  });

  it('sensitive_key_with_structured_value_fully_redacted', () => {
    // spec(§14): a sensitive key redacts its ENTIRE value regardless of type (string/object/array →
    // placeholder), so a format-less blob nested under a sensitive key cannot escape via recursion.
    const out = scrubSecrets({
      secret: { a: 'fmtless-blob-1', b: 'fmtless-blob-2' },
      authorization: ['fmtless-tok-x'],
    }) as Record<string, unknown>;
    expect(out.secret).toBe(REDACTION_PLACEHOLDER);
    expect(out.authorization).toBe(REDACTION_PLACEHOLDER);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('fmtless-blob-1');
    expect(serialized).not.toContain('fmtless-blob-2');
    expect(serialized).not.toContain('fmtless-tok-x');
  });

  it('redacts_secret_in_object_key', () => {
    // spec(§14) SAFETY: payload keys are arbitrary strings (z.record) — a provider key used AS a
    // key must not leak verbatim into the persisted log. The secret appears nowhere in the output.
    const KEY = 'sk-or-v1-deadbeefdeadbeef0123456789';
    expect(JSON.stringify(scrubSecrets({ [KEY]: 'v' }))).not.toContain(KEY);
    expect(JSON.stringify(scrubSecrets({ metadata: { [KEY]: 'count' } }))).not.toContain(KEY);
  });

  it('redacts_colliding_secret_keys_without_loss', () => {
    // spec(§14): two distinct provider-key-form keys both redact to a placeholder — they must NOT
    // collapse onto one property (the silent log-corruption failure mode); each value survives
    // under a distinct key (de-collided), so no entry is lost from the append-only truth.
    const out = scrubSecrets({
      'sk-or-v1-aaaaaaaaaaaaaaaaaaaa': { calls: 10 },
      'sk-or-v1-bbbbbbbbbbbbbbbbbbbb': { calls: 5 },
      'sk-ant-api03-cccccccccccccccc': { calls: 3 },
    }) as Record<string, { calls: number }>;
    expect(Object.keys(out)).toHaveLength(3);
    const calls = Object.values(out)
      .map((v) => v.calls)
      .sort((a, b) => a - b);
    expect(calls).toEqual([3, 5, 10]);
    // idempotent on the de-collided key path: re-scrubbing yields the same shape.
    expect(JSON.stringify(scrubSecrets(out))).toBe(JSON.stringify(out));
  });

  it('decollision_scales_linearly', () => {
    // spec(§14, §5): the scrub runs before every append — de-collision must be O(n) amortized, not
    // O(n²), so a payload with many provider-key-form sibling keys can't stall the append path.
    // (Under an O(n²) resolver this many colliding keys blows past the default test timeout.)
    const N = 20000;
    const payload: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      payload[`sk-or-v1-${String(i).padStart(24, '0')}`] = i;
    }
    const out = scrubSecrets(payload) as Record<string, number>;
    expect(Object.keys(out)).toHaveLength(N); // every entry de-collided → no data loss at scale
  });

  it('recurses_nested_objects_and_arrays', () => {
    // spec(§14): a secret at arbitrary depth (object → array → object) is redacted.
    const input = { a: { b: [{}, {}, { apiKey: 'plainvalue' }] } };
    const out = scrubSecrets(input) as { a: { b: Array<{ apiKey?: string }> } };
    expect(out.a.b[2]?.apiKey).toBe(REDACTION_PLACEHOLDER);
  });

  it('idempotent_double_scrub', () => {
    // spec(§14): scrub(scrub(x)) deep-equals scrub(x); the placeholder is never redacted again.
    const input = {
      apiKey: 'sk-secret-value-redacted-by-key-name',
      note: 'auth Bearer abcdefghij0123456789klmnop here',
      list: ['sk-or-v1-abcdef0123456789ABCDEF'],
    };
    const once = scrubSecrets(input);
    const twice = scrubSecrets(once);
    expect(twice).toEqual(once);
  });

  it('structure_preserving_non_secret_untouched', () => {
    // spec(§14): non-secret keys/values are byte-identical; no key dropped/added/reordered;
    // array length + order preserved.
    const input = {
      a: 1,
      b: 'plain text value',
      c: { d: [true, 'hello', null], e: 'nothing here' },
      f: [1, 2, 3],
    };
    const out = scrubSecrets(input);
    expect(out).toEqual(input);
    expect(Object.keys(out as Record<string, unknown>)).toEqual(['a', 'b', 'c', 'f']);
    expect(Object.keys((out as { c: Record<string, unknown> }).c)).toEqual(['d', 'e']);
  });

  it('does_not_mutate_input', () => {
    // spec(§14): pure function — the input object is deep-equal to its pre-call snapshot afterward.
    const input = {
      apiKey: 'sk-ant-secretvalue0123456',
      nested: { token: 'Bearer abc.def.ghi9876' },
    };
    const snapshot = structuredClone(input);
    scrubSecrets(input);
    expect(input).toEqual(snapshot);
  });

  it('preserves_proto_data_key', () => {
    // spec(§14): scrub output IS the persisted truth — a legitimate "__proto__" data key must
    // round-trip (no silent log corruption), with no prototype pollution.
    const input = JSON.parse('{"__proto__":{"realData":"keep me"},"keep":"ok"}') as Record<
      string,
      unknown
    >;
    const out = scrubSecrets(input);
    const serialized = JSON.stringify(out);
    expect(serialized).toContain('realData');
    expect(serialized).toContain('keep me');
    expect(({} as Record<string, unknown>).realData).toBeUndefined();
    // Output objects are normal-prototype (not null-proto), so they don't throw on string coercion
    // or break `instanceof`/`hasOwnProperty` in append-critical downstream code.
    expect(() => String(scrubSecrets({ a: 1 }))).not.toThrow();
  });

  it('placeholder_is_the_exported_constant', () => {
    // spec(§14): every redacted position holds exactly the exported REDACTION_PLACEHOLDER.
    const out = scrubSecrets({ apiKey: 'whatever' }) as { apiKey: string };
    expect(out.apiKey).toBe(REDACTION_PLACEHOLDER);
    expect(typeof REDACTION_PLACEHOLDER).toBe('string');
    expect(REDACTION_PLACEHOLDER.length).toBeGreaterThan(0);
  });

  it('non_string_leaves_passthrough', () => {
    // spec(§14): numbers, booleans, null pass through untouched (a provider key is always a string).
    const input = { n: 42, b: true, z: null, nested: { m: 3.14, flag: false } };
    expect(scrubSecrets(input)).toEqual(input);
  });

  it('no_secret_in_output_corpus', () => {
    // spec(§14) SAFETY (load-bearing): across a corpus (top-level, nested, in-array, under a
    // sensitive key with a non-format value, mid-string-embedded), the planted secret appears
    // NOWHERE in JSON.stringify(scrubSecrets(payload)). KEY SAFETY RULE #4 / REQ-S-004 / RISK-006-009.
    const KEY = 'sk-or-v1-deadbeefdeadbeef0123456789';
    const PLAIN = 'p@ssw0rd-no-recognizable-format-xyz';
    const cases: Array<{ planted: string; payload: unknown }> = [
      { planted: KEY, payload: KEY },
      { planted: KEY, payload: { nested: { deep: { value: KEY } } } },
      { planted: KEY, payload: { list: ['ok', KEY, 'fine'] } },
      { planted: PLAIN, payload: { password: PLAIN } },
      { planted: 'fmtless-obj-blob', payload: { secret: { inner: 'fmtless-obj-blob' } } },
      { planted: KEY, payload: { note: `the token is ${KEY} keep going` } },
    ];
    for (const { planted, payload } of cases) {
      const serialized = JSON.stringify(scrubSecrets(payload));
      expect(
        serialized ?? '',
        `planted secret leaked for payload ${JSON.stringify(payload)}`,
      ).not.toContain(planted);
    }
  });
});
