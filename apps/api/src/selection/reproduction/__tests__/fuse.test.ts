import type { Agenome, ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../../event-store/append.js";
import type { ModelGateway } from "../../../model-gateway/gateway.js";
import { createSeededRng } from "../../../runtime/rng.js";
import { fuseAgenomes } from "../fuse.js";

function makeParent(id: string): Agenome {
  return {
    id,
    runId: "run_f",
    generationId: "gen_0",
    parentIds: [],
    systemPrompt: `prompt from ${id}`,
    personaWeights: { curiosity: 0.5, rigor: 0.5 },
    toolPermissions: [],
    decompositionPolicy: "default",
    spawnBudget: 1,
    status: "seeded",
  };
}

function makeAppender(): {
  fn: (e: AppendEventInput) => Promise<AppendEventResult>;
  events: AppendEventInput[];
} {
  const events: AppendEventInput[] = [];
  let seq = 0;
  return {
    fn: async (e) => {
      events.push(e);
      const r = { id: `evt_${seq}`, sequence: seq, occurredAt: new Date() };
      seq += 1;
      return r;
    },
    events,
  };
}

describe("fuseAgenomes — happy path", () => {
  let appender: ReturnType<typeof makeAppender>;
  beforeEach(() => {
    appender = makeAppender();
  });

  test("with synthesis success → child carries synthesized prompt + mode=fusion", async () => {
    const gateway: ModelGateway = {
      invoke: async (_req: ModelGatewayRequest): Promise<ModelGatewayResponse> => ({
        ok: true,
        output: { content: "synthesized prompt" },
        repairAttempts: 0,
        energyEstimate: 1,
        providerTraceId: "trace_x",
      }),
    };
    const out = await fuseAgenomes({
      gateway,
      appendEvent: appender.fn,
      parentA: makeParent("A"),
      parentB: makeParent("B"),
      rng: createSeededRng("s"),
      runId: "run_f",
      generationIndex: 1,
      correlationId: "corr_f1",
    });
    expect(out.child.systemPrompt).toBe("synthesized prompt");
    expect(out.event.mode).toBe("fusion");
    expect(out.child.parentIds).toEqual(["A", "B"]);
    expect(appender.events).toHaveLength(1);
    expect(appender.events[0]?.type).toBe("agenome.fused");
  });

  test("synthesis failure → falls back to crossover-only mode + parentA prompt", async () => {
    const failingGateway: ModelGateway = {
      invoke: async () => {
        throw new Error("provider down");
      },
    };
    const out = await fuseAgenomes({
      gateway: failingGateway,
      appendEvent: appender.fn,
      parentA: makeParent("A"),
      parentB: makeParent("B"),
      rng: createSeededRng("s"),
      runId: "run_f",
      generationIndex: 1,
      correlationId: "corr_f2",
    });
    expect(out.child.systemPrompt).toBe("prompt from A");
    expect(out.event.mode).toBe("crossover");
    expect(out.event.mutationSummary).toContain("synthesis unavailable");
  });

  test("withOutputSynthesis=false skips the gateway call", async () => {
    let called = false;
    const probeGateway: ModelGateway = {
      invoke: async () => {
        called = true;
        return {
          ok: true,
          output: { content: "synth" },
          repairAttempts: 0,
          energyEstimate: 1,
        };
      },
    };
    const out = await fuseAgenomes({
      gateway: probeGateway,
      appendEvent: appender.fn,
      parentA: makeParent("A"),
      parentB: makeParent("B"),
      rng: createSeededRng("s"),
      runId: "run_f",
      generationIndex: 1,
      correlationId: "corr_f3",
      withOutputSynthesis: false,
    });
    expect(called).toBe(false);
    expect(out.event.mode).toBe("crossover");
  });

  test("child spawnBudget = max(parentA, parentB) — never raises a cap", async () => {
    const gateway: ModelGateway = {
      invoke: async () => ({
        ok: true,
        output: { content: "x" },
        repairAttempts: 0,
        energyEstimate: 1,
      }),
    };
    const a = makeParent("A");
    const b = makeParent("B");
    a.spawnBudget = 3;
    b.spawnBudget = 5;
    const out = await fuseAgenomes({
      gateway,
      appendEvent: appender.fn,
      parentA: a,
      parentB: b,
      rng: createSeededRng("s"),
      runId: "run_f",
      generationIndex: 0,
      correlationId: "corr_f4",
    });
    expect(out.child.spawnBudget).toBe(5);
  });

  test("ReproductionEvent.crossoverPoints persisted on the event payload", async () => {
    const gateway: ModelGateway = {
      invoke: async () => ({
        ok: true,
        output: { content: "x" },
        repairAttempts: 0,
        energyEstimate: 1,
      }),
    };
    await fuseAgenomes({
      gateway,
      appendEvent: appender.fn,
      parentA: makeParent("A"),
      parentB: makeParent("B"),
      rng: createSeededRng("s"),
      runId: "run_f",
      generationIndex: 0,
      correlationId: "corr_f5",
    });
    const event = appender.events[0];
    if (!event) throw new Error("no event");
    const payload = event.payload as { reproduction: { crossoverPoints: string[] } };
    expect(Array.isArray(payload.reproduction.crossoverPoints)).toBe(true);
  });
});
