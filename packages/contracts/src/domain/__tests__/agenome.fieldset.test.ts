import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { Agenome, AgenomeStatus, AgenomeStatusValues } from "../agenome.js";

describe(`${spec("§3")} Agenome`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(Agenome)).toMatchInlineSnapshot(`
      [
        "decompositionPolicy",
        "generationId",
        "id",
        "mutationMeta",
        "parentIds",
        "personaWeights",
        "runId",
        "spawnBudget",
        "status",
        "systemPrompt",
        "toolPermissions",
      ]
    `);
  });

  test("parses a gen-0 seeded agenome (no mutationMeta, no parentIds)", () => {
    const ag = {
      id: "ag_1",
      runId: "run_1",
      generationId: "gen_0",
      parentIds: [],
      systemPrompt: "you are an agent",
      personaWeights: { boldness: 0.5, rigor: 0.7 },
      toolPermissions: [],
      decompositionPolicy: "default",
      spawnBudget: 3,
      status: "seeded",
    };
    expect(Agenome.parse(ag)).toEqual(ag);
  });

  test("parses a fused offspring (2 parents)", () => {
    const ag = {
      id: "ag_3",
      runId: "run_1",
      generationId: "gen_1",
      parentIds: ["ag_1", "ag_2"],
      systemPrompt: "fused agent",
      personaWeights: {},
      toolPermissions: ["search"],
      decompositionPolicy: "default",
      spawnBudget: 2,
      mutationMeta: { source: "fusion", drift: 0.1 },
      status: "active",
    };
    expect(Agenome.parse(ag)).toEqual(ag);
  });

  test("rejects unknown fields (.strict())", () => {
    expect(() =>
      Agenome.parse({
        id: "ag_1",
        runId: "r",
        generationId: "g",
        parentIds: [],
        systemPrompt: "x",
        personaWeights: {},
        toolPermissions: [],
        decompositionPolicy: "p",
        spawnBudget: 0,
        status: "seeded",
        extra: 1,
      }),
    ).toThrow();
  });

  test("rejects negative spawnBudget", () => {
    expect(() =>
      Agenome.parse({
        id: "ag_1",
        runId: "r",
        generationId: "g",
        parentIds: [],
        systemPrompt: "x",
        personaWeights: {},
        toolPermissions: [],
        decompositionPolicy: "p",
        spawnBudget: -1,
        status: "seeded",
      }),
    ).toThrow();
  });
});

describe(`${spec("§3")} AgenomeStatus 7-state union`, () => {
  test("is closed — AgenomeStatusValues snapshot", () => {
    expect([...AgenomeStatusValues].sort()).toMatchInlineSnapshot(`
      [
        "active",
        "culled",
        "eligible_parent",
        "failed",
        "reproduced",
        "seeded",
        "spent",
      ]
    `);
  });

  test("accepts each of the 7 states", () => {
    for (const s of AgenomeStatusValues) {
      expect(AgenomeStatus.parse(s)).toBe(s);
    }
  });

  test("rejects unlisted state", () => {
    expect(() => AgenomeStatus.parse("zombie")).toThrow();
    expect(() => AgenomeStatus.parse("active ")).toThrow();
  });
});
