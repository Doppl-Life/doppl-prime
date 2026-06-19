import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelGatewayRequest, ModelRoute } from "@doppl/contracts";
import { describe, expect, test, vi } from "vitest";
import { GatewayConfigError } from "../../errors.js";
import { createRetrievalAdapter } from "../retrieval.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.resolve(
  here,
  "..",
  "..",
  "..",
  "..",
  "__fixtures__",
  "recorded-responses",
  "retrieval",
  "corpus",
  "retrieval-corpus.json",
);

const RETRIEVAL_ROUTE: ModelRoute = {
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
};

const REQ: ModelGatewayRequest = {
  role: "subtype_check",
  runId: "run_test",
  input: { query: "evolution and diversity" },
  correlationId: "corr_test",
};

describe("createRetrievalAdapter — construction", () => {
  test("constructs without TAVILY_API_KEY (corpus-only mode)", () => {
    expect(() =>
      createRetrievalAdapter({
        env: {},
        corpusPath: CORPUS_PATH,
      }),
    ).not.toThrow();
  });

  test("throws when the corpus file is missing or malformed", () => {
    expect(() =>
      createRetrievalAdapter({
        env: {},
        corpusPath: "/nonexistent/path.json",
      }),
    ).toThrow(GatewayConfigError);
  });
});

describe("createRetrievalAdapter — Tavily primary", () => {
  test("happy path: Tavily returns results → source='tavily'", async () => {
    const fakeFetch = vi.fn(
      async (_url: string | URL | Request): Promise<Response> =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "live result",
                content: "from Tavily",
                url: "https://x",
                score: 0.99,
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    const adapter = createRetrievalAdapter({
      env: { TAVILY_API_KEY: "tav-test" },
      corpusPath: CORPUS_PATH,
      fetchFn: fakeFetch,
    });
    const result = await adapter.invoke(RETRIEVAL_ROUTE, REQ);
    const out = result.rawOutput as { source: string; results: unknown[]; query: string };
    expect(out.source).toBe("tavily");
    expect(out.results).toHaveLength(1);
    expect(out.query).toBe("evolution and diversity");
    expect(result.energyEstimate).toBe(1);
  });
});

describe("createRetrievalAdapter — corpus fallback", () => {
  test("Tavily times out → falls back to corpus; matching query returns results", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    });
    const adapter = createRetrievalAdapter({
      env: { TAVILY_API_KEY: "tav-test" },
      corpusPath: CORPUS_PATH,
      fetchFn: fakeFetch,
    });
    const result = await adapter.invoke(RETRIEVAL_ROUTE, REQ);
    const out = result.rawOutput as { source: string; results: unknown[] };
    expect(out.source).toBe("corpus");
    expect(out.results.length).toBeGreaterThan(0);
  });

  test("Tavily 401 → corpus fallback (treats auth as config issue, not hard fail)", async () => {
    const fakeFetch = vi.fn(async (): Promise<Response> => new Response("nope", { status: 401 }));
    const adapter = createRetrievalAdapter({
      env: { TAVILY_API_KEY: "tav-test" },
      corpusPath: CORPUS_PATH,
      fetchFn: fakeFetch,
    });
    const result = await adapter.invoke(RETRIEVAL_ROUTE, REQ);
    expect((result.rawOutput as { source: string }).source).toBe("corpus");
  });

  test("query with no corpus match → corpus source with empty results", async () => {
    const adapter = createRetrievalAdapter({
      env: {}, // no Tavily, force corpus
      corpusPath: CORPUS_PATH,
    });
    const result = await adapter.invoke(RETRIEVAL_ROUTE, {
      ...REQ,
      input: { query: "absolutely-no-match-anywhere" },
    });
    const out = result.rawOutput as { source: string; results: unknown[] };
    expect(out.source).toBe("corpus");
    expect(out.results).toHaveLength(0);
  });

  test("no Tavily key → goes straight to corpus", async () => {
    const adapter = createRetrievalAdapter({
      env: {},
      corpusPath: CORPUS_PATH,
    });
    const result = await adapter.invoke(RETRIEVAL_ROUTE, REQ);
    expect((result.rawOutput as { source: string }).source).toBe("corpus");
  });
});

describe("createRetrievalAdapter — input shape", () => {
  test("throws GatewayConfigError when input is not { query: string }", async () => {
    const adapter = createRetrievalAdapter({
      env: {},
      corpusPath: CORPUS_PATH,
    });
    await expect(
      adapter.invoke(RETRIEVAL_ROUTE, { ...REQ, input: { wrong: "shape" } }),
    ).rejects.toThrow(GatewayConfigError);
  });
});
