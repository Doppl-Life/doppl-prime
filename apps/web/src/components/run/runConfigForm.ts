import { RunConfig } from '../../data/contracts';
import type { GenerationOperator, RunCaps } from '../../data/contracts';

/**
 * runConfigForm — the pure form→RunConfig mapping + the cap-max (lowering-only) guard for the run-
 * config panel. Validation is against the FROZEN shared `RunConfig` Zod (never re-implemented). The
 * cap-max check is fail-closed DEFENSE/UX at the browser seam (§14/§17): the API (P6.6) + kernel are
 * the AUTHORITATIVE enforcers — the browser only prevents submitting a cap ABOVE the validated
 * ceiling (overrides may only LOWER within maxima).
 */

export interface RunConfigFormValues {
  seed: string;
  rngSeed: number;
  modelProfile: string;
  scoringPolicyVersion: string;
  enabledSubtypes: { cross_domain_transfer: boolean; zeitgeist_synthesis: boolean };
  /**
   * FV.3 — the FB run-controls (FB.0–FB.4). `operators` = the selected mutagen ideation skills (closed
   * 7-enum, FB.3); `generationBias` = the diverge(+)/converge(−) dial ∈ [−1,1], 0 neutral (FB.4). Both
   * bias GENERATION only (rule #6 — the launcher exposes no judge/scoring lever); threaded additively
   * (omit when unused → a default run is byte-identical to the pre-FB shape).
   */
  operators: GenerationOperator[];
  generationBias: number;
  caps: {
    maxPopulation: number;
    maxGenerations: number;
    energyBudget: number;
    maxSpawnDepth: number;
    maxToolCalls: number;
    /** UX in minutes; converted to the contract's wallClockTimeoutMs (ms) at build time. */
    wallClockMinutes: number;
  };
}

export type CapKey = keyof RunConfigFormValues['caps'];

/**
 * The validated cap maxima — MIRRORS the API's `defaultConfig.caps` (the source of truth) + the
 * prototype run-launcher hard-maxima. This is the client's fail-closed ceiling; swap it for a fetched
 * maxima when a config-maxima endpoint exists. The kernel enforces the real caps regardless (rule #1).
 */
export const CAP_CEILING: RunConfigFormValues['caps'] = {
  maxPopulation: 20,
  maxGenerations: 8,
  energyBudget: 20_000,
  maxSpawnDepth: 5,
  maxToolCalls: 200,
  wallClockMinutes: 15,
};

export const DEFAULT_FORM: RunConfigFormValues = {
  seed: '',
  rngSeed: 42,
  modelProfile: 'mvp-openrouter',
  scoringPolicyVersion: 'scoring-v1',
  enabledSubtypes: { cross_domain_transfer: true, zeitgeist_synthesis: true },
  operators: [],
  generationBias: 0,
  caps: {
    maxPopulation: 18,
    maxGenerations: 5,
    energyBudget: 12_000,
    maxSpawnDepth: 3,
    maxToolCalls: 120,
    wallClockMinutes: 10,
  },
};

const SUBTYPE_KEYS = ['cross_domain_transfer', 'zeitgeist_synthesis'] as const;

/** Lowering-only clamp against the STATIC ceiling: never returns above the ceiling (nor below 1). */
export function clampCap(key: CapKey, value: number): number {
  return Math.max(1, Math.min(value, CAP_CEILING[key]));
}

/**
 * PD.18 — map the API's FETCHED cap maxima (the frozen `RunCaps` from `defaultConfig.caps`) to the
 * form-caps ceiling shape: the contract's `wallClockTimeoutMs` (ms) → the form's `wallClockMinutes`.
 * The RunConfigPanel fetches `/config/caps` + clamps to this REAL ceiling (a static mirror drifts above
 * a low `.env` ceiling → the cap-default 422). The kernel/route stays the sole cap authority (rule #1).
 */
export function capCeilingFromRunCaps(caps: RunCaps): RunConfigFormValues['caps'] {
  return {
    maxPopulation: caps.maxPopulation,
    maxGenerations: caps.maxGenerations,
    energyBudget: caps.energyBudget,
    maxSpawnDepth: caps.maxSpawnDepth,
    maxToolCalls: caps.maxToolCalls,
    wallClockMinutes: Math.floor(caps.wallClockTimeoutMs / 60_000),
  };
}

/** PD.18 — lower each form cap to `[1, ceiling]` against a (fetched or static) ceiling (lowering-only). */
export function clampCapsToCeiling(
  caps: RunConfigFormValues['caps'],
  ceiling: RunConfigFormValues['caps'],
): RunConfigFormValues['caps'] {
  const lower = (key: CapKey): number => Math.max(1, Math.min(caps[key], ceiling[key]));
  return {
    maxPopulation: lower('maxPopulation'),
    maxGenerations: lower('maxGenerations'),
    energyBudget: lower('energyBudget'),
    maxSpawnDepth: lower('maxSpawnDepth'),
    maxToolCalls: lower('maxToolCalls'),
    wallClockMinutes: lower('wallClockMinutes'),
  };
}

/** Map the form to a RunConfig shape (wallClockMinutes → wallClockTimeoutMs). No validation. */
export function buildRunConfig(form: RunConfigFormValues): RunConfig {
  const enabledSubtypes = SUBTYPE_KEYS.filter((k) => form.enabledSubtypes[k]);
  const caps: RunCaps = {
    maxPopulation: form.caps.maxPopulation,
    maxGenerations: form.caps.maxGenerations,
    energyBudget: form.caps.energyBudget,
    maxSpawnDepth: form.caps.maxSpawnDepth,
    maxToolCalls: form.caps.maxToolCalls,
    wallClockTimeoutMs: form.caps.wallClockMinutes * 60_000,
  };
  return {
    seed: form.seed,
    enabledSubtypes,
    caps,
    modelProfile: form.modelProfile,
    scoringPolicyVersion: form.scoringPolicyVersion,
    rngSeed: form.rngSeed,
    // FV.3 — thread the FB run-controls ADDITIVELY: operators only when ≥1 selected (the contract requires
    // min 1 when present), and the dial only when ENGAGED (non-neutral) — so a default run stays byte-
    // identical to the pre-FB.0 RunConfig and the recorded value is the one the operator actually set.
    ...(form.operators.length > 0 ? { generationOperators: form.operators } : {}),
    ...(form.generationBias !== 0 ? { generationBias: form.generationBias } : {}),
  };
}

export type FieldErrors = Record<string, string>;

export type ValidationResult = { ok: true; config: RunConfig } | { ok: false; errors: FieldErrors };

/** A RunConfig issue path → the form field key the panel renders the error against. */
function mapIssuePathToField(path: ReadonlyArray<PropertyKey>): string {
  if (path[0] === 'caps') {
    const capField = String(path[1]);
    return capField === 'wallClockTimeoutMs' ? 'wallClockMinutes' : capField;
  }
  return String(path[0] ?? 'form');
}

/**
 * Validate the form: ≥1 subtype, cap-max (lowering-only) fail-closed, and the frozen RunConfig shape.
 * Returns the typed RunConfig when valid, or per-field errors for inline accessible display.
 */
export function validateForm(form: RunConfigFormValues): ValidationResult {
  const errors: FieldErrors = {};

  if (!form.enabledSubtypes.cross_domain_transfer && !form.enabledSubtypes.zeitgeist_synthesis) {
    errors.enabledSubtypes = 'Enable at least one subtype.';
  }

  for (const key of Object.keys(CAP_CEILING) as CapKey[]) {
    if (form.caps[key] > CAP_CEILING[key]) {
      errors[key] = `Exceeds max ${CAP_CEILING[key]}`;
    }
  }

  const config = buildRunConfig(form);
  const parsed = RunConfig.safeParse(config);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = mapIssuePathToField(issue.path);
      errors[field] ??= issue.message;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, config };
}
