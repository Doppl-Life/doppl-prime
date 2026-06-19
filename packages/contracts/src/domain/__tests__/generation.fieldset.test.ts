import { describe, expect, test } from "vitest";
import { fieldset } from "../../testing/fieldset-snapshot.js";
import { spec } from "../../testing/spec-tag.js";
import { Generation, GenerationStatus, GenerationStatusValues } from "../generation.js";

describe(`${spec("§3")} Generation`, () => {
  test("field-name set is frozen", () => {
    expect(fieldset(Generation)).toMatchInlineSnapshot(`
      [
        "completedAt",
        "id",
        "index",
        "runId",
        "startedAt",
        "status",
      ]
    `);
  });

  test("parses a generation with degraded state (partial-failure edge)", () => {
    const g = {
      id: "g_1",
      runId: "run_1",
      index: 0,
      status: "degraded",
      startedAt: "2026-06-19T12:00:00.000Z",
    };
    expect(Generation.parse(g)).toEqual(g);
  });
});

describe(`${spec("§3")} GenerationStatus 9-member union`, () => {
  test("is closed and includes 'degraded' (partial-failure edge per §3)", () => {
    expect([...GenerationStatusValues].sort()).toMatchInlineSnapshot(`
      [
        "completed",
        "degraded",
        "failed",
        "pending",
        "reproducing",
        "running",
        "scoring",
        "skipped",
        "verifying",
      ]
    `);
    expect(GenerationStatusValues).toHaveLength(9);
    for (const s of GenerationStatusValues) expect(GenerationStatus.parse(s)).toBe(s);
    expect(() => GenerationStatus.parse("paused")).toThrow();
  });
});
