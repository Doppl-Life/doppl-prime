import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import {
  LineageEdge,
  LineageGraphProjection,
  LineageNode,
  LineageNodeType,
  LineageNodeTypeValues,
} from "../lineage-graph.js";

describe(`${spec("§9")} LineageNodeType 5-member union`, () => {
  test("is closed and matches the React Flow custom-type categories", () => {
    expect([...LineageNodeTypeValues].sort()).toMatchInlineSnapshot(`
      [
        "agenome",
        "candidate",
        "check_result",
        "critic_review",
        "scoring",
      ]
    `);
    expect(LineageNodeTypeValues).toHaveLength(5);
    for (const t of LineageNodeTypeValues) expect(LineageNodeType.parse(t)).toBe(t);
    expect(() => LineageNodeType.parse("evaluation")).toThrow();
  });
});

describe(`${spec("§9")} LineageNode`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(LineageNode)).toMatchInlineSnapshot(`
      [
        "dataRef",
        "id",
        "label",
        "metrics",
        "status",
        "type",
      ]
    `);
  });

  test("parses a minimal node", () => {
    expect(LineageNode.parse({ id: "n_1", type: "agenome", label: "Agenome 1" })).toBeDefined();
  });

  test("parses a fully-populated node with status (drives selected-winner styling)", () => {
    expect(
      LineageNode.parse({
        id: "cand_winner",
        type: "candidate",
        label: "Selected Winner",
        status: "selected",
        metrics: { fitness: 0.87 },
        dataRef: "event:evt_42",
      }),
    ).toBeDefined();
  });
});

describe(`${spec("§9")} LineageEdge`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(LineageEdge)).toMatchInlineSnapshot(`
      [
        "id",
        "label",
        "source",
        "target",
        "type",
      ]
    `);
  });

  test("parses a minimal edge", () => {
    expect(
      LineageEdge.parse({ id: "e_1", source: "n_1", target: "n_2", type: "parent_of" }),
    ).toBeDefined();
  });
});

describe(`${spec("§9")} LineageGraphProjection`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(LineageGraphProjection)).toMatchInlineSnapshot(`
      [
        "edges",
        "nodes",
        "runId",
        "sequenceThrough",
      ]
    `);
  });

  test("parses an empty projection", () => {
    expect(
      LineageGraphProjection.parse({
        runId: "run_1",
        sequenceThrough: 0,
        nodes: [],
        edges: [],
      }),
    ).toBeDefined();
  });

  test("requires sequenceThrough as a nonneg int (watermark)", () => {
    expect(() =>
      LineageGraphProjection.parse({
        runId: "run_1",
        sequenceThrough: -1,
        nodes: [],
        edges: [],
      }),
    ).toThrow();
  });
});
