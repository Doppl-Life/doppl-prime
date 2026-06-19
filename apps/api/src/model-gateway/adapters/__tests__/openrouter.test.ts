import type { ModelGatewayRequest, ModelRoute } from "@doppl/contracts";
import { describe, expect, test, vi } from "vitest";
import { GatewayConfigError } from "../../errors.js";
import { createOpenRouterAdapter } from "../openrouter.js";

interface FakeOpenAIOptions {
  apiKey: string;
  baseURL?: string;
}

interface ChatCreateParams {
  model: string;
  messages: { role: string; content: string }[];
  response_format?: unknown;
}

interface ChatCompletion {
  id: string;
  choices: { message: { content: string } }[];
  usage: { total_tokens: number };
}

function makeFakeOpenAI(handler: (params: ChatCreateParams) => Promise<ChatCompletion>) {
  return (_opts: FakeOpenAIOptions) => ({
    chat: {
      completions: {
        create: vi.fn(handler),
      },
    },
  });
}

const GEN_ROUTE: ModelRoute = {
  role: "critic",
  provider: "openrouter",
  modelId: "anthropic/claude-3.5-sonnet",
  capabilities: {
    structuredOutputs: true,
    toolCalling: false,
    embeddings: false,
    streaming: true,
  },
  fallbackRouteIds: [],
};

const REQ: ModelGatewayRequest = {
  role: "critic",
  runId: "run_test",
  input: { prompt: "review this candidate" },
  correlationId: "corr_test",
};

describe("createOpenRouterAdapter — construction", () => {
  test("throws GatewayConfigError when OPENROUTER_API_KEY is missing", () => {
    expect(() => createOpenRouterAdapter({ env: {} })).toThrow(GatewayConfigError);
    expect(() => createOpenRouterAdapter({ env: { OPENROUTER_API_KEY: "" } })).toThrow(
      GatewayConfigError,
    );
  });

  test("constructs successfully when OPENROUTER_API_KEY is set", () => {
    expect(() =>
      createOpenRouterAdapter({
        env: { OPENROUTER_API_KEY: "or-test" },
        openaiFactory: makeFakeOpenAI(async () => ({
          id: "x",
          choices: [{ message: { content: "ok" } }],
          usage: { total_tokens: 100 },
        })),
      }),
    ).not.toThrow();
  });

  test("the OpenAI client is constructed with the OpenRouter baseURL", () => {
    let observedBase: string | undefined;
    const factory = (opts: FakeOpenAIOptions) => {
      observedBase = opts.baseURL;
      return {
        chat: {
          completions: {
            create: vi.fn(async () => ({
              id: "x",
              choices: [{ message: { content: "ok" } }],
              usage: { total_tokens: 1 },
            })),
          },
        },
      };
    };
    createOpenRouterAdapter({
      env: { OPENROUTER_API_KEY: "or-test" },
      openaiFactory: factory,
    });
    expect(observedBase).toBe("https://openrouter.ai/api/v1");
  });
});

describe("createOpenRouterAdapter — invoke happy path", () => {
  test("returns AdapterResult with content as rawOutput and tokens as energy", async () => {
    const factory = makeFakeOpenAI(async () => ({
      id: "completion_1",
      choices: [{ message: { content: '{"summary":"good","confidence":0.7}' } }],
      usage: { total_tokens: 1200 },
    }));
    const adapter = createOpenRouterAdapter({
      env: { OPENROUTER_API_KEY: "or-test" },
      openaiFactory: factory,
    });
    const result = await adapter.invoke(GEN_ROUTE, REQ);
    expect(result.rawOutput).toBe('{"summary":"good","confidence":0.7}');
    expect(result.providerTraceId).toBe("completion_1");
    // tokens/1000 = doppl_energy heuristic; ceil(1200/1000) = 2
    expect(result.energyActual).toBe(2);
    expect(result.energyEstimate).toBeGreaterThan(0);
  });
});

describe("createOpenRouterAdapter — structured-outputs capability", () => {
  test("when route.capabilities.structuredOutputs === true and schemaForOutput is set, response_format is passed", async () => {
    let observed: ChatCreateParams | undefined;
    const factory = (_opts: FakeOpenAIOptions) => ({
      chat: {
        completions: {
          create: vi.fn(async (params: ChatCreateParams) => {
            observed = params;
            return {
              id: "x",
              choices: [{ message: { content: "{}" } }],
              usage: { total_tokens: 1 },
            };
          }),
        },
      },
    });
    const adapter = createOpenRouterAdapter({
      env: { OPENROUTER_API_KEY: "or-test" },
      openaiFactory: factory,
    });
    await adapter.invoke(GEN_ROUTE, {
      ...REQ,
      schemaForOutput: { type: "object", properties: { foo: { type: "string" } } },
    });
    expect(observed?.response_format).toBeDefined();
  });

  test("when capabilities.structuredOutputs === false, response_format is OMITTED even if schemaForOutput is set", async () => {
    let observed: ChatCreateParams | undefined;
    const factory = (_opts: FakeOpenAIOptions) => ({
      chat: {
        completions: {
          create: vi.fn(async (params: ChatCreateParams) => {
            observed = params;
            return {
              id: "x",
              choices: [{ message: { content: "{}" } }],
              usage: { total_tokens: 1 },
            };
          }),
        },
      },
    });
    const adapter = createOpenRouterAdapter({
      env: { OPENROUTER_API_KEY: "or-test" },
      openaiFactory: factory,
    });
    const route: ModelRoute = {
      ...GEN_ROUTE,
      capabilities: { ...GEN_ROUTE.capabilities, structuredOutputs: false },
    };
    await adapter.invoke(route, {
      ...REQ,
      schemaForOutput: { type: "object" },
    });
    expect(observed?.response_format).toBeUndefined();
  });
});

describe("createOpenRouterAdapter — error paths", () => {
  test("SDK throws → adapter throws (dispatcher converts to provider_call_failed)", async () => {
    const factory = (_opts: FakeOpenAIOptions) => ({
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw new Error("503 Service Unavailable");
          }),
        },
      },
    });
    const adapter = createOpenRouterAdapter({
      env: { OPENROUTER_API_KEY: "or-test" },
      openaiFactory: factory,
    });
    await expect(adapter.invoke(GEN_ROUTE, REQ)).rejects.toThrow(/503/);
  });
});
