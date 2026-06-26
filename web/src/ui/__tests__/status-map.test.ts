import { describe, expect, test } from "vitest";
import { NEUTRAL, getStatusToken } from "../status-map.js";

describe("getStatusToken", () => {
  test("known agenome status returns specific token", () => {
    const t = getStatusToken("agenome", "active");
    expect(t.label).toBe("Active");
    expect(t.shape).toBe("square");
  });

  test("known check status returns specific token", () => {
    expect(getStatusToken("check", "passed").label).toBe("Passed");
    expect(getStatusToken("check", "failed").shape).toBe("triangle");
    expect(getStatusToken("check", "skipped").shape).toBe("diamond");
  });

  test("known run terminal states are mapped", () => {
    expect(getStatusToken("run", "completed").label).toBe("Completed");
    expect(getStatusToken("run", "failed").shape).toBe("triangle");
    expect(getStatusToken("run", "stopped").shape).toBe("diamond");
    expect(getStatusToken("run", "cancelled").shape).toBe("triangle");
  });

  test("run-mode tokens distinguish live/replay/polling/idle", () => {
    expect(getStatusToken("run-mode", "live").label).toBe("LIVE");
    expect(getStatusToken("run-mode", "replay").label).toBe("REPLAY");
    expect(getStatusToken("run-mode", "polling").label).toMatch(/DEGRADED/);
    expect(getStatusToken("run-mode", "idle").label).toMatch(/IDLE/);
  });

  test("unknown status returns NEUTRAL", () => {
    expect(getStatusToken("agenome", "nope")).toBe(NEUTRAL);
    expect(getStatusToken("run", "nope")).toBe(NEUTRAL);
  });

  test("null/undefined status returns NEUTRAL", () => {
    expect(getStatusToken("check", null)).toBe(NEUTRAL);
    expect(getStatusToken("check", undefined)).toBe(NEUTRAL);
  });

  test("every token has a non-empty aria label", () => {
    const all = [
      getStatusToken("agenome", "active"),
      getStatusToken("candidate", "selected"),
      getStatusToken("check", "passed"),
      getStatusToken("run", "running"),
      getStatusToken("run-mode", "live"),
      NEUTRAL,
    ];
    for (const t of all) {
      expect(t.aria.length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.color.length).toBeGreaterThan(0);
    }
  });
});
