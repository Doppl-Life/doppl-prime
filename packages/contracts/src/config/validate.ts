import { RunConfig } from "../run/run-config.js";

/**
 * Boot-time config validation entry. Layers three optional sources in
 * order — `defaults` < `fromFile` < `fromEnv` — and parses the merged
 * result against RunConfig. Throws ConfigValidationError naming the
 * first invalid field path so the operator gets a clear, fail-fast
 * message at boot (ARCHITECTURE.md §15, REQ-NF-001).
 */

export class ConfigValidationError extends Error {
  public readonly field: string;
  public readonly reason: string;
  constructor(field: string, reason: string) {
    super(`Config validation failed at ${field}: ${reason}`);
    this.name = "ConfigValidationError";
    this.field = field;
    this.reason = reason;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const key of Object.keys(b)) {
    const bv = b[key];
    if (bv === undefined) continue;
    const av = a[key];
    if (isPlainObject(av) && isPlainObject(bv)) {
      out[key] = deepMerge(av, bv);
    } else {
      out[key] = bv;
    }
  }
  return out;
}

export interface BootConfigSources {
  defaults?: Record<string, unknown>;
  fromFile?: Record<string, unknown>;
  fromEnv?: Record<string, unknown>;
}

export function validateBootConfig(sources: BootConfigSources): RunConfig {
  const merged = deepMerge(
    deepMerge(sources.defaults ?? {}, sources.fromFile ?? {}),
    sources.fromEnv ?? {},
  );
  const result = RunConfig.safeParse(merged);
  if (result.success) return result.data;
  const first = result.error.errors[0];
  if (!first) {
    // Zod always populates errors on failure; this is defensive only.
    throw new ConfigValidationError("(unknown)", "validation failed");
  }
  const fieldPath = first.path.length > 0 ? first.path.join(".") : "(root)";
  throw new ConfigValidationError(fieldPath, first.message);
}
