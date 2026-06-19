import { describe, expect, test } from "vitest";
import * as api from "../index.js";

/**
 * Phase 3 §2.5 acceptance gate at the package boundary. Every name a
 * downstream track (the eventual Phase 6 HTTP layer, plus the Phase 4
 * verifier and Phase 5 selection hooks) will import from `@doppl/api`
 * for the runtime path is listed here.
 */
const REQUIRED_RUNTIME_EXPORTS = [
  // Submission + worker
  "startRun",
  "Worker",
  "RunAlreadyActiveError",
  // Generation loop
  "runGeneration",
  // State machines
  "RunStateMachine",
  "GenerationStateMachine",
  "CandidateStateMachine",
  "AgenomeStateMachine",
  "IllegalTransitionError",
  // Caps + kill switch
  "createCapEnforcer",
  "createKillSwitch",
  "CapExhaustedError",
  // Energy ledger
  "createEnergyLedger",
  // RNG
  "createSeededRng",
  // Terminal + recovery
  "classifyTerminal",
  "recoverIncompleteRuns",
  // Repair edge
  "handleStructuredOutput",
  // Gen-0 seeds
  "defaultGen0Bundle",
  "materializeGen0Bundle",
] as const;

describe("spec(§2.5) @doppl/api runtime surface", () => {
  for (const name of REQUIRED_RUNTIME_EXPORTS) {
    test(`exports ${name}`, () => {
      expect(api).toHaveProperty(name);
      expect((api as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }

  test("no private helper leaks (buildRunState etc. stay internal)", () => {
    const exported = new Set(Object.keys(api));
    expect(exported.has("buildRunState")).toBe(false);
    expect(exported.has("emitCapExhausted")).toBe(false);
    expect(exported.has("NON_TERMINAL_STATUSES")).toBe(false);
  });
});
