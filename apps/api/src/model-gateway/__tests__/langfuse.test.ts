import { describe, expect, test, vi } from "vitest";
import { createLangfuseClient } from "../langfuse.js";

describe("createLangfuseClient — local-trace fallback (no env keys)", () => {
  test("startTrace returns UUID-shaped traceId and observationId without a network call", async () => {
    const client = createLangfuseClient({ env: {} });
    const trace = client.startTrace({
      name: "test",
      runId: "run_test",
      correlationId: "corr_test",
    });
    expect(trace.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(trace.observationId).toMatch(/^[0-9a-f-]{36}$/);
    await trace.end({ success: true, tokensUsed: 100 });
  });

  test("local-trace mode does not require any SDK import / network", () => {
    // Construct without keys; succeed without trying to construct a Langfuse SDK.
    expect(() => createLangfuseClient({ env: {} })).not.toThrow();
  });
});

describe("createLangfuseClient — Cloud mode (env keys + injected SDK)", () => {
  test("startTrace invokes the SDK; end flushes", async () => {
    const traceMock = { id: "trace_cloud", update: vi.fn() };
    const observationMock = { id: "obs_cloud", end: vi.fn() };
    const sdkFactory = vi.fn(() => ({
      trace: vi.fn(() => traceMock),
      span: vi.fn(() => observationMock),
      shutdown: vi.fn(),
    }));
    const client = createLangfuseClient({
      env: {
        LANGFUSE_PUBLIC_KEY: "pk-test",
        LANGFUSE_SECRET_KEY: "sk-test",
      },
      sdkFactory,
    });
    const trace = client.startTrace({
      name: "test",
      runId: "run_test",
      correlationId: "corr_test",
    });
    expect(trace.traceId).toBe("trace_cloud");
    expect(trace.observationId).toBe("obs_cloud");
    await trace.end({ success: true, tokensUsed: 200 });
    expect(observationMock.end).toHaveBeenCalledTimes(1);
  });
});

describe("createLangfuseClient — content toggle", () => {
  test("default (toggle off): startTrace metadata does NOT include prompt/completion/messages", async () => {
    let observed: Record<string, unknown> | undefined;
    const sdkFactory = () => ({
      trace: vi.fn((opts: Record<string, unknown>) => {
        observed = opts;
        return { id: "trace_x" };
      }),
      span: vi.fn(() => ({ id: "obs_x", end: vi.fn() })),
      shutdown: vi.fn(),
    });
    const client = createLangfuseClient({
      env: { LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" },
      sdkFactory,
    });
    client.startTrace({
      name: "test",
      runId: "r",
      correlationId: "c",
      metadata: {
        prompt: "secret prompt",
        completion: "secret completion",
        messages: [{ role: "user", content: "hello" }],
        modelId: "claude",
      },
    });
    const metadata = (observed?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.prompt).toBeUndefined();
    expect(metadata.completion).toBeUndefined();
    expect(metadata.messages).toBeUndefined();
    expect(metadata.modelId).toBe("claude");
  });

  test("toggle on (DOPPL_LANGFUSE_INCLUDE_CONTENT=true): metadata includes content fields", async () => {
    let observed: Record<string, unknown> | undefined;
    const sdkFactory = () => ({
      trace: vi.fn((opts: Record<string, unknown>) => {
        observed = opts;
        return { id: "trace_x" };
      }),
      span: vi.fn(() => ({ id: "obs_x", end: vi.fn() })),
      shutdown: vi.fn(),
    });
    const client = createLangfuseClient({
      env: {
        LANGFUSE_PUBLIC_KEY: "pk",
        LANGFUSE_SECRET_KEY: "sk",
        DOPPL_LANGFUSE_INCLUDE_CONTENT: "true",
      },
      sdkFactory,
    });
    client.startTrace({
      name: "test",
      runId: "r",
      correlationId: "c",
      metadata: {
        prompt: "the prompt",
        completion: "the completion",
      },
    });
    const metadata = (observed?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.prompt).toBe("the prompt");
    expect(metadata.completion).toBe("the completion");
  });
});

describe("createLangfuseClient — SDK failure falls back to local-trace IDs", () => {
  test("if SDK construction throws, the gateway call still succeeds (local-trace IDs returned)", () => {
    const sdkFactory = vi.fn(() => {
      throw new Error("network down");
    });
    const client = createLangfuseClient({
      env: { LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" },
      sdkFactory,
    });
    const trace = client.startTrace({
      name: "test",
      runId: "r",
      correlationId: "c",
    });
    expect(trace.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(trace.observationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("if trace.end throws, the failure is swallowed (gateway invoke must not be blocked)", async () => {
    const sdkFactory = () => ({
      trace: vi.fn(() => ({ id: "trace_x" })),
      span: vi.fn(() => ({
        id: "obs_x",
        end: vi.fn(async () => {
          throw new Error("flush failed");
        }),
      })),
      shutdown: vi.fn(),
    });
    const client = createLangfuseClient({
      env: { LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" },
      sdkFactory,
    });
    const trace = client.startTrace({
      name: "test",
      runId: "r",
      correlationId: "c",
    });
    await expect(trace.end({ success: true })).resolves.toBeUndefined();
  });
});
