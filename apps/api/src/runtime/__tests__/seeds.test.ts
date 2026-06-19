import type { RunCaps } from "@doppl/contracts";
import { Agenome } from "@doppl/contracts";
import { describe, expect, test } from "vitest";
import { defaultGen0Bundle, materializeGen0Bundle } from "../seeds/gen-0-agenomes.js";

const CAPS: RunCaps = {
  maxPopulation: 10,
  maxGenerations: 5,
  energyBudget: 10_000,
  maxSpawnDepth: 3,
  maxToolCalls: 50,
  wallClockTimeoutMs: 600_000,
};

describe("defaultGen0Bundle — REQ-F-017", () => {
  test("has at least 3 entries (REQ-F-017 minimum)", () => {
    expect(defaultGen0Bundle.length).toBeGreaterThanOrEqual(3);
  });

  test("each entry has a distinct personaWeights vector", () => {
    const sigs = defaultGen0Bundle.map((b) => JSON.stringify(b.personaWeights));
    expect(new Set(sigs).size).toBe(defaultGen0Bundle.length);
  });

  test("each entry has a non-empty systemPrompt and decompositionPolicy", () => {
    for (const b of defaultGen0Bundle) {
      expect(b.systemPrompt.length).toBeGreaterThan(0);
      expect(b.decompositionPolicy.length).toBeGreaterThan(0);
    }
  });
});

describe("materializeGen0Bundle — clamps + assigns IDs", () => {
  test("clamps each agenome's spawnBudget to floor(caps.maxPopulation / bundleSize)", () => {
    const agenomes = materializeGen0Bundle({
      runId: "run_test",
      generationId: "gen_0",
      caps: CAPS,
    });
    const expected = Math.floor(CAPS.maxPopulation / defaultGen0Bundle.length);
    for (const a of agenomes) {
      expect(a.spawnBudget).toBeLessThanOrEqual(expected);
    }
  });

  test("assigns distinct UUID-shaped IDs", () => {
    const agenomes = materializeGen0Bundle({
      runId: "run_test",
      generationId: "gen_0",
      caps: CAPS,
    });
    const ids = agenomes.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  test("every materialized agenome parses against the Phase 0 Agenome schema", () => {
    const agenomes = materializeGen0Bundle({
      runId: "run_test",
      generationId: "gen_0",
      caps: CAPS,
    });
    for (const a of agenomes) {
      expect(() => Agenome.parse(a)).not.toThrow();
    }
  });

  test("all gen-0 agenomes start at status='seeded' with empty parentIds", () => {
    const agenomes = materializeGen0Bundle({
      runId: "run_test",
      generationId: "gen_0",
      caps: CAPS,
    });
    for (const a of agenomes) {
      expect(a.status).toBe("seeded");
      expect(a.parentIds).toEqual([]);
      expect(a.runId).toBe("run_test");
      expect(a.generationId).toBe("gen_0");
    }
  });
});
