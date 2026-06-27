import type { ZodType } from 'zod';
import { RunCaps, ScoringPolicy, validateRunConfig } from '@doppl/contracts';
import { assertProviderCredentials, loadModelRegistry } from '../../model-gateway/registry';
import { deepMerge } from '../../shared/deep-merge';
import { summarizeZodIssues } from '../../shared/zod-errors';
import {
  DEFAULT_CAPS,
  DEFAULT_PROBLEM_SETS,
  DEFAULT_REGISTRY,
  DEFAULT_RUN_CONFIG,
  DEFAULT_SCORING_POLICY,
  ProblemSets,
} from './configSchema';
import type { AppConfig } from './configSchema';
import { projectEnvOverrides } from './envSchema';
import { SeedAgenomeSet, selectSeedSet } from '../seed/seedAgenomes.config';
import { CostMapConfigSchema, DEFAULT_COST_MAP } from '../energy/costMap';
import { parseMutationStrategy } from '../loop/mutagenStrategy';

export type { AppConfig } from './configSchema';

/**
 * The single boot-config entry point (P3.1, ARCHITECTURE.md §5/§15/§14, KEY SAFETY RULE #4).
 *
 * `loadConfig({ env, fileSources })` composes the canonical validators — `validateRunConfig` (P0.3),
 * `loadModelRegistry` + `assertProviderCredentials` (P2.2) — plus scoring-policy / caps / problem-set
 * Zod validation into ONE deep-frozen immutable `AppConfig`. Boot fails fast on any schema violation
 * with a field-pointing (path + code) error that never echoes a value (rule #4 / LESSON 26). Precedence
 * is `defaults < file < env`; credentials are env-only (assertProviderCredentials) and never enter the
 * config object. PURE — file reading + `process.env` are the boot caller's job (IO at the boundary,
 * LESSON 4).
 */

export interface FileSources {
  runConfig?: Record<string, unknown>;
  registry?: Record<string, unknown>;
  scoringPolicy?: Record<string, unknown>;
  caps?: Record<string, unknown>;
  costMap?: Record<string, unknown>;
  problemSets?: unknown;
  seedSet?: unknown;
}

export interface LoadConfigInput {
  env: Record<string, string | undefined>;
  fileSources: FileSources;
}

/** Validate a merged source against its schema; on failure throw a field-pointing, no-value-echo error. */
function validateSource<T>(label: string, schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid ${label} configuration — ${summarizeZodIssues(result.error)}`);
  }
  return result.data;
}

// Recursively freeze a value bottom-up. Input is exclusively Zod-parsed output (strictObject/array/
// scalars → a fresh ACYCLIC tree), so no visited-set/cycle guard is needed; never call on a structure
// that could be cyclic.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export function loadConfig({ env, fileSources }: LoadConfigInput): AppConfig {
  // 1. Required env (provider keys + DB URL) — fail-fast, names the var not the value (rule #4 / §14).
  assertProviderCredentials(env);

  // 2. Project the env record into per-source override fragments via the CLOSED allowlist (credentials
  //    are NOT in the allowlist, so they never enter the config merge).
  const envOverrides = projectEnvOverrides(env);

  // 3. Compose each source through `defaults < file < env`, validated by its canonical schema.
  const runConfig = validateRunConfig({
    defaults: DEFAULT_RUN_CONFIG,
    file: fileSources.runConfig ?? {},
    env: envOverrides.runConfig,
  });

  const registry = loadModelRegistry({
    defaults: DEFAULT_REGISTRY,
    file: fileSources.registry ?? {},
    env: {},
  });

  const scoringPolicy = validateSource(
    'scoring-policy',
    ScoringPolicy,
    deepMerge(DEFAULT_SCORING_POLICY as Record<string, unknown>, fileSources.scoringPolicy ?? {}),
  );

  const caps = validateSource(
    'run-caps',
    RunCaps,
    deepMerge(
      deepMerge(DEFAULT_CAPS as unknown as Record<string, unknown>, fileSources.caps ?? {}),
      envOverrides.caps,
    ),
  );

  const costMap = validateSource(
    'cost-map',
    CostMapConfigSchema,
    deepMerge(DEFAULT_COST_MAP as unknown as Record<string, unknown>, fileSources.costMap ?? {}),
  );

  const problemSets = validateSource(
    'problem-sets',
    ProblemSets,
    fileSources.problemSets ?? DEFAULT_PROBLEM_SETS,
  );

  // HG1 ("give the climb room") — the boot seed baseline is selected by `DOPPL_SEED_PROFILE`
  // (default → DEFAULT_SEED_SET = HEAD-identical; `weak` → WEAK_SEED_SET for a headroom-bearing climb).
  // An explicit `fileSources.seedSet` still overrides the profile (file wins).
  const seedSet = validateSource(
    'seed-set',
    SeedAgenomeSet,
    fileSources.seedSet ?? selectSeedSet(env.DOPPL_SEED_PROFILE),
  );

  // EXPERIMENT — the mutagen-dynamics strategy under test (env-gated; garbage/absent → fusion_only = HEAD).
  const mutationStrategy = parseMutationStrategy(env.DOPPL_MUTATION_STRATEGY);

  // ELITISM (anti-regression) — the top-K scored survivors the successor hook carries UNCHANGED into the
  // next generation (env-gated DOPPL_ELITE_COUNT; absent/garbage → 1 = carry the single best). Bounded to
  // [0, maxPopulation]; the kernel still clamps the returned population (rule #1). 0 = offspring-only control.
  const eliteCount = parseEliteCount(env.DOPPL_ELITE_COUNT, caps.maxPopulation);

  // HALL-OF-FAME CARRY (the ratchet) — the cross-generation champion the loop always breeds against, even if
  // its re-rolled candidate was culled this generation (env-gated DOPPL_HALL_OF_FAME_CARRY; absent/garbage →
  // 0 = HEAD-identical). Bounded to [0, maxPopulation]; a PARENT only, never raises the offspring count (#1).
  const hallOfFameCarry = parseHallOfFameCarry(env.DOPPL_HALL_OF_FAME_CARRY, caps.maxPopulation);

  // 4. One composed, deep-frozen immutable handle — downstream kernel code cannot mutate boot config.
  return deepFreeze({
    runConfig,
    registry,
    scoringPolicy,
    caps,
    costMap,
    problemSets,
    seedSet,
    mutationStrategy,
    eliteCount,
    hallOfFameCarry,
  });
}

/** Parse `DOPPL_ELITE_COUNT` → a non-negative integer clamped to `maxPopulation`; absent/garbage/negative
 *  → 1 (carry the single best survivor). An explicit `0` disables elitism (the offspring-only control). */
function parseEliteCount(raw: string | undefined, maxPopulation: number): number {
  if (raw === undefined || raw.trim() === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 1;
  return Math.min(n, maxPopulation);
}

/** Parse `DOPPL_HALL_OF_FAME_CARRY` → a non-negative integer clamped to `maxPopulation`; absent/garbage/
 *  negative → 0 (the ratchet is OFF = HEAD-identical). An explicit `> 0` enables the champion carry. */
function parseHallOfFameCarry(raw: string | undefined, maxPopulation: number): number {
  if (raw === undefined || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, maxPopulation);
}
