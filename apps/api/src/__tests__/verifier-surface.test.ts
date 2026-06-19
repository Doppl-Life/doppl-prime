import { describe, expect, test } from "vitest";
import * as api from "../index.js";

/**
 * Phase 4 §2.5 acceptance gate at the package boundary. Every export
 * Phase 5 (selection / scoring) and Phase 6 (HTTP) will import from
 * `@doppl/api` for the verifier path is listed here. Adding to the
 * runtime surface is fine; removing or renaming MUST break this test.
 */
const REQUIRED_VERIFIER_EXPORTS = [
  // Isolation seam
  "wrapCandidateAsData",
  "assembleCriticRequest",
  "assembleJudgeRequest",
  "assembleCheckRequest",
  "IsolationViolationError",
  "DATA_OPEN",
  "DATA_CLOSE",
  "DATA_FRAMING",
  // Council
  "criticCall",
  "runCouncil",
  "assignCriticsForGeneration",
  "ROTATION_N_MIN",
  "ROTATION_N_MAX",
  "RotationConfigError",
  // Judge
  "FINAL_JUDGE_RUBRIC",
  "FINAL_JUDGE_POLICY_VERSION",
  "FINAL_JUDGE_RUBRIC_TEMPLATE",
  "judgeCall",
  "runFinalJudge",
  // VerifyHook factory
  "makeVerifyHook",
] as const;

const REQUIRED_CHECK_RUNNER_EXPORTS = [
  "buildCheckRegistry",
  "defineCheckAdapter",
  "CheckRegistryError",
  "runCheck",
  "rerunCheck",
  "LIVE_RERUNNABLE_ADAPTER_IDS",
  "TRANSFER_ADAPTER_IDS",
  "ZEITGEIST_ADAPTER_IDS",
  "ALL_ADAPTERS",
] as const;

describe("spec(§2.5) @doppl/api verifier + check-runner surface", () => {
  for (const name of REQUIRED_VERIFIER_EXPORTS) {
    test(`exports ${name}`, () => {
      expect(api).toHaveProperty(name);
      expect((api as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }
  for (const name of REQUIRED_CHECK_RUNNER_EXPORTS) {
    test(`exports ${name}`, () => {
      expect(api).toHaveProperty(name);
      expect((api as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }

  test("no internal verifier helper leaks (buildCriticSystem, etc.)", () => {
    const exported = new Set(Object.keys(api));
    expect(exported.has("buildCriticSystem")).toBe(false);
    expect(exported.has("buildJudgeSystem")).toBe(false);
    expect(exported.has("buildCheckSystem")).toBe(false);
    expect(exported.has("buildRequest")).toBe(false);
    expect(exported.has("weightedTotal")).toBe(false);
    expect(exported.has("findLatestRecordedResult")).toBe(false);
  });

  test("TRANSFER_ADAPTER_IDS + ZEITGEIST_ADAPTER_IDS each carry 5 ids", () => {
    const transferIds = (api as unknown as Record<string, readonly string[]>).TRANSFER_ADAPTER_IDS;
    const zeitgeistIds = (api as unknown as Record<string, readonly string[]>)
      .ZEITGEIST_ADAPTER_IDS;
    expect(transferIds).toHaveLength(5);
    expect(zeitgeistIds).toHaveLength(5);
  });
});
