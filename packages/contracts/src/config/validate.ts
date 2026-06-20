import { RunConfig } from '../run/run-config';

/**
 * The three config layers the boot loader provides, in increasing precedence (`defaults < file <
 * env`). Each is an already-loaded plain object — the boot layer does the file/`process.env` reading.
 */
export interface RunConfigSources {
  defaults: Record<string, unknown>;
  file: Record<string, unknown>;
  env: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Prototype-polluting / JS-internal key names are never valid config fields — skip them in the
// merge (defense-in-depth: even though boot config is trusted, this keeps the merge pollution-safe
// and avoids a confusing "Unrecognized key: constructor" boot error).
const DANGEROUS_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Merge `override` onto `base`: nested plain objects merge field-by-field (so a layer overriding one
 * cap keeps its siblings); arrays and scalars from `override` replace wholesale. Inputs are trusted
 * boot config (own enumerable keys only via Object.entries).
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const existing = result[key];
    result[key] =
      isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return result;
}

/**
 * Validate a run configuration from already-loaded `sources`, applying `defaults < file < env`
 * precedence (deep-merge for nested objects, replace for arrays/scalars) and validating the result
 * against {@link RunConfig}.
 *
 * PURE: never reads files or `process.env` — that IO is the boot layer's job (`packages/contracts`
 * is env-less, §9). Throws a clear, field-identifying error (each offending path named) so boot
 * fails fast on an invalid config (§15).
 */
export function validateRunConfig(sources: RunConfigSources): RunConfig {
  const merged = deepMerge(deepMerge(sources.defaults, sources.file), sources.env);
  const result = RunConfig.safeParse(merged);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid run configuration — ${details}`);
  }
  return result.data;
}
