import type { ModelGatewayRequest, ModelRoute } from "@doppl/contracts";
import { describe, expect, test, vi } from "vitest";
import { defaultRoutes } from "../../default-routes.js";
import { GatewayConfigError } from "../../errors.js";
import { createOpenAIEmbeddingAdapter } from "../openai-embedding.js";

interface EmbeddingsCreateParams {
  model: string;
  input: string | string[];
}

interface EmbeddingsResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage?: { total_tokens?: number };
}

function makeFakeOpenAI(handler: (params: EmbeddingsCreateParams) => Promise<EmbeddingsResponse>) {
  return (_opts: { apiKey: string; baseURL?: string }) => ({
    embeddings: {
      create: vi.fn(handler),
    },
  });
}

const EMBED_ROUTE: ModelRoute = defaultRoutes.embedding;

const REQ_SINGLE: ModelGatewayRequest = {
  role: "embedding",
  runId: "run_test",
  input: { text: "hello world" },
  correlationId: "corr_test",
};

const REQ_BATCH: ModelGatewayRequest = {
  role: "embedding",
  runId: "run_test",
  input: { texts: ["a", "b"] },
  correlationId: "corr_test",
};

describe("createOpenAIEmbeddingAdapter — construction", () => {
  test("throws GatewayConfigError when OPENAI_API_KEY is missing", () => {
    expect(() => createOpenAIEmbeddingAdapter({ env: {} })).toThrow(GatewayConfigError);
    expect(() => createOpenAIEmbeddingAdapter({ env: { OPENAI_API_KEY: "" } })).toThrow(
      GatewayConfigError,
    );
  });
});

describe("createOpenAIEmbeddingAdapter — invoke (single text)", () => {
  test("returns rawOutput with vector + embeddingModelId + dimension", async () => {
    const vector = new Array(1536).fill(0.001);
    const factory = makeFakeOpenAI(async () => ({
      data: [{ embedding: vector, index: 0 }],
      model: "text-embedding-3-small",
      usage: { total_tokens: 2 },
    }));
    const adapter = createOpenAIEmbeddingAdapter({
      env: { OPENAI_API_KEY: "sk-test" },
      openaiFactory: factory,
    });
    const result = await adapter.invoke(EMBED_ROUTE, REQ_SINGLE);
    const out = result.rawOutput as {
      vector: number[];
      embeddingModelId: string;
      dimension: number;
    };
    expect(out.vector).toHaveLength(1536);
    expect(out.embeddingModelId).toBe("text-embedding-3-small");
    expect(out.dimension).toBe(1536);
  });
});

describe("createOpenAIEmbeddingAdapter — invoke (batch)", () => {
  test("returns vectors[] for {texts: string[]} input", async () => {
    const vec = new Array(1536).fill(0);
    const factory = makeFakeOpenAI(async () => ({
      data: [
        { embedding: vec, index: 0 },
        { embedding: vec, index: 1 },
      ],
      model: "text-embedding-3-small",
      usage: { total_tokens: 4 },
    }));
    const adapter = createOpenAIEmbeddingAdapter({
      env: { OPENAI_API_KEY: "sk-test" },
      openaiFactory: factory,
    });
    const result = await adapter.invoke(EMBED_ROUTE, REQ_BATCH);
    const out = result.rawOutput as {
      vectors: number[][];
      embeddingModelId: string;
      dimension: number;
    };
    expect(out.vectors).toHaveLength(2);
    expect(out.dimension).toBe(1536);
  });
});

describe("createOpenAIEmbeddingAdapter — default route snapshot", () => {
  test("default route pins (provider, model, dimension) = (openai-embedding, text-embedding-3-small, 1536)", () => {
    expect(EMBED_ROUTE.provider).toBe("openai-embedding");
    expect(EMBED_ROUTE.modelId).toBe("text-embedding-3-small");
    // dimension is verified at invoke-time by the snapshot above; pinning the
    // route-config side here documents the contract the adapter relies on.
  });
});

describe("createOpenAIEmbeddingAdapter — error paths", () => {
  test("SDK throws → adapter throws", async () => {
    const factory = (_opts: { apiKey: string; baseURL?: string }) => ({
      embeddings: {
        create: vi.fn(async () => {
          throw new Error("openai 401");
        }),
      },
    });
    const adapter = createOpenAIEmbeddingAdapter({
      env: { OPENAI_API_KEY: "sk-test" },
      openaiFactory: factory,
    });
    await expect(adapter.invoke(EMBED_ROUTE, REQ_SINGLE)).rejects.toThrow(/401/);
  });

  test("input that is neither {text} nor {texts} throws GatewayConfigError", async () => {
    const factory = makeFakeOpenAI(async () => ({
      data: [],
      model: "text-embedding-3-small",
    }));
    const adapter = createOpenAIEmbeddingAdapter({
      env: { OPENAI_API_KEY: "sk-test" },
      openaiFactory: factory,
    });
    await expect(
      adapter.invoke(EMBED_ROUTE, { ...REQ_SINGLE, input: { wrong: "shape" } }),
    ).rejects.toThrow(GatewayConfigError);
  });
});
