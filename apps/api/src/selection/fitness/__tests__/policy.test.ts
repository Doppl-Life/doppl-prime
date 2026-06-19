import { describe, expect, test } from "vitest";
import { SCORING_POLICY_V1, applyPolicy } from "../policy.js";

describe("SCORING_POLICY_V1", () => {
  test("version is v1", () => {
    expect(SCORING_POLICY_V1.version).toBe("v1");
  });

  test("weights are pinned per D3", () => {
    expect(SCORING_POLICY_V1.weights.critic).toBe(1.0);
    expect(SCORING_POLICY_V1.weights.subtype_check).toBe(1.0);
    expect(SCORING_POLICY_V1.weights.novelty).toBe(1.0);
    expect(SCORING_POLICY_V1.weights.judge_acceptance).toBe(1.0);
    expect(SCORING_POLICY_V1.weights.energy_efficiency).toBe(0.1);
  });
});

describe("applyPolicy", () => {
  test("all components present and 1 → total = 4.1", () => {
    const applied = applyPolicy(SCORING_POLICY_V1, {
      critic: 1,
      subtype_check: 1,
      novelty: 1,
      judge_acceptance: 1,
      energy_efficiency: 1,
    });
    expect(applied.total).toBeCloseTo(4.1, 10);
  });

  test("all components 0 → total = 0", () => {
    const applied = applyPolicy(SCORING_POLICY_V1, {
      critic: 0,
      subtype_check: 0,
      novelty: 0,
      judge_acceptance: 0,
      energy_efficiency: 0,
    });
    expect(applied.total).toBe(0);
  });

  test("judge null → component excluded from total, explanation flags it", () => {
    const applied = applyPolicy(SCORING_POLICY_V1, {
      critic: 0.5,
      subtype_check: 0.5,
      novelty: 0.5,
      judge_acceptance: null,
      energy_efficiency: 1,
    });
    // total = 0.5 + 0.5 + 0.5 + 0 (judge) + 0.1 = 1.6
    expect(applied.total).toBeCloseTo(1.6, 10);
    expect(applied.explanation).toContain("judge_acceptance: raw=null");
    expect(applied.explanation).toContain("not present");
  });

  test("explanation enumerates every component with raw + weight + contrib", () => {
    const applied = applyPolicy(SCORING_POLICY_V1, {
      critic: 0.6,
      subtype_check: 0.8,
      novelty: 0.4,
      judge_acceptance: 0.7,
      energy_efficiency: 0.9,
    });
    expect(applied.explanation).toContain("critic: raw=0.600 weight=1.00 contrib=0.600");
    expect(applied.explanation).toContain("energy_efficiency: raw=0.900 weight=0.10 contrib=0.090");
    expect(applied.explanation).toContain("policyVersion=v1");
  });

  test("unknown component in input is silently ignored (policy is the authority)", () => {
    const applied = applyPolicy(SCORING_POLICY_V1, {
      critic: 1,
      subtype_check: 1,
      novelty: 1,
      judge_acceptance: 1,
      energy_efficiency: 1,
      mystery: 999,
    });
    expect(applied.total).toBeCloseTo(4.1, 10);
  });

  test("total is reconstructable from components + policy alone", () => {
    const components = {
      critic: 0.3,
      subtype_check: 0.4,
      novelty: 0.5,
      judge_acceptance: 0.6,
      energy_efficiency: 0.7,
    };
    const first = applyPolicy(SCORING_POLICY_V1, components);
    const second = applyPolicy(SCORING_POLICY_V1, components);
    expect(first.total).toBe(second.total);
  });

  test("componentTotals carries per-name contributions", () => {
    const applied = applyPolicy(SCORING_POLICY_V1, {
      critic: 0.5,
      subtype_check: 0.5,
      novelty: 0.5,
      judge_acceptance: 0.5,
      energy_efficiency: 0.5,
    });
    expect(applied.componentTotals.critic).toBeCloseTo(0.5, 10);
    expect(applied.componentTotals.energy_efficiency).toBeCloseTo(0.05, 10);
  });
});
