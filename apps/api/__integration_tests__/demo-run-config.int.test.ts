import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RunConfig as RunConfigSchema } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import {
  CuratedPromptNotFoundError,
  EmptyPromptError,
  buildDemoConfig,
  listCuratedPrompts,
} from "../src/runtime/demo/demo-run-config.js";

const CURATED_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/curated-prompts",
);

describe("spec(§17, PD.5) buildDemoConfig", () => {
  test("prepared mode with valid problemId returns parseable RunConfig", async () => {
    const result = await buildDemoConfig({
      source: "prepared",
      problemId: "cross-domain-transfer",
      curatedPromptsDir: CURATED_DIR,
    });
    expect(result.source).toBe("prepared");
    expect(result.promptText.length).toBeGreaterThan(20);
    // Re-parse to confirm shape is canonical.
    expect(() => RunConfigSchema.parse(result.config)).not.toThrow();
    expect(result.config.enabledSubtypes).toEqual(["cross_domain_transfer"]);
  });

  test("prepared with unknown problemId throws CuratedPromptNotFoundError", async () => {
    await expect(
      buildDemoConfig({
        source: "prepared",
        problemId: "does-not-exist",
        curatedPromptsDir: CURATED_DIR,
      }),
    ).rejects.toThrow(CuratedPromptNotFoundError);
  });

  test("operator mode with 200-char prompt builds a valid config", async () => {
    const prompt = "a".repeat(200);
    const result = await buildDemoConfig({
      source: "operator",
      operatorPrompt: prompt,
    });
    expect(result.source).toBe("operator");
    expect(result.promptText).toBe(prompt);
    expect(() => RunConfigSchema.parse(result.config)).not.toThrow();
    // Long prompts are hashed for the seed (op- prefix).
    expect(result.config.seed.startsWith("op-")).toBe(true);
  });

  test("operator mode with short prompt uses prompt text as seed verbatim", async () => {
    const prompt = "short prompt text";
    const result = await buildDemoConfig({
      source: "operator",
      operatorPrompt: prompt,
    });
    expect(result.config.seed).toBe(prompt);
  });

  test("operator mode with empty prompt throws EmptyPromptError", async () => {
    await expect(
      buildDemoConfig({
        source: "operator",
        operatorPrompt: "",
      }),
    ).rejects.toThrow(EmptyPromptError);
    await expect(
      buildDemoConfig({
        source: "operator",
        operatorPrompt: "   \n\t  ",
      }),
    ).rejects.toThrow(EmptyPromptError);
  });

  test("capOverride flows through applyDemoOverride", async () => {
    const result = await buildDemoConfig({
      source: "operator",
      operatorPrompt: "anything",
      capOverride: { maxPopulation: 3 },
    });
    expect(result.config.caps.maxPopulation).toBe(3);
  });

  test("identical operator prompts produce identical configs (deterministic)", async () => {
    const a = await buildDemoConfig({ source: "operator", operatorPrompt: "identical prompt" });
    const b = await buildDemoConfig({ source: "operator", operatorPrompt: "identical prompt" });
    expect(a.config).toEqual(b.config);
  });
});

describe("spec(§17, PD.5) listCuratedPrompts", () => {
  test("returns the two seeded curated prompts", async () => {
    const list = await listCuratedPrompts(CURATED_DIR);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((p) => p.id).sort();
    expect(ids).toContain("cross-domain-transfer");
    expect(ids).toContain("zeitgeist-synthesis");
  });

  test("missing directory returns empty array", async () => {
    const list = await listCuratedPrompts("/tmp/doppl-does-not-exist-curated");
    expect(list).toEqual([]);
  });
});
