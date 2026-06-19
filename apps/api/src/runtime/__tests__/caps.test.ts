import type { RunCaps } from "@doppl/contracts";
import { describe, expect, test, vi } from "vitest";
import { createCapEnforcer, createKillSwitch } from "../caps.js";

const CAPS: RunCaps = {
  maxPopulation: 8,
  maxGenerations: 5,
  energyBudget: 1000,
  maxSpawnDepth: 3,
  maxToolCalls: 50,
  wallClockTimeoutMs: 60_000,
};

function baseState(
  overrides: Partial<Parameters<ReturnType<typeof createCapEnforcer>["enforceCaps"]>[0]> = {},
) {
  return {
    generationCount: 0,
    populationCount: 0,
    spawnDepth: 0,
    toolCallCount: 0,
    energyAccumulator: 0,
    wallClockStartMs: Date.now(), // elapsed ≈ 0
    ...overrides,
  };
}

describe("createCapEnforcer — all caps satisfied", () => {
  test("returns {ok:true} when no cap is exhausted", () => {
    const enforcer = createCapEnforcer(CAPS);
    expect(enforcer.enforceCaps(baseState())).toEqual({ ok: true });
  });
});

describe("createCapEnforcer — per-cap exhaustion", () => {
  test("maxGenerations exhausted", () => {
    const enforcer = createCapEnforcer(CAPS);
    const result = enforcer.enforceCaps(baseState({ generationCount: 5 }));
    expect(result).toEqual({ ok: false, cap: "maxGenerations", value: 5, limit: 5 });
  });

  test("maxPopulation exhausted (>= triggers)", () => {
    const enforcer = createCapEnforcer(CAPS);
    const result = enforcer.enforceCaps(baseState({ populationCount: 8 }));
    expect(result).toEqual({ ok: false, cap: "maxPopulation", value: 8, limit: 8 });
  });

  test("maxSpawnDepth exhausted", () => {
    const enforcer = createCapEnforcer(CAPS);
    const result = enforcer.enforceCaps(baseState({ spawnDepth: 3 }));
    expect(result).toEqual({ ok: false, cap: "maxSpawnDepth", value: 3, limit: 3 });
  });

  test("maxToolCalls exhausted", () => {
    const enforcer = createCapEnforcer(CAPS);
    const result = enforcer.enforceCaps(baseState({ toolCallCount: 50 }));
    expect(result).toEqual({ ok: false, cap: "maxToolCalls", value: 50, limit: 50 });
  });

  test("energyBudget exhausted by current accumulator", () => {
    const enforcer = createCapEnforcer(CAPS);
    const result = enforcer.enforceCaps(baseState({ energyAccumulator: 1000 }));
    expect(result).toEqual({ ok: false, cap: "energyBudget", value: 1000, limit: 1000 });
  });

  test("energyBudget exhausted by accumulator + pre-call estimate", () => {
    const enforcer = createCapEnforcer(CAPS);
    const result = enforcer.enforceCaps(baseState({ energyAccumulator: 900, energyEstimate: 200 }));
    expect(result).toEqual({ ok: false, cap: "energyBudget", value: 1100, limit: 1000 });
  });

  test("wallClockTimeoutMs exhausted via injected now()", () => {
    const enforcer = createCapEnforcer(CAPS, { now: () => 100_000 });
    const result = enforcer.enforceCaps(baseState({ wallClockStartMs: 0 }));
    expect(result).toEqual({
      ok: false,
      cap: "wallClockTimeoutMs",
      value: 100_000,
      limit: 60_000,
    });
  });
});

describe("createKillSwitch — operator-driven termination", () => {
  test("starts un-stopped", () => {
    const ks = createKillSwitch();
    expect(ks.isStopped()).toBe(false);
    expect(ks.reason()).toBeNull();
  });

  test("requestStop sets isStopped + records reason", () => {
    const ks = createKillSwitch();
    ks.requestStop("operator request");
    expect(ks.isStopped()).toBe(true);
    expect(ks.reason()).toBe("operator request");
  });

  test("first requestStop wins; subsequent are no-ops", () => {
    const ks = createKillSwitch();
    ks.requestStop("first");
    ks.requestStop("second");
    ks.requestStop("third");
    expect(ks.reason()).toBe("first");
  });
});
