import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REDACTION_PLACEHOLDER } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import { langfuseMetadata, persistedEventPayload } from "../redaction.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY_DIR = path.resolve(here, "..");

describe("persistedEventPayload — passes through @doppl/contracts redact()", () => {
  test("scrubs sk- pattern in nested strings", () => {
    const input = { provider: { apiKey: "sk-abcdefghijklmnopqrstuvwxyz0123" } };
    const out = persistedEventPayload(input) as { provider: { apiKey: string } };
    expect(out.provider.apiKey).toBe(REDACTION_PLACEHOLDER);
  });

  test("scrubs by key-name heuristic", () => {
    const out = persistedEventPayload({ secret: "anything" }) as Record<string, unknown>;
    expect(out.secret).toBe(REDACTION_PLACEHOLDER);
  });

  test("preserves non-secret values", () => {
    const input = { runId: "run_1", ok: true, count: 5 };
    expect(persistedEventPayload(input)).toEqual(input);
  });
});

describe("langfuseMetadata — same scrub at the side-channel boundary", () => {
  test("authorization header redacted", () => {
    const out = langfuseMetadata({ authorization: "Bearer sk-xxxrealsecret" });
    expect(out.authorization).toBe(REDACTION_PLACEHOLDER);
  });

  test("token field redacted", () => {
    const out = langfuseMetadata({ token: "tok_realsecret_value" });
    expect(out.token).toBe(REDACTION_PLACEHOLDER);
  });
});

describe("structural grep — gateway.ts appendEvent payloads flow through Phase 1 redaction", () => {
  test("gateway.ts uses eventStore.appendEvent (which redacts at write boundary per U5 Phase 1)", () => {
    const source = readFileSync(path.join(GATEWAY_DIR, "gateway.ts"), "utf8");
    // Every appendEvent invocation is via deps.eventStore.appendEvent — the
    // Phase 1 writer applies redact() at the persistence boundary.
    const matches = source.match(/eventStore\.appendEvent/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // Every CALLABLE appendEvent invocation in gateway.ts goes through
    // `eventStore.appendEvent(`. Interface / type declarations
    // (`appendEvent: ...`) are unrelated and excluded by the prefix.
    const callableInvocations =
      source.match(
        /\.eventStore\.appendEvent\(|deps\.eventStore\.appendEvent\(|eventStore\.appendEvent\(/g,
      ) ?? [];
    expect(callableInvocations.length).toBeGreaterThanOrEqual(2);
  });
});

describe("structural grep — langfuse.ts routes metadata through redaction at the emit boundary", () => {
  test("langfuse.ts imports the redaction helper or contracts-side redact()", () => {
    const source = readFileSync(path.join(GATEWAY_DIR, "langfuse.ts"), "utf8");
    // After U10 the file must consume one of: langfuseMetadata helper OR
    // the @doppl/contracts redact() directly.
    const hasRedaction = source.includes("langfuseMetadata") || source.includes("redact(");
    expect(hasRedaction).toBe(true);
  });
});
