import { RunCaps, RunConfig } from "../data/contracts.js";

/**
 * Form ↔ RunConfig translator with the cap-max ceiling guard (P7.5,
 * D5). The dashboard MAY only LOWER caps within validated maxima —
 * any value above the ceiling is rejected at the browser seam before
 * the request leaves. This mirrors §17 / REQ-UX-004.
 *
 * The validated maxima here are the demo's safety ceilings; they
 * must stay aligned with what the server's RunCaps schema accepts.
 * If the schema's max changes, this guard's MAX_CAPS must update.
 */

export const MAX_CAPS = {
  maxPopulation: 16,
  maxGenerations: 12,
  energyBudget: 50_000,
  maxSpawnDepth: 8,
  maxToolCalls: 200,
  wallClockTimeoutMs: 30 * 60 * 1000, // 30 minutes
} as const;

export interface RunConfigFormState {
  seed: string;
  rngSeed: string;
  enabledSubtypes: {
    cross_domain_transfer: boolean;
    zeitgeist_synthesis: boolean;
  };
  modelProfile: string;
  scoringPolicyVersion: string;
  caps: {
    maxPopulation: number;
    maxGenerations: number;
    energyBudget: number;
    maxSpawnDepth: number;
    maxToolCalls: number;
    wallClockTimeoutMs: number;
  };
}

export const DEFAULT_FORM_STATE: RunConfigFormState = {
  seed: "operator-seed",
  rngSeed: "rng-1",
  enabledSubtypes: { cross_domain_transfer: true, zeitgeist_synthesis: true },
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  caps: {
    maxPopulation: 4,
    maxGenerations: 3,
    energyBudget: 1_000,
    maxSpawnDepth: 2,
    maxToolCalls: 10,
    wallClockTimeoutMs: 60_000,
  },
};

export type FormFieldPath = string[];

export interface FormError {
  path: FormFieldPath;
  message: string;
}

export type FormToConfigResult =
  | { ok: true; config: import("../data/contracts.js").RunConfigT }
  | { ok: false; errors: FormError[] };

export function formToConfig(form: RunConfigFormState): FormToConfigResult {
  const errors: FormError[] = [];

  // Cap-max guard (fail-closed)
  if (form.caps.maxPopulation > MAX_CAPS.maxPopulation) {
    errors.push({
      path: ["caps", "maxPopulation"],
      message: `must not exceed validated maximum (${MAX_CAPS.maxPopulation})`,
    });
  }
  if (form.caps.maxGenerations > MAX_CAPS.maxGenerations) {
    errors.push({
      path: ["caps", "maxGenerations"],
      message: `must not exceed validated maximum (${MAX_CAPS.maxGenerations})`,
    });
  }
  if (form.caps.energyBudget > MAX_CAPS.energyBudget) {
    errors.push({
      path: ["caps", "energyBudget"],
      message: `must not exceed validated maximum (${MAX_CAPS.energyBudget})`,
    });
  }
  if (form.caps.maxSpawnDepth > MAX_CAPS.maxSpawnDepth) {
    errors.push({
      path: ["caps", "maxSpawnDepth"],
      message: `must not exceed validated maximum (${MAX_CAPS.maxSpawnDepth})`,
    });
  }
  if (form.caps.maxToolCalls > MAX_CAPS.maxToolCalls) {
    errors.push({
      path: ["caps", "maxToolCalls"],
      message: `must not exceed validated maximum (${MAX_CAPS.maxToolCalls})`,
    });
  }
  if (form.caps.wallClockTimeoutMs > MAX_CAPS.wallClockTimeoutMs) {
    errors.push({
      path: ["caps", "wallClockTimeoutMs"],
      message: `must not exceed validated maximum (${MAX_CAPS.wallClockTimeoutMs})`,
    });
  }

  const enabledSubtypes: string[] = [];
  if (form.enabledSubtypes.cross_domain_transfer) enabledSubtypes.push("cross_domain_transfer");
  if (form.enabledSubtypes.zeitgeist_synthesis) enabledSubtypes.push("zeitgeist_synthesis");
  if (enabledSubtypes.length === 0) {
    errors.push({
      path: ["enabledSubtypes"],
      message: "select at least one candidate subtype (both are equal must-ship)",
    });
  }

  const capParsed = RunCaps.safeParse(form.caps);
  if (!capParsed.success) {
    for (const issue of capParsed.error.issues) {
      errors.push({ path: ["caps", ...issue.path.map(String)], message: issue.message });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const config = {
    seed: form.seed,
    enabledSubtypes,
    caps: capParsed.success ? capParsed.data : form.caps,
    modelProfile: form.modelProfile,
    scoringPolicyVersion: form.scoringPolicyVersion,
    rngSeed: form.rngSeed,
  };
  const parsed = RunConfig.safeParse(config);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((e) => ({
        path: e.path.map(String),
        message: e.message,
      })),
    };
  }
  return { ok: true, config: parsed.data };
}
