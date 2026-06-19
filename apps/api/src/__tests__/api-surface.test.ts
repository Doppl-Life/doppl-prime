import { describe, expect, test } from "vitest";
import * as api from "../index.js";

/**
 * The Phase 1 acceptance gate at the package boundary. Every name a
 * downstream track (kernel / verifier / selection / projections) will
 * import from `@doppl/api` is listed here. Adding or removing a name
 * must be a deliberate edit visible in this list.
 */
const REQUIRED_EXPORTS = [
  // Connection
  "createPool",
  "MissingDatabaseUrlError",
  // Migrations
  "runMigrations",
  // Writer
  "appendEvent",
  "nextSequence",
  // Evidence
  "resolveEvidence",
  // Replay
  "replayReader",
  "ReplaySchemaTooNewError",
  "ReplaySequenceGapError",
  // Serialization
  "canonicalize",
] as const;

describe("spec(§2.5) @doppl/api event-store surface — every required export is present", () => {
  for (const name of REQUIRED_EXPORTS) {
    test(`exports ${name}`, () => {
      expect(api).toHaveProperty(name);
      expect((api as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }

  test("no private helper leaks into the public surface", () => {
    const exported = new Set(Object.keys(api));
    // hashRunId would have been an internal helper if it existed.
    expect(exported.has("hashRunId")).toBe(false);
    // Raw drizzle table objects should not be re-exported from the package
    // root; downstream callers go through the writer/reader API.
    expect(exported.has("runEvents")).toBe(false);
    expect(exported.has("runs")).toBe(false);
  });
});
