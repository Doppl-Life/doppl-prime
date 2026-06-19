import { describe, expect, test } from "vitest";
import { spec } from "../../testing/spec-tag.js";
import { Actor, ActorRoles } from "../actor.js";

describe(`${spec("§4")} actor 7-role union`, () => {
  test("is closed — ActorRoles snapshot", () => {
    expect([...ActorRoles].sort()).toMatchInlineSnapshot(`
      [
        "agenome",
        "check_runner",
        "critic",
        "operator",
        "runtime",
        "selection_controller",
        "system",
      ]
    `);
  });

  test("accepts each of the 7 roles", () => {
    for (const role of ActorRoles) {
      expect(Actor.parse(role)).toBe(role);
    }
  });

  test("rejects unlisted roles", () => {
    expect(() => Actor.parse("developer")).toThrow();
    expect(() => Actor.parse("")).toThrow();
    expect(() => Actor.parse("OPERATOR")).toThrow();
  });
});
