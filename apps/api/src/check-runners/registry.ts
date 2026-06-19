import type { CheckResult, CheckRunnerAdapter } from "@doppl/contracts";

/**
 * Check-runner allowlist registry (ARCHITECTURE.md §7, IMPLEMENTATION_
 * PLAN.md P4.5). Frozen at module load — there is no runtime API for an
 * agenome or candidate to register a new adapter, and the public
 * registry surface exposes only `has`, `get`, and `ids`. Adapters that
 * would require executing arbitrary or candidate-supplied code are
 * rejected at `defineCheckAdapter`: the input type carries no such
 * field, and a runtime guard rejects an attempt to smuggle one in via
 * type-cast.
 *
 * The actual `runCheck` entry point is in run-check.ts; this file just
 * defines the registry shape and the adapter-builder.
 */

export interface CheckInput {
  /** The candidate being evaluated. */
  candidate: unknown;
  /**
   * Adapter-specific extra inputs. Keeps the registry shape uniform
   * while letting individual adapters declare what they actually need
   * in their own typed wrappers.
   */
  extras?: Record<string, unknown>;
}

export interface CheckCtx {
  /**
   * `recorded` (default) routes retrieval calls through the recorded
   * fallback corpus + RecordedGateway. `live` lets adapters that support
   * it call live retrieval / model providers — used by the U10 live
   * re-run path only.
   */
  mode?: "recorded" | "live";
  /**
   * Generic carry-bag for adapter dependencies (gateway, retrieval
   * source, corpus snapshots, etc.). Adapters narrow this via their
   * own typed accessors.
   */
  deps?: Record<string, unknown>;
}

export type CheckRunnerFn = (
  input: CheckInput,
  ctx: CheckCtx,
) => Promise<Omit<CheckResult, "id" | "candidateId">>;

export interface RegisteredCheckAdapter {
  readonly adapter: CheckRunnerAdapter;
  readonly fn: CheckRunnerFn;
}

export interface DefineCheckAdapterInput {
  id: string;
  checkType: string;
  description: string;
  capabilities?: string[];
  fn: CheckRunnerFn;
}

export class CheckRegistryError extends Error {
  constructor(reason: string) {
    super(`CheckRegistry: ${reason}`);
    this.name = "CheckRegistryError";
  }
}

export function defineCheckAdapter(input: DefineCheckAdapterInput): RegisteredCheckAdapter {
  if (!input.id || !input.checkType || !input.description) {
    throw new CheckRegistryError("id, checkType, and description are required");
  }
  if (typeof input.fn !== "function") {
    throw new CheckRegistryError(`adapter "${input.id}" must declare an async fn`);
  }
  // Belt-and-suspenders: the public input type does not carry an `execute`
  // / `executing` / `command` / `eval` field; reject any cast-through.
  const banned = ["execute", "executing", "command", "eval", "shell"] as const;
  for (const key of banned) {
    if ((input as unknown as Record<string, unknown>)[key] !== undefined) {
      throw new CheckRegistryError(
        `adapter "${input.id}" carries forbidden field "${key}" — adapters are non-executing`,
      );
    }
  }
  return Object.freeze({
    adapter: Object.freeze({
      id: input.id,
      checkType: input.checkType,
      description: input.description,
      capabilities: Object.freeze([...(input.capabilities ?? [])]) as string[],
    }) as CheckRunnerAdapter,
    fn: input.fn,
  });
}

export interface CheckRegistry {
  has(id: string): boolean;
  get(id: string): RegisteredCheckAdapter | undefined;
  ids(): readonly string[];
}

export function buildCheckRegistry(adapters: RegisteredCheckAdapter[]): CheckRegistry {
  const map = new Map<string, RegisteredCheckAdapter>();
  for (const a of adapters) {
    if (map.has(a.adapter.id)) {
      throw new CheckRegistryError(`duplicate adapter id: "${a.adapter.id}"`);
    }
    map.set(a.adapter.id, a);
  }
  const ids = Object.freeze([...map.keys()]) as readonly string[];
  return Object.freeze({
    has: (id: string) => map.has(id),
    get: (id: string) => map.get(id),
    ids: () => ids,
  });
}
