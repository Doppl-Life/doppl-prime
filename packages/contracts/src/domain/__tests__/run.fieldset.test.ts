import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import {
  Run,
  RunStatus,
  RunStatusValues,
  TerminalRunStatus,
  TerminalRunStatusValues,
} from "../run.js";

const validConfig = {
  seed: "s",
  enabledSubtypes: ["cross_domain_transfer"],
  caps: {
    maxPopulation: 8,
    maxGenerations: 5,
    energyBudget: 10_000,
    maxSpawnDepth: 3,
    maxToolCalls: 50,
    wallClockTimeoutMs: 600_000,
  },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  rngSeed: "rng_1",
};

describe(`${spec("§3")} Run`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(Run)).toMatchInlineSnapshot(`
      [
        "completedAt",
        "config",
        "id",
        "startedAt",
        "status",
        "terminalSummary",
      ]
    `);
  });

  test("parses a configured (pre-start) run", () => {
    const r = { id: "run_1", status: "configured", config: validConfig };
    expect(Run.parse(r)).toEqual(r);
  });

  test("parses a completed terminal run", () => {
    const r = {
      id: "run_1",
      status: "completed",
      config: validConfig,
      startedAt: "2026-06-19T12:00:00.000Z",
      completedAt: "2026-06-19T13:00:00.000Z",
      terminalSummary: "8 candidates, winner: cand_42",
    };
    expect(Run.parse(r)).toEqual(r);
  });
});

describe(`${spec("§3")} RunStatus 8-member union`, () => {
  test("is closed", () => {
    expect([...RunStatusValues].sort()).toMatchInlineSnapshot(`
      [
        "cancelled",
        "completed",
        "completing",
        "configured",
        "failed",
        "running",
        "stopped",
        "stopping",
      ]
    `);
    for (const s of RunStatusValues) expect(RunStatus.parse(s)).toBe(s);
    expect(() => RunStatus.parse("paused")).toThrow();
  });

  test("TerminalRunStatus is exactly the 4-member sink subset", () => {
    expect([...TerminalRunStatusValues].sort()).toMatchInlineSnapshot(`
      [
        "cancelled",
        "completed",
        "failed",
        "stopped",
      ]
    `);
    for (const s of TerminalRunStatusValues) expect(TerminalRunStatus.parse(s)).toBe(s);
    expect(() => TerminalRunStatus.parse("running")).toThrow();
  });
});
