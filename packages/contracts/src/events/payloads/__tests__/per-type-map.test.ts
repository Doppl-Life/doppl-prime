import { describe, expect, test } from "vitest";
import { spec } from "../../../testing/spec-tag.js";
import { RunEventTypeValues } from "../../event-type.js";
import { RunEventPayloadMap, parseEventPayload } from "../per-type-map.js";

describe(`${spec("§4")} RunEventPayloadMap exhaustiveness`, () => {
  test("has an entry for every RunEventType value", () => {
    for (const type of RunEventTypeValues) {
      expect(RunEventPayloadMap).toHaveProperty(type);
    }
  });

  test("has no entries beyond RunEventTypeValues", () => {
    const known = new Set<string>(RunEventTypeValues);
    for (const key of Object.keys(RunEventPayloadMap)) {
      expect(known.has(key)).toBe(true);
    }
  });
});

describe(`${spec("§4")} parseEventPayload — happy paths`, () => {
  test("parses run.configured with a RunConfig", () => {
    const cfg = {
      seed: "s",
      enabledSubtypes: ["cross_domain_transfer"],
      caps: {
        maxPopulation: 4,
        maxGenerations: 3,
        energyBudget: 1_000,
        maxSpawnDepth: 2,
        maxToolCalls: 10,
        wallClockTimeoutMs: 60_000,
      },
      modelProfile: "default",
      scoringPolicyVersion: "v1",
      rngSeed: "rng_1",
    };
    expect(parseEventPayload("run.configured", { config: cfg })).toBeDefined();
  });

  test("parses critic.reviewed with a CriticReview", () => {
    const review = {
      id: "r_1",
      candidateId: "c_1",
      mandate: "feasibility",
      scores: { x: 0.5 },
      critique: "ok",
      confidence: 0.5,
      evidenceRefs: [],
    };
    expect(parseEventPayload("critic.reviewed", { review })).toBeDefined();
  });

  test("parses lineage.culled with a CullingEvent", () => {
    const culling = {
      id: "cull_1",
      runId: "r_1",
      generationId: "g_1",
      targetIds: ["ag_1"],
      reason: "weak fitness",
      scoreSnapshot: { ag_1: 0.1 },
    };
    expect(parseEventPayload("lineage.culled", { culling })).toBeDefined();
  });

  test("parses energy.spent with an EnergyEvent (success-only)", () => {
    const energy = {
      id: "en_1",
      runId: "r_1",
      eventType: "llm",
      estimate: 10,
      actual: 10,
      unit: "doppl_energy",
      reason: "critic call",
    };
    expect(parseEventPayload("energy.spent", { energy })).toBeDefined();
  });

  test("parses minimal failure payloads", () => {
    expect(parseEventPayload("provider_call_failed", { reason: "5xx" })).toBeDefined();
    expect(
      parseEventPayload("output_schema_rejected", { reason: "field 'claims' missing" }),
    ).toBeDefined();
    expect(
      parseEventPayload("candidate_invalidated", { candidateId: "c_1", reason: "x" }),
    ).toBeDefined();
    expect(
      parseEventPayload("energy_exhausted", { reason: "budget", spent: 100, budget: 100 }),
    ).toBeDefined();
    expect(parseEventPayload("generation_failed", { reason: "timeout" })).toBeDefined();
    expect(
      parseEventPayload("reproduction_aborted_insufficient_parents", {
        reason: "only 1 eligible",
        parentCount: 1,
      }),
    ).toBeDefined();
    expect(
      parseEventPayload("novelty_scoring_degraded", {
        reason: "embedding provider 5xx",
        fallbackMethod: "lexical",
      }),
    ).toBeDefined();
  });
});

describe(`${spec("§4")} parseEventPayload — error paths`, () => {
  test("throws on wrong payload shape for a given type", () => {
    expect(() => parseEventPayload("critic.reviewed", { wrong: "shape" })).toThrow();
  });

  test("throws on missing required field", () => {
    expect(() => parseEventPayload("provider_call_failed", {})).toThrow();
  });
});
