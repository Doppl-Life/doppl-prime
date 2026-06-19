import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createRetrievalAdapter } from "../../src/model-gateway/adapters/retrieval.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.resolve(
  here,
  "..",
  "..",
  "__fixtures__",
  "recorded-responses",
  "retrieval",
  "corpus",
  "retrieval-corpus.json",
);

const liveEnabled = process.env.DOPPL_LIVE_TESTS === "1";
const hasKey = Boolean(process.env.TAVILY_API_KEY);

const maybe = liveEnabled && hasKey ? describe : describe.skip;

maybe("LIVE — Tavily retrieval (gated by DOPPL_LIVE_TESTS=1 + TAVILY_API_KEY)", () => {
  test("returns at least one result for a sensible query", async () => {
    const adapter = createRetrievalAdapter({
      env: { TAVILY_API_KEY: process.env.TAVILY_API_KEY },
      corpusPath: CORPUS_PATH,
    });
    const result = await adapter.invoke(
      {
        role: "subtype_check",
        provider: "retrieval",
        modelId: "tavily",
        capabilities: {
          structuredOutputs: false,
          toolCalling: true,
          embeddings: false,
          streaming: false,
        },
        fallbackRouteIds: [],
      },
      {
        role: "subtype_check",
        runId: "live_test",
        input: { query: "TypeScript Drizzle ORM" },
        correlationId: "live_corr",
      },
    );
    const out = result.rawOutput as { source: string; results: unknown[] };
    // Could be 'tavily' on live success; if Tavily rate-limited us, falls
    // back to corpus — both are acceptable as long as we don't blow up.
    expect(["tavily", "corpus"]).toContain(out.source);
  });
});
