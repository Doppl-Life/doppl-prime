import type { Agenome, ModelGatewayRequest, ModelGatewayResponse } from "@doppl/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../../event-store/append.js";
import type { ModelGateway } from "../../../model-gateway/gateway.js";
import { reproduceWithFallback } from "../reproduce.js";

function makeParent(id: string): Agenome {
  return {
    id,
    runId: "run_r",
    generationId: "gen_0",
    parentIds: [],
    systemPrompt: `from ${id}`,
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

const ALL_OK_GATEWAY: ModelGateway = {
  invoke: async (_req: ModelGatewayRequest): Promise<ModelGatewayResponse> => ({
    ok: true,
    output: { content: "synth" },
    repairAttempts: 0,
    energyEstimate: 1,
  }),
};

describe("reproduceWithFallback — 0 parents", () => {
  let appender: ReturnType<typeof makeAppender>;
  beforeEach(() => {
    appender = makeAppender();
  });

  test("emits reproduction_aborted_insufficient_parents + empty children", async () => {
    const out = await reproduceWithFallback({
      gateway: ALL_OK_GATEWAY,
      appendEvent: appender.fn,
      parents: [],
      runId: "run_r0",
      generationIndex: 0,
      runSeed: "seed",
      bounds: { maxPopulation: 10 },
      budget: 4,
      correlationIdFor: (i) => `corr_${i}`,
    });
    expect(out.children).toEqual([]);
    expect(appender.events).toHaveLength(1);
    expect(appender.events[0]?.type).toBe("reproduction_aborted_insufficient_parents");
  });
});

describe("reproduceWithFallback — 1 parent", () => {
  let appender: ReturnType<typeof makeAppender>;
  beforeEach(() => {
    appender = makeAppender();
  });

  test("budget=3 with 1 parent → 3 mutation_only children + 6 events (3 mutated + 3 reproduced)", async () => {
    const out = await reproduceWithFallback({
      gateway: ALL_OK_GATEWAY,
      appendEvent: appender.fn,
      parents: [makeParent("P1")],
      runId: "run_r1",
      generationIndex: 0,
      runSeed: "seed",
      bounds: { maxPopulation: 10 },
      budget: 3,
      correlationIdFor: (i) => `corr_${i}`,
    });
    expect(out.children).toHaveLength(3);
    const types = appender.events.map((e) => e.type);
    expect(types.filter((t) => t === "agenome.mutated")).toHaveLength(3);
    expect(types.filter((t) => t === "agenome.reproduced")).toHaveLength(3);
    expect(types.filter((t) => t === "agenome.fused")).toHaveLength(0);
    for (const child of out.children) {
      expect(child.parentIds).toEqual(["P1"]);
    }
  });
});

describe("reproduceWithFallback — ≥2 parents", () => {
  let appender: ReturnType<typeof makeAppender>;
  beforeEach(() => {
    appender = makeAppender();
  });

  test("budget=6, 4 parents → 4 fusion + 2 mutation_only", async () => {
    const parents = [makeParent("A"), makeParent("B"), makeParent("C"), makeParent("D")];
    const out = await reproduceWithFallback({
      gateway: ALL_OK_GATEWAY,
      appendEvent: appender.fn,
      parents,
      runId: "run_r2",
      generationIndex: 1,
      runSeed: "seed",
      bounds: { maxPopulation: 10 },
      budget: 6,
      correlationIdFor: (i) => `corr_${i}`,
    });
    expect(out.children).toHaveLength(6);
    const types = appender.events.map((e) => e.type);
    expect(types.filter((t) => t === "agenome.fused")).toHaveLength(4);
    expect(types.filter((t) => t === "agenome.mutated")).toHaveLength(2);
    expect(types.filter((t) => t === "agenome.reproduced")).toHaveLength(6);
  });

  test("budget=0 → empty result, no events", async () => {
    const out = await reproduceWithFallback({
      gateway: ALL_OK_GATEWAY,
      appendEvent: appender.fn,
      parents: [makeParent("A"), makeParent("B")],
      runId: "run_r3",
      generationIndex: 0,
      runSeed: "seed",
      bounds: { maxPopulation: 10 },
      budget: 0,
      correlationIdFor: (i) => `corr_${i}`,
    });
    expect(out.children).toEqual([]);
    expect(appender.events).toEqual([]);
  });

  test("replay-stable: same inputs + seed → same set of child mode counts", async () => {
    const parents = [makeParent("A"), makeParent("B"), makeParent("C")];
    const firstAppender = makeAppender();
    const first = await reproduceWithFallback({
      gateway: ALL_OK_GATEWAY,
      appendEvent: firstAppender.fn,
      parents,
      runId: "run_r4a",
      generationIndex: 1,
      runSeed: "shared",
      bounds: { maxPopulation: 10 },
      budget: 4,
      correlationIdFor: (i) => `corr_${i}`,
    });
    const secondAppender = makeAppender();
    const second = await reproduceWithFallback({
      gateway: ALL_OK_GATEWAY,
      appendEvent: secondAppender.fn,
      parents,
      runId: "run_r4b",
      generationIndex: 1,
      runSeed: "shared",
      bounds: { maxPopulation: 10 },
      budget: 4,
      correlationIdFor: (i) => `corr_${i}`,
    });
    const firstModes = first.events.map((e) => e.mode).sort();
    const secondModes = second.events.map((e) => e.mode).sort();
    expect(firstModes).toEqual(secondModes);
  });
});
