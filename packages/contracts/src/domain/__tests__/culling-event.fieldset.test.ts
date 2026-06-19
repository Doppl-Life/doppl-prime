import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { CullingEvent } from "../culling-event.js";

describe(`${spec("§3")} CullingEvent`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(CullingEvent)).toMatchInlineSnapshot(`
      [
        "generationId",
        "id",
        "reason",
        "runId",
        "scoreSnapshot",
        "targetIds",
      ]
    `);
  });

  test("parses a valid culling event", () => {
    const c = {
      id: "cull_1",
      runId: "run_1",
      generationId: "g_1",
      targetIds: ["ag_3", "ag_4"],
      reason: "fitness below median for two consecutive generations",
      scoreSnapshot: { ag_3: 0.12, ag_4: 0.09 },
    };
    expect(CullingEvent.parse(c)).toEqual(c);
  });

  test("requires at least one targetId (an empty cull is a no-op)", () => {
    expect(() =>
      CullingEvent.parse({
        id: "cull_1",
        runId: "run_1",
        generationId: "g_1",
        targetIds: [],
        reason: "x",
        scoreSnapshot: {},
      }),
    ).toThrow();
  });
});
