import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { EnergyEvent, EnergyEventType, EnergyEventTypeValues } from "../energy-event.js";

describe(`${spec("§4")} EnergyEvent (success-only invariant)`, () => {
  test("field-name set is frozen — no failed/retried/repaired field", () => {
    expect(fieldset(EnergyEvent)).toMatchInlineSnapshot(`
      [
        "actual",
        "agenomeId",
        "estimate",
        "eventType",
        "generationId",
        "id",
        "providerMeta",
        "reason",
        "runId",
        "unit",
      ]
    `);
    const keys = fieldset(EnergyEvent);
    for (const forbidden of ["failed", "retried", "repaired"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  test("unit accepts only 'doppl_energy'", () => {
    const valid = {
      id: "e_1",
      runId: "r_1",
      eventType: "llm",
      estimate: 10,
      actual: 12,
      unit: "doppl_energy",
      reason: "critic review",
    };
    expect(EnergyEvent.parse(valid)).toEqual(valid);

    expect(() => EnergyEvent.parse({ ...valid, unit: "tokens" })).toThrow();
  });

  test("parses with optional generationId / agenomeId / providerMeta", () => {
    const valid = {
      id: "e_1",
      runId: "r_1",
      generationId: "g_1",
      agenomeId: "ag_1",
      eventType: "tool",
      estimate: 1,
      actual: 1,
      unit: "doppl_energy",
      reason: "tool call",
      providerMeta: { route: "openrouter:gpt-4o" },
    };
    expect(EnergyEvent.parse(valid)).toEqual(valid);
  });

  test("rejects negative estimate or actual", () => {
    const base = {
      id: "e_1",
      runId: "r_1",
      eventType: "llm",
      estimate: 10,
      actual: 12,
      unit: "doppl_energy",
      reason: "x",
    };
    expect(() => EnergyEvent.parse({ ...base, estimate: -1 })).toThrow();
    expect(() => EnergyEvent.parse({ ...base, actual: -1 })).toThrow();
  });
});

describe(`${spec("§4")} EnergyEventType 3-member union`, () => {
  test("is closed", () => {
    expect([...EnergyEventTypeValues].sort()).toMatchInlineSnapshot(`
      [
        "llm",
        "spawn",
        "tool",
      ]
    `);
    for (const t of EnergyEventTypeValues) {
      expect(EnergyEventType.parse(t)).toBe(t);
    }
    expect(() => EnergyEventType.parse("network")).toThrow();
  });
});
