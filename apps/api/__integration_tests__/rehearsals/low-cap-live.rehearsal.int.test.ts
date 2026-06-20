import { describe, expect, test } from "vitest";
import { MAX_CAPS, applyDemoOverride } from "../../src/runtime/demo/demo-cap-override.js";
import { REHEARSAL_BASE_CONFIG } from "./helpers.js";

/**
 * §16 demo path #3 — "Low-cap live": the operator narrows caps to
 * tighten the demo loop in front of the audience. This rehearsal
 * exercises the cap-override clamp surface without touching the DB
 * because the override is a pure function over RunConfig.
 *
 *  - applyDemoOverride lowers maxPopulation: 10 → 4.
 *  - Above-ceiling overrides clamp to MAX_CAPS and surface a warning.
 *  - Below-ceiling values that are higher than the current config are
 *    ignored (the override only lowers).
 */

describe("rehearsal §16: low-cap live overrides", () => {
  test("override lowers maxPopulation cleanly", () => {
    const base = {
      ...REHEARSAL_BASE_CONFIG,
      caps: { ...REHEARSAL_BASE_CONFIG.caps, maxPopulation: 10 },
    };
    const { config, warnings } = applyDemoOverride(base, { maxPopulation: 4 });
    expect(config.caps.maxPopulation).toBe(4);
    expect(warnings).toHaveLength(0);
  });

  test("above-ceiling override is clamped to MAX_CAPS with warning", () => {
    const base = {
      ...REHEARSAL_BASE_CONFIG,
      caps: { ...REHEARSAL_BASE_CONFIG.caps, maxPopulation: 10 },
    };
    const { config, warnings } = applyDemoOverride(base, {
      maxPopulation: MAX_CAPS.maxPopulation + 100,
    });
    // Base 10 was below the ceiling — ceiling clamp + "override only lowers"
    // means base survives.
    expect(config.caps.maxPopulation).toBe(10);
    expect(warnings.some((w) => w.includes("exceeds ceiling"))).toBe(true);
  });

  test("override above current but below ceiling is ignored with warning", () => {
    const base = {
      ...REHEARSAL_BASE_CONFIG,
      caps: { ...REHEARSAL_BASE_CONFIG.caps, maxPopulation: 6 },
    };
    const { config, warnings } = applyDemoOverride(base, { maxPopulation: 8 });
    expect(config.caps.maxPopulation).toBe(6);
    expect(warnings.some((w) => w.includes("override only lowers"))).toBe(true);
  });
});
