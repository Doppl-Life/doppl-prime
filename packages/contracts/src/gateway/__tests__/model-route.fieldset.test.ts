import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { ModelRole, ModelRoleValues } from "../model-role.js";
import { ModelRoute } from "../model-route.js";
import { ProviderCapability } from "../provider-capability.js";

describe(`${spec("§9")} ModelRole 6-member union`, () => {
  test("is closed", () => {
    expect([...ModelRoleValues].sort()).toMatchInlineSnapshot(`
      [
        "critic",
        "embedding",
        "final_judge",
        "fusion_synthesis",
        "population_generator",
        "subtype_check",
      ]
    `);
    for (const r of ModelRoleValues) expect(ModelRole.parse(r)).toBe(r);
    expect(() => ModelRole.parse("reviewer")).toThrow();
  });
});

describe(`${spec("§9")} ProviderCapability`, () => {
  test("has exactly the 4 capability fields", () => {
    expect(fieldset(ProviderCapability)).toMatchInlineSnapshot(`
      [
        "embeddings",
        "streaming",
        "structuredOutputs",
        "toolCalling",
      ]
    `);
  });

  test("requires all 4 booleans (.strict)", () => {
    expect(
      ProviderCapability.parse({
        structuredOutputs: true,
        toolCalling: true,
        embeddings: false,
        streaming: true,
      }),
    ).toBeDefined();
    expect(() =>
      ProviderCapability.parse({
        structuredOutputs: true,
        toolCalling: true,
        embeddings: false,
      }),
    ).toThrow();
  });
});

describe(`${spec("§9")} ModelRoute`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(ModelRoute)).toMatchInlineSnapshot(`
      [
        "capabilities",
        "fallbackRouteIds",
        "modelId",
        "provider",
        "role",
      ]
    `);
  });

  test("parses a valid route", () => {
    const r = {
      role: "critic",
      provider: "openrouter",
      modelId: "anthropic/claude-3.5-sonnet",
      capabilities: {
        structuredOutputs: true,
        toolCalling: true,
        embeddings: false,
        streaming: true,
      },
      fallbackRouteIds: ["openai-fallback"],
    };
    expect(ModelRoute.parse(r)).toEqual(r);
  });
});
