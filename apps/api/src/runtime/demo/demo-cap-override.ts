import type { RunCaps, RunConfig } from "@doppl/contracts";

/**
 * Demo cap override (PD.4 D5). The fallback ladder's "low-cap live" rung
 * lets the operator narrow caps for a tighter demo loop without losing
 * the live-provider path. This module exists to enforce one invariant:
 *
 *   **Override values may only LOWER caps. They may never raise them.**
 *
 * The dashboard's runConfigForm.MAX_CAPS ceiling and the server's
 * RunConfig.parse continue to reject above-ceiling values — this
 * override happens BEFORE either, so its job is to clamp + warn rather
 * than throw. Above-ceiling overrides are silently clamped to the
 * ceiling and a warning is included in the result so the caller can
 * surface it on the response.
 *
 * Mirrors `apps/web/src/panels/runConfigForm.ts` MAX_CAPS — keep aligned.
 */

export const MAX_CAPS: Readonly<RunCaps> = {
  maxPopulation: 16,
  maxGenerations: 12,
  energyBudget: 50_000,
  maxSpawnDepth: 8,
  maxToolCalls: 200,
  wallClockTimeoutMs: 30 * 60 * 1000,
} as const;

export type DemoCapOverride = Partial<RunCaps>;

export interface ApplyDemoOverrideResult {
  config: RunConfig;
  warnings: string[];
}

/**
 * Returns a new RunConfig with caps lowered per the override. Above-
 * ceiling override values are clamped to MAX_CAPS and surface as a
 * warning. Non-positive or non-integer overrides fail downstream
 * RunConfig.parse — no need to re-validate here.
 */
export function applyDemoOverride(
  config: RunConfig,
  override: DemoCapOverride = {},
): ApplyDemoOverrideResult {
  const warnings: string[] = [];
  const caps: RunCaps = { ...config.caps };

  for (const key of Object.keys(MAX_CAPS) as (keyof RunCaps)[]) {
    const overrideValue = override[key];
    if (overrideValue === undefined) continue;
    const ceiling = MAX_CAPS[key];
    let clamped = overrideValue;
    if (clamped > ceiling) {
      warnings.push(
        `cap ${key}: override ${overrideValue} exceeds ceiling ${ceiling}; clamped to ceiling`,
      );
      clamped = ceiling;
    }
    if (clamped < caps[key]) {
      caps[key] = clamped;
    } else if (clamped > caps[key]) {
      warnings.push(
        `cap ${key}: override ${clamped} is above current ${caps[key]}; ignored (override only lowers)`,
      );
    }
  }

  return { config: { ...config, caps }, warnings };
}
