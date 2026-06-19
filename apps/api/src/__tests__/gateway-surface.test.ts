import { describe, expect, test } from "vitest";
import * as api from "../index.js";

/**
 * The Phase 2 §2.5 acceptance gate at the package boundary. Every name a
 * downstream track (kernel / verifier / selection / projections / demo)
 * will import from `@doppl/api` for the model-gateway path is listed
 * here. Additions or removals must be deliberate edits visible in this
 * file.
 */
const REQUIRED_GATEWAY_EXPORTS = [
  // Core
  "createGateway",
  "type ModelGateway",
  // Registry
  "createRegistry",
  "loadRegistryFromEnv",
  "defaultRoutes",
  "modelRoleEnvVar",
  // HTTP
  "createHttpClient",
  // Adapters
  "createOpenRouterAdapter",
  "createOpenAIEmbeddingAdapter",
  "createRetrievalAdapter",
  // Structured output
  "pipeStructuredOutput",
  // Langfuse
  "createLangfuseClient",
  // Recorded gateway
  "RecordedGateway",
  // Errors
  "GatewayConfigError",
  "RouteNotFoundError",
  "RetryExhaustedError",
  "OutputSchemaRejectedError",
  "RecordedFixtureNotFoundError",
] as const;

describe("spec(§2.5) @doppl/api model-gateway surface — every required export is present", () => {
  for (const name of REQUIRED_GATEWAY_EXPORTS) {
    // Skip type-only entries — TS types don't exist at runtime.
    if (name.startsWith("type ")) continue;
    test(`exports ${name}`, () => {
      expect(api).toHaveProperty(name);
      expect((api as unknown as Record<string, unknown>)[name]).toBeDefined();
    });
  }

  test("no private gateway helper leaks (langfuseMetadata stays internal)", () => {
    const exported = new Set(Object.keys(api));
    expect(exported.has("langfuseMetadata")).toBe(false);
    expect(exported.has("persistedEventPayload")).toBe(false);
    expect(exported.has("deriveFallbackRoute")).toBe(false);
  });
});
