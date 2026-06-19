import { describe, expect, test } from "vitest";
import { spec } from "../../testing/spec-tag.js";
import { RunEventType, RunEventTypeValues } from "../event-type.js";

describe(`${spec("§4")} RunEventType registry`, () => {
  test("is a closed enum — RunEventTypeValues snapshot", () => {
    expect([...RunEventTypeValues].sort()).toMatchInlineSnapshot(`
      [
        "agenome.fused",
        "agenome.mutated",
        "agenome.reproduced",
        "agenome.spawned",
        "candidate.created",
        "candidate_invalidated",
        "check.completed",
        "critic.reviewed",
        "energy.spent",
        "energy_exhausted",
        "fitness.scored",
        "generation.completed",
        "generation.started",
        "generation_failed",
        "lineage.culled",
        "novelty.scored",
        "novelty_scoring_degraded",
        "output_schema_rejected",
        "provider_call_failed",
        "reproduction_aborted_insufficient_parents",
        "run.completed",
        "run.configured",
        "run.failed",
        "run.started",
        "run.stopped",
      ]
    `);
  });

  test("accepts every enumerated event-type value", () => {
    for (const v of RunEventTypeValues) {
      expect(RunEventType.parse(v)).toBe(v);
    }
  });

  test("rejects an unlisted event-type value", () => {
    expect(() => RunEventType.parse("definitely_not_an_event")).toThrow();
    expect(() => RunEventType.parse("run.exploded")).toThrow();
  });
});
