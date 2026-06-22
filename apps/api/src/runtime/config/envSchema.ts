/**
 * Boot env projection (P3.1, ARCHITECTURE.md §15/§14, KEY SAFETY RULE #4).
 *
 * The env record (`process.env`) feeds boot via TWO DISJOINT paths:
 *  1. CREDENTIALS — read ONLY by `assertProviderCredentials(env)` (P2.2); NEVER merged into any config
 *     object (so a secret can never land in the persisted/logged `AppConfig`).
 *  2. CONFIG OVERRIDES — a CLOSED, EXPLICIT allowlist (below): each env var is mapped to exactly one
 *     config path + typed-coerced. NOT a prefix sweep — a prefix sweep could capture a future
 *     secret-shaped `DOPPL_…` var into config; an explicit map cannot. A non-allowlisted env key is
 *     never projected.
 *
 * Returns per-source override fragments (the `env` layer of `defaults < file < env`). Pure — the caller
 * injects the env record (IO at the boundary, LESSON 4).
 */

export interface EnvOverrides {
  runConfig: Record<string, unknown>;
  caps: Record<string, unknown>;
}

/** One allowlist entry: an env var, the source it overrides, the config key, and a typed coercion. */
interface AllowlistEntry {
  envVar: string;
  source: 'runConfig' | 'caps';
  key: string;
  coerce: (raw: string) => unknown;
}

const toInt = (raw: string): unknown => {
  const n = Number(raw);
  return Number.isInteger(n) ? n : raw; // a non-int passes through so the source's Zod schema rejects it
};

/**
 * The CLOSED env→config allowlist. Add a row to expose a new kernel knob to env control; nothing else
 * is projectable. (Credentials are deliberately absent — they go only to `assertProviderCredentials`.)
 */
const ENV_ALLOWLIST: readonly AllowlistEntry[] = [
  { envVar: 'DOPPL_MAX_POPULATION', source: 'caps', key: 'maxPopulation', coerce: toInt },
  { envVar: 'DOPPL_MAX_GENERATIONS', source: 'caps', key: 'maxGenerations', coerce: toInt },
  { envVar: 'DOPPL_ENERGY_BUDGET', source: 'caps', key: 'energyBudget', coerce: toInt },
  { envVar: 'DOPPL_RNG_SEED', source: 'runConfig', key: 'rngSeed', coerce: toInt },
];

/** Project the env record into per-source config-override fragments, via the closed allowlist only. */
export function projectEnvOverrides(env: Record<string, string | undefined>): EnvOverrides {
  const overrides: EnvOverrides = { runConfig: {}, caps: {} };
  for (const entry of ENV_ALLOWLIST) {
    const raw = env[entry.envVar];
    if (raw !== undefined && raw.trim() !== '') {
      overrides[entry.source][entry.key] = entry.coerce(raw);
    }
  }
  return overrides;
}
