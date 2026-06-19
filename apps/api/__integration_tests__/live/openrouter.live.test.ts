import { describe, expect, test } from "vitest";
import { createOpenRouterAdapter } from "../../src/model-gateway/adapters/openrouter.js";
import { defaultRoutes } from "../../src/model-gateway/default-routes.js";

const liveEnabled = process.env.DOPPL_LIVE_TESTS === "1";
const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

// Skip the entire suite when not opt-in.
const maybe = liveEnabled && hasKey ? describe : describe.skip;

maybe("LIVE — OpenRouter generation (gated by DOPPL_LIVE_TESTS=1 + OPENROUTER_API_KEY)", () => {
  test("a small chat call returns content and tokens", async () => {
    const adapter = createOpenRouterAdapter({
      env: { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY },
    });
    const route = defaultRoutes.subtype_check; // cheapest route
    const result = await adapter.invoke(route, {
      role: "subtype_check",
      runId: "live_test",
      input: { prompt: "Reply with the single word: OK" },
      correlationId: "live_corr",
    });
    expect(typeof result.rawOutput).toBe("string");
    expect((result.rawOutput as string).length).toBeGreaterThan(0);
    expect(result.energyActual).toBeGreaterThan(0);
  });
});
