import type { Agenome, RunCaps } from "@doppl/contracts";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppendEventInput, AppendEventResult } from "../../event-store/append.js";
import type { ModelGateway } from "../../model-gateway/gateway.js";
import { allocateSuccessorBudget, clampBudget, normalizeWeights } from "../allocation.js";
import { assembleSuccessorPopulation } from "../successor.js";

function makeParent(id: string): Agenome {
  return {
    id,
    runId: "run_s",
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

const NOOP_GATEWAY: ModelGateway = {
  invoke: async () => ({
    ok: true,
    output: { content: "x" },
    repairAttempts: 0,
    energyEstimate: 1,
  }),
};

const CAPS: RunCaps = {
  maxPopulation: 4,
  maxGenerations: 3,
  energyBudget: 1000,
  maxSpawnDepth: 2,
  maxToolCalls: 10,
  wallClockTimeoutMs: 60_000,
};

describe("clampBudget", () => {
  test("clamps to maxPopulation", () => {
    expect(clampBudget(10, 4)).toBe(4);
  });
  test("non-positive → 0", () => {
    expect(clampBudget(0, 10)).toBe(0);
    expect(clampBudget(-5, 10)).toBe(0);
  });
  test("NaN/Infinity → 0 (non-finite input is treated as a caller bug)", () => {
    expect(clampBudget(Number.NaN, 10)).toBe(0);
    expect(clampBudget(Number.POSITIVE_INFINITY, 10)).toBe(0);
  });
});

describe("normalizeWeights", () => {
  test("sums to 1", () => {
    const ws = normalizeWeights([1, 2, 3]);
    expect(ws.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(ws[0]).toBeCloseTo(1 / 6, 10);
  });
  test("all-zero → uniform", () => {
    expect(normalizeWeights([0, 0])).toEqual([0.5, 0.5]);
  });
  test("empty → empty", () => {
    expect(normalizeWeights([])).toEqual([]);
  });
});

describe("allocateSuccessorBudget", () => {
  test("integer sum equals budget exactly", () => {
    const alloc = allocateSuccessorBudget([1, 2, 3], 6);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(6);
    expect(alloc).toEqual([1, 2, 3]);
  });
  test("uneven distribution: largest remainder goes to top weight first", () => {
    const alloc = allocateSuccessorBudget([1, 1, 1], 4);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(4);
    // Each slot gets 4/3 = 1.33; one slot gets the extra integer
    expect(alloc.filter((n) => n === 1).length).toBeGreaterThanOrEqual(2);
  });
  test("zero budget → all zeros", () => {
    expect(allocateSuccessorBudget([1, 2, 3], 0)).toEqual([0, 0, 0]);
  });
});

describe("assembleSuccessorPopulation", () => {
  let appender: ReturnType<typeof makeAppender>;
  beforeEach(() => {
    appender = makeAppender();
  });

  test("zero parents → empty successor, no events", async () => {
    const out = await assembleSuccessorPopulation({
      gateway: NOOP_GATEWAY,
      appendEvent: appender.fn,
      parents: [],
      caps: CAPS,
      runId: "run_s0",
      runSeed: "seed",
      generationIndex: 0,
      correlationIdFor: (i) => `corr_${i}`,
    });
    expect(out).toEqual([]);
    expect(appender.events).toEqual([]);
  });

  test("successor size never exceeds caps.maxPopulation", async () => {
    const out = await assembleSuccessorPopulation({
      gateway: NOOP_GATEWAY,
      appendEvent: appender.fn,
      parents: [makeParent("A"), makeParent("B"), makeParent("C")],
      caps: { ...CAPS, maxPopulation: 4 },
      runId: "run_s1",
      runSeed: "seed",
      generationIndex: 0,
      correlationIdFor: (i) => `corr_${i}`,
    });
    expect(out.length).toBeLessThanOrEqual(4);
  });

  test("1 parent → mutation_only successor of size budget", async () => {
    const out = await assembleSuccessorPopulation({
      gateway: NOOP_GATEWAY,
      appendEvent: appender.fn,
      parents: [makeParent("only")],
      caps: { ...CAPS, maxPopulation: 3 },
      runId: "run_s2",
      runSeed: "seed",
      generationIndex: 0,
      correlationIdFor: (i) => `corr_${i}`,
    });
    expect(out).toHaveLength(3);
    for (const child of out) {
      expect(child.parentIds).toEqual(["only"]);
    }
  });

  test("children carry the next generation's generationId", async () => {
    const out = await assembleSuccessorPopulation({
      gateway: NOOP_GATEWAY,
      appendEvent: appender.fn,
      parents: [makeParent("A"), makeParent("B")],
      caps: { ...CAPS, maxPopulation: 2 },
      runId: "run_s3",
      runSeed: "seed",
      generationIndex: 0,
      correlationIdFor: (i) => `corr_${i}`,
    });
    for (const child of out) {
      expect(child.generationId).toBe("gen_1");
    }
  });
});
