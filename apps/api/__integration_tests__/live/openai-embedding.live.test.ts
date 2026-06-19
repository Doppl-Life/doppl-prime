import { describe, expect, test } from "vitest";
import { createOpenAIEmbeddingAdapter } from "../../src/model-gateway/adapters/openai-embedding.js";
import { defaultRoutes } from "../../src/model-gateway/default-routes.js";

const liveEnabled = process.env.DOPPL_LIVE_TESTS === "1";
const hasKey = Boolean(process.env.OPENAI_API_KEY);

const maybe = liveEnabled && hasKey ? describe : describe.skip;

maybe("LIVE — OpenAI text-embedding-3-small (gated by DOPPL_LIVE_TESTS=1 + OPENAI_API_KEY)", () => {
  test("returns a 1536-dim vector for a short input", async () => {
    const adapter = createOpenAIEmbeddingAdapter({
      env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
    });
    const result = await adapter.invoke(defaultRoutes.embedding, {
      role: "embedding",
      runId: "live_test",
      input: { text: "hello world" },
      correlationId: "live_corr",
    });
    const out = result.rawOutput as {
      vector: number[];
      dimension: number;
      embeddingModelId: string;
    };
    expect(out.dimension).toBe(1536);
    expect(out.vector).toHaveLength(1536);
    expect(out.embeddingModelId).toBe("text-embedding-3-small");
  });
});
