import { describe, expect, test } from "vitest";
import { spec } from "../../testing/spec-tag.js";
import { REDACTION_PLACEHOLDER, redact } from "../redaction.js";

describe(`${spec("§14")} redaction placeholder constant`, () => {
  test("REDACTION_PLACEHOLDER is exactly '[REDACTED]'", () => {
    expect(REDACTION_PLACEHOLDER).toBe("[REDACTED]");
  });
});

describe(`${spec("§14")} redact() — happy paths`, () => {
  test("returns structurally-equivalent payload when no secrets present", () => {
    const input = {
      runId: "run_1",
      sequence: 5,
      payload: { nested: { ok: true }, list: [1, 2, 3] },
    };
    const out = redact(input);
    expect(out).toEqual(input);
  });

  test("preserves null, undefined, numbers, booleans, empty string", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact(0)).toBe(0);
    expect(redact(false)).toBe(false);
    expect(redact("")).toBe("");
  });
});

describe(`${spec("§14")} redact() — pattern matches`, () => {
  test("redacts an sk-... key inside a string", () => {
    const out = redact({ msg: "the key is sk-abcdefghijklmnopqrstuvwxyz0123" });
    expect(out).toEqual({ msg: `the key is ${REDACTION_PLACEHOLDER}` });
  });

  test("redacts a Bearer token", () => {
    const out = redact({ header: "Authorization: Bearer abc.def-GHI_jkl" });
    const msg = (out as { header: string }).header;
    expect(msg.includes("abc.def-GHI_jkl")).toBe(false);
    expect(msg.includes(REDACTION_PLACEHOLDER)).toBe(true);
  });

  test("redacts OPENAI_API_KEY env-style assignment", () => {
    const out = redact("OPENAI_API_KEY=sk-realsecretvalue1234567890abc");
    expect(out).toBe(REDACTION_PLACEHOLDER);
  });

  test("redacts OPENROUTER_API_KEY env-style assignment", () => {
    const out = redact("OPENROUTER_API_KEY=or-realsecretvalue1234567890");
    expect(out).toBe(REDACTION_PLACEHOLDER);
  });

  test("redacts ANTHROPIC_API_KEY env-style assignment", () => {
    const out = redact("ANTHROPIC_API_KEY=sk-ant-xyz-1234567890abcdefghij");
    expect(out).toBe(REDACTION_PLACEHOLDER);
  });

  test("redacts generic apiKey=value", () => {
    const out = redact("apiKey=verysecret123456");
    expect(out).toBe(REDACTION_PLACEHOLDER);
  });

  test("redacts generic token: value", () => {
    const out = redact("token: verysecrettokenvalue");
    expect(out).toBe(REDACTION_PLACEHOLDER);
  });
});

describe(`${spec("§14")} redact() — key-name heuristic`, () => {
  test("redacts the entire value when key is a known secret name", () => {
    const out = redact({
      apiKey: "literally-any-string",
      api_key: "literally-any-string",
      authorization: "Bearer literally-any-string",
      secret: "literally-any-string",
      token: "literally-any-string",
      password: "literally-any-string",
    });
    expect(out).toEqual({
      apiKey: REDACTION_PLACEHOLDER,
      api_key: REDACTION_PLACEHOLDER,
      authorization: REDACTION_PLACEHOLDER,
      secret: REDACTION_PLACEHOLDER,
      token: REDACTION_PLACEHOLDER,
      password: REDACTION_PLACEHOLDER,
    });
  });

  test("key-name match is case-insensitive", () => {
    const out = redact({ Authorization: "Bearer xyz", APIKey: "sk-anything" });
    expect(out).toEqual({
      Authorization: REDACTION_PLACEHOLDER,
      APIKey: REDACTION_PLACEHOLDER,
    });
  });

  test("non-secret keys with secret-looking string values still get pattern-redacted", () => {
    const out = redact({ note: "saw sk-abcdefghijklmnopqrstuvwxyz0123 in logs" });
    expect((out as { note: string }).note.includes("sk-abcdefghijklmnopqrstuvwxyz0123")).toBe(
      false,
    );
  });
});

describe(`${spec("§14")} redact() — nesting and arrays`, () => {
  test("recurses into nested objects", () => {
    const out = redact({
      runId: "run_1",
      provider: { name: "openai", apiKey: "real-secret-value-1234" },
    });
    expect(out).toEqual({
      runId: "run_1",
      provider: { name: "openai", apiKey: REDACTION_PLACEHOLDER },
    });
  });

  test("recurses into arrays", () => {
    const out = redact({
      logs: ["ok", "Bearer abc.def-GHI_jkl", { secret: "redact-me" }],
    });
    expect(out).toEqual({
      logs: ["ok", expect.any(String), { secret: REDACTION_PLACEHOLDER }],
    });
    const second = (out as { logs: string[] }).logs[1];
    expect(second?.includes("abc.def-GHI_jkl")).toBe(false);
  });

  test("preserves object key order and non-secret values", () => {
    const input = { z: 1, a: "ok", m: { x: "y", apiKey: "secret" } };
    const out = redact(input) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["z", "a", "m"]);
    expect(out.z).toBe(1);
    expect(out.a).toBe("ok");
  });
});

describe(`${spec("§14")} redact() — idempotency invariant`, () => {
  test("redact(redact(x)) deep-equals redact(x) for several fixtures", () => {
    const fixtures: unknown[] = [
      { apiKey: "real-secret-1234" },
      "Bearer abc.def-GHI_jkl",
      { logs: ["sk-abcdefghijklmnopqrstuvwxyz0123", { token: "t" }] },
      "plain text with no secrets",
      { mixed: { runId: "r1", auth: "Authorization: Bearer xyz" } },
    ];
    for (const fx of fixtures) {
      const once = redact(fx);
      const twice = redact(once);
      expect(twice).toEqual(once);
    }
  });
});

describe(`${spec("§14")} redact() — safety invariant (REQ-S-004)`, () => {
  test("for fixtures containing known secret patterns, the secret substring is absent from the serialized output", () => {
    const secrets = [
      "sk-abcdefghijklmnopqrstuvwxyz0123",
      "or-realsecretvalue1234567890",
      "Bearer abc.def-GHI_jkl",
    ];
    const fixtures = secrets.map((s) => ({
      seenIn: [`logs: ${s}`, { apiKey: s, nested: { token: s } }],
    }));
    for (let i = 0; i < fixtures.length; i++) {
      const fx = fixtures[i];
      const secret = secrets[i];
      const out = redact(fx);
      const serialized = JSON.stringify(out);
      expect(serialized.includes(secret as string)).toBe(false);
    }
  });
});
