import { randomUUID } from "node:crypto";
import type { ModelGatewayRequest } from "@doppl/contracts";
import { describe, expect, test, vi } from "vitest";
import { defaultRoutes } from "../default-routes.js";
import { createRegistry } from "../default-routes.js";
import { GatewayConfigError, RetryExhaustedError, RouteNotFoundError } from "../errors.js";
import { type Adapter, type AdapterResult, type GatewayDeps, createGateway } from "../gateway.js";

interface EmittedEvent {
  type: string;
  payload: unknown;
}

function makeDeps(opts: {
  adapter: Adapter;
  fallbackAdapter?: Adapter;
  events?: EmittedEvent[];
}): { deps: GatewayDeps; events: EmittedEvent[] } {
  const events = opts.events ?? [];
  const adapterFor = vi.fn((provider: string): Adapter => {
    if (provider === "openrouter") return opts.adapter;
    if (provider === "openai-embedding") return opts.adapter;
    if (opts.fallbackAdapter) return opts.fallbackAdapter;
    throw new Error(`No adapter for provider: ${provider}`);
  });
  const deps: GatewayDeps = {
    registry: createRegistry(defaultRoutes),
    adapterFor,
    eventStore: {
      appendEvent: async (input) => {
        events.push({ type: input.type, payload: input.payload });
        return {
          id: randomUUID(),
          sequence: events.length - 1,
          occurredAt: new Date(),
        };
      },
    },
    langfuse: {
      startTrace: () => ({
        traceId: "trace_test",
        observationId: "obs_test",
        end: async () => {},
      }),
    },
  };
  return { deps, events };
}

function makeReq(overrides: Partial<ModelGatewayRequest> = {}): ModelGatewayRequest {
  return {
    role: "critic",
    runId: "run_test",
    input: { prompt: "review this" },
    correlationId: "corr_test",
    ...overrides,
  };
}

const stubResult: AdapterResult = {
  rawOutput: { content: "ok" },
  energyEstimate: 10,
  energyActual: 9,
  providerTraceId: "trace_provider",
};

describe("createGateway — happy path", () => {
  test("returns a successful ModelGatewayResponse and emits exactly one energy.spent", async () => {
    const adapter: Adapter = { invoke: vi.fn(async () => stubResult) };
    const { deps, events } = makeDeps({ adapter });
    const gateway = createGateway(deps);

    const res = await gateway.invoke(makeReq());
    expect(res.ok).toBe(true);
    expect(res.output).toEqual({ content: "ok" });
    expect(res.energyActual).toBe(9);
    expect(res.repairAttempts).toBe(0);

    const energyEvents = events.filter((e) => e.type === "energy.spent");
    const failedEvents = events.filter((e) => e.type === "provider_call_failed");
    expect(energyEvents).toHaveLength(1);
    expect(failedEvents).toHaveLength(0);
  });
});

describe("createGateway — fallback on primary failure", () => {
  test("primary adapter throws → tries fallback route once → returns fallback result", async () => {
    let calls = 0;
    const adapter: Adapter = {
      invoke: vi.fn(async (route) => {
        calls += 1;
        if (route.modelId === defaultRoutes.critic.modelId) {
          throw new Error("primary 503");
        }
        return stubResult;
      }),
    };
    const { deps, events } = makeDeps({ adapter });
    const gateway = createGateway(deps);

    const res = await gateway.invoke(makeReq());
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);

    const failedEvents = events.filter((e) => e.type === "provider_call_failed");
    expect(failedEvents).toHaveLength(1);
    const energyEvents = events.filter((e) => e.type === "energy.spent");
    expect(energyEvents).toHaveLength(1);
  });
});

describe("createGateway — primary AND fallback both fail", () => {
  test("emits two provider_call_failed events and throws RetryExhaustedError", async () => {
    const adapter: Adapter = {
      invoke: vi.fn(async () => {
        throw new Error("everything is broken");
      }),
    };
    const { deps, events } = makeDeps({ adapter });
    const gateway = createGateway(deps);

    await expect(gateway.invoke(makeReq())).rejects.toBeInstanceOf(RetryExhaustedError);

    const failedEvents = events.filter((e) => e.type === "provider_call_failed");
    expect(failedEvents).toHaveLength(2);
    const energyEvents = events.filter((e) => e.type === "energy.spent");
    expect(energyEvents).toHaveLength(0);
  });
});

describe("createGateway — error paths", () => {
  test("unknown role → RouteNotFoundError; no adapter call attempted", async () => {
    const adapter: Adapter = { invoke: vi.fn(async () => stubResult) };
    const { deps } = makeDeps({ adapter });
    const gateway = createGateway(deps);

    await expect(gateway.invoke(makeReq({ role: "not_a_role" as never }))).rejects.toBeInstanceOf(
      RouteNotFoundError,
    );
    expect(adapter.invoke).toHaveBeenCalledTimes(0);
  });

  test("adapterFor throws (provider not registered) → GatewayConfigError; no energy.spent", async () => {
    const adapter: Adapter = { invoke: vi.fn(async () => stubResult) };
    const { deps, events } = makeDeps({ adapter });
    // Override adapterFor to always throw — simulating an unconfigured provider.
    (deps as { adapterFor: unknown }).adapterFor = () => {
      throw new GatewayConfigError("no adapter for provider 'openrouter'");
    };
    const gateway = createGateway(deps);

    await expect(gateway.invoke(makeReq())).rejects.toBeInstanceOf(GatewayConfigError);
    const energyEvents = events.filter((e) => e.type === "energy.spent");
    expect(energyEvents).toHaveLength(0);
  });
});

describe("createGateway — energy invariant", () => {
  test("a thrown adapter call NEVER emits energy.spent (success-only)", async () => {
    const adapter: Adapter = {
      invoke: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const { deps, events } = makeDeps({ adapter });
    const gateway = createGateway(deps);
    await expect(gateway.invoke(makeReq())).rejects.toThrow();
    expect(events.filter((e) => e.type === "energy.spent")).toHaveLength(0);
  });

  test("successful call after fallback emits ONE energy.spent reflecting the successful call", async () => {
    let calls = 0;
    const adapter: Adapter = {
      invoke: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("primary 503");
        return { ...stubResult, energyActual: 42 };
      }),
    };
    const { deps, events } = makeDeps({ adapter });
    const gateway = createGateway(deps);
    await gateway.invoke(makeReq());

    const energyEvents = events.filter((e) => e.type === "energy.spent");
    expect(energyEvents).toHaveLength(1);
    const payload = energyEvents[0]?.payload as { energy: { actual: number } };
    expect(payload.energy.actual).toBe(42);
  });
});
