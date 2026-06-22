import {
  type ModelRole,
  ModelRoleValues,
  type ModelRoute as ModelRouteContract,
  ModelRoute as ModelRouteSchema,
} from "@doppl/contracts";
import { GatewayConfigError, RouteNotFoundError } from "./errors.js";

/**
 * Convenience aliases so call sites read naturally and the value-vs-type
 * symbol confusion stays out of the rest of the file.
 */
export type ModelRoute = ModelRouteContract;

/**
 * The MVP route matrix per the plan's High-Level Technical Design section.
 * One primary route per role; one fallback route id (string form
 * `<provider>:<modelId>`) the dispatcher (U3) will try on primary failure.
 *
 * Capability flags are set per route so the dispatcher can decide whether
 * to ask for `response_format: json_schema` (only when
 * `capabilities.structuredOutputs === true`).
 */
const GEN_CAPS = {
  structuredOutputs: true,
  toolCalling: false,
  embeddings: false,
  streaming: true,
} as const;

const EMBED_CAPS = {
  structuredOutputs: false,
  toolCalling: false,
  embeddings: true,
  streaming: false,
} as const;

export const defaultRoutes: Record<ModelRole, ModelRoute> = {
  population_generator: {
    role: "population_generator",
    provider: "openrouter",
    // openai/gpt-4o-mini honors strict json_schema enforcement; the
    // previous primary (meta-llama/llama-3.3-70b-instruct) silently
    // skipped required schema fields like `explanation`. Llama stays
    // as a fallback for outages.
    modelId: "openai/gpt-4o-mini",
    capabilities: GEN_CAPS,
    fallbackRouteIds: ["openrouter:meta-llama/llama-3.3-70b-instruct"],
  },
  critic: {
    role: "critic",
    provider: "openrouter",
    // Was anthropic/claude-3.5-sonnet — that model id 404s on the
    // current OpenRouter catalog ("No endpoints found"). Swap to
    // openai/gpt-4o which is on OpenRouter, supports strict
    // json_schema (the critic-output schema is strict), and has a
    // gpt-4o-mini fallback that's already proven via
    // population_generator.
    modelId: "openai/gpt-4o",
    capabilities: GEN_CAPS,
    fallbackRouteIds: ["openrouter:openai/gpt-4o-mini"],
  },
  subtype_check: {
    role: "subtype_check",
    provider: "openrouter",
    modelId: "openai/gpt-4o-mini",
    capabilities: GEN_CAPS,
    // Was anthropic/claude-3.5-haiku — same 404 issue. gpt-4o is a
    // strictly stronger fallback than the original mini→haiku chain.
    fallbackRouteIds: ["openrouter:openai/gpt-4o"],
  },
  embedding: {
    role: "embedding",
    provider: "openai-embedding",
    modelId: "text-embedding-3-small",
    capabilities: EMBED_CAPS,
    fallbackRouteIds: ["openai-embedding:text-embedding-3-large"],
  },
  final_judge: {
    role: "final_judge",
    provider: "openrouter",
    // Same anthropic 404 fix as critic.
    modelId: "openai/gpt-4o",
    capabilities: GEN_CAPS,
    fallbackRouteIds: ["openrouter:openai/gpt-4o-mini"],
  },
  fusion_synthesis: {
    role: "fusion_synthesis",
    provider: "openrouter",
    modelId: "openai/gpt-4o",
    capabilities: GEN_CAPS,
    // Was anthropic/claude-3.5-sonnet fallback — replaced with
    // openai/gpt-4o-mini for the same 404 reason.
    fallbackRouteIds: ["openrouter:openai/gpt-4o-mini"],
  },
};

/**
 * Resolves the `role → ModelRoute` mapping at boot. Every role is
 * required; missing role or invalid route shape throws `GatewayConfigError`
 * with the failing role named — the §15 fail-fast pin.
 */
export interface GatewayRegistry {
  resolveRoute(role: ModelRole): ModelRoute;
}

export function createRegistry(routes: Record<ModelRole, ModelRoute>): GatewayRegistry {
  // 1. Every role must be present.
  for (const role of ModelRoleValues) {
    if (!(role in routes)) {
      throw new GatewayConfigError(`registry.${role}: role not covered`);
    }
  }
  // 2. Each route must be a structurally-valid ModelRoute.
  const validated: Partial<Record<ModelRole, ModelRoute>> = {};
  for (const [role, route] of Object.entries(routes) as [ModelRole, ModelRoute][]) {
    const parsed = ModelRouteSchema.safeParse(route);
    if (!parsed.success) {
      throw new GatewayConfigError(
        `registry.${role}: ${parsed.error.errors[0]?.message ?? "invalid"}`,
      );
    }
    validated[role] = parsed.data;
  }
  // 3. Return the resolver.
  return {
    resolveRoute(role) {
      const r = validated[role];
      if (!r) throw new RouteNotFoundError(role);
      return r;
    },
  };
}

/**
 * Env var name for the role override. Format: `DOPPL_ROUTE_<UPPER_SNAKE>`.
 * Value format: `<provider>:<modelId>` (e.g. `openrouter:openai/gpt-4o`).
 * Capabilities are inherited from the prior route for that role — overriding
 * the model alone does not change which capabilities apply to the role
 * (a generation role stays a generation role).
 */
export function modelRoleEnvVar(role: ModelRole): string {
  return `DOPPL_ROUTE_${role.toUpperCase()}`;
}

interface ParsedOverride {
  provider: string;
  modelId: string;
}

function parseRouteOverride(value: string, role: ModelRole): ParsedOverride {
  const idx = value.indexOf(":");
  if (idx <= 0 || idx === value.length - 1) {
    throw new GatewayConfigError(
      `registry.${role}: override must be "<provider>:<modelId>" (got "${value}")`,
    );
  }
  return {
    provider: value.slice(0, idx),
    modelId: value.slice(idx + 1),
  };
}

function applyOverride(base: ModelRoute, override: ParsedOverride, role: ModelRole): ModelRoute {
  return {
    role,
    provider: override.provider,
    modelId: override.modelId,
    capabilities: base.capabilities,
    fallbackRouteIds: base.fallbackRouteIds,
  };
}

/**
 * Boot entry. Merges `defaultRoutes < fileConfig < envOverrides` and
 * returns a validated `GatewayRegistry`. Throws `GatewayConfigError` with
 * the role named on the first invalid override.
 */
export function loadRegistryFromEnv(
  env: Record<string, string | undefined>,
  fileConfig?: Partial<Record<ModelRole, ModelRoute>>,
): GatewayRegistry {
  const merged: Record<ModelRole, ModelRoute> = { ...defaultRoutes };
  // File layer.
  if (fileConfig) {
    for (const [role, route] of Object.entries(fileConfig) as [ModelRole, ModelRoute][]) {
      if (route) merged[role] = route;
    }
  }
  // Env layer.
  for (const role of ModelRoleValues) {
    const raw = env[modelRoleEnvVar(role)];
    if (raw === undefined || raw === "") continue;
    const parsed = parseRouteOverride(raw, role);
    merged[role] = applyOverride(merged[role], parsed, role);
  }
  return createRegistry(merged);
}
