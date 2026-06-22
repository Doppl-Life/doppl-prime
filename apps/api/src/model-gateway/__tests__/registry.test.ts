import { describe, expect, test } from "vitest";
import {
  createRegistry,
  defaultRoutes,
  loadRegistryFromEnv,
  modelRoleEnvVar,
} from "../default-routes.js";
import { GatewayConfigError, RouteNotFoundError } from "../errors.js";

describe("defaultRoutes — covers every ModelRole", () => {
  test("has an entry for every ModelRole value", () => {
    expect(Object.keys(defaultRoutes).sort()).toMatchInlineSnapshot(`
      [
        "critic",
        "embedding",
        "final_judge",
        "fusion_synthesis",
        "population_generator",
        "subtype_check",
      ]
    `);
  });

  test("every default route parses as a valid ModelRoute", () => {
    // createRegistry runs ModelRoute.parse on each entry; this is the test.
    expect(() => createRegistry(defaultRoutes)).not.toThrow();
  });

  test("MVP primary picks match the plan matrix", () => {
    expect(defaultRoutes.critic.modelId).toBe("openai/gpt-4o");
    expect(defaultRoutes.embedding.provider).toBe("openai-embedding");
    expect(defaultRoutes.embedding.modelId).toBe("text-embedding-3-small");
    expect(defaultRoutes.final_judge.modelId).toBe("openai/gpt-4o");
  });

  test("every default route declares a fallback (≥1 fallbackRouteId)", () => {
    for (const route of Object.values(defaultRoutes)) {
      expect(route.fallbackRouteIds.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("createRegistry — resolution", () => {
  test("resolveRoute returns the matching primary route", () => {
    const registry = createRegistry(defaultRoutes);
    expect(registry.resolveRoute("critic").modelId).toBe("openai/gpt-4o");
    expect(registry.resolveRoute("embedding").modelId).toBe("text-embedding-3-small");
  });

  test("resolveRoute throws RouteNotFoundError for an unknown role", () => {
    const registry = createRegistry(defaultRoutes);
    expect(() => registry.resolveRoute("not_a_role" as never)).toThrow(RouteNotFoundError);
  });

  test("createRegistry throws when a required role is missing", () => {
    const { critic, ...withoutCritic } = defaultRoutes;
    void critic;
    expect(() => createRegistry(withoutCritic as never)).toThrow(GatewayConfigError);
    expect(() => createRegistry(withoutCritic as never)).toThrow(/critic/);
  });

  test("createRegistry throws when a route shape is invalid (missing capability field)", () => {
    const bad = {
      ...defaultRoutes,
      critic: {
        ...defaultRoutes.critic,
        capabilities: {
          structuredOutputs: true,
          toolCalling: true,
          embeddings: false,
          // streaming missing — ProviderCapability requires all 4
        },
      },
    } as unknown as typeof defaultRoutes;
    expect(() => createRegistry(bad)).toThrow(GatewayConfigError);
    expect(() => createRegistry(bad)).toThrow(/critic/);
  });
});

describe("loadRegistryFromEnv — defaults < file < env precedence", () => {
  test("with no env or file overrides, returns the defaults unchanged", () => {
    const registry = loadRegistryFromEnv({});
    expect(registry.resolveRoute("critic").modelId).toBe(defaultRoutes.critic.modelId);
  });

  test("env override changes the modelId for a single role; siblings untouched", () => {
    const registry = loadRegistryFromEnv({
      [modelRoleEnvVar("critic")]: "openrouter:openai/gpt-4o",
    });
    expect(registry.resolveRoute("critic").modelId).toBe("openai/gpt-4o");
    expect(registry.resolveRoute("embedding").modelId).toBe(defaultRoutes.embedding.modelId);
  });

  test("file override overridden by env override", () => {
    const registry = loadRegistryFromEnv(
      { [modelRoleEnvVar("critic")]: "openrouter:env-wins/x" },
      {
        critic: {
          ...defaultRoutes.critic,
          provider: "openrouter",
          modelId: "file-only/y",
        },
      },
    );
    expect(registry.resolveRoute("critic").modelId).toBe("env-wins/x");
  });

  test("malformed env override (no provider colon) throws GatewayConfigError naming the role", () => {
    expect(() => loadRegistryFromEnv({ [modelRoleEnvVar("critic")]: "not-a-route" })).toThrow(
      GatewayConfigError,
    );
    expect(() => loadRegistryFromEnv({ [modelRoleEnvVar("critic")]: "not-a-route" })).toThrow(
      /critic/,
    );
  });

  test("env override inherits capabilities from the prior route for the role", () => {
    const registry = loadRegistryFromEnv({
      [modelRoleEnvVar("embedding")]: "openai-embedding:text-embedding-3-large",
    });
    // The embedding default has embeddings:true — the override preserves it.
    expect(registry.resolveRoute("embedding").capabilities.embeddings).toBe(true);
  });
});
