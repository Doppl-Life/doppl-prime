import { describe, expect, test } from 'vitest';
import {
  createLiveGateway,
  createModelRegistry,
  createOpenRouterClient,
  loadModelRegistry,
} from '../../../src/model-gateway';
import { DEFAULT_MODEL_REGISTRY } from '../../../src/config/model-registry.config';
import { createToolExecutorSeams } from '../../../src/boot/toolSeams';
import { createToolOrchestratingGateway } from '../../../src/boot/toolOrchestrator';
import { buildPopulationRequest } from '../../../src/runtime/loop/generationLoop';

/**
 * TU.8 — the LIVE tool-use validation (USER DECISION: a real live-LLM run before ship, memory
 * `prefer-live-llm-validation`). Drives the REAL tool-orchestrating gateway against real OpenRouter
 * (gpt-4o-mini function-calling) + the real SSRF-hardened tool seams, asserting the agent does its OWN
 * research: it makes ≥1 tool call, ≥1 returns a usable result, and the final candidate is an accepted,
 * schema-valid object the gateway's validate/repair/reject discipline produced. INVARIANTS, not exact
 * text (the run is non-deterministic). OPT-IN: `skipIf` keyless so /preflight + CI stay green with no key.
 */
function hasLiveKeys(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return typeof key === 'string' && key.trim() !== '';
}

describe.skipIf(!hasLiveKeys())(
  'LIVE tool-use — agent does its own research (TU.8, opt-in)',
  () => {
    test('population_generator researches via tools and returns a grounded candidate', async () => {
      // Use the FIRST whitespace-delimited token of the key (robust to a .env line that appended a trailing
      // comment after the key; node's --env-file already trims it, a raw shell export may not).
      const key = (process.env.OPENROUTER_API_KEY ?? '').trim().split(/\s/)[0] ?? '';
      const env = { ...process.env, OPENROUTER_API_KEY: key };
      const registry = createModelRegistry(loadModelRegistry({ defaults: DEFAULT_MODEL_REGISTRY }));
      const gateway = createLiveGateway({ registry, client: createOpenRouterClient(env) });
      const toolExecutorDeps = createToolExecutorSeams({ openRouterApiKey: key });
      const orchestrator = createToolOrchestratingGateway({
        gateway,
        toolExecutorDeps,
        maxTurns: 5,
      });

      const request = buildPopulationRequest(
        'You are an innovation agent that generates grounded cross-domain-transfer ideas: take a real, ' +
          'proven technique from one domain and transfer it to solve a problem in a different domain.',
        'Propose a cross-domain-transfer idea to improve urban traffic flow, grounded in a real technique ' +
          'from another field (e.g. biology, networking, logistics). Research current approaches first.',
      );
      const result = await orchestrator.generate(request, { toolBudget: 4 });

      // The agent did its own research: ≥1 tool call, ≥1 with a usable result.
      const calls = result.toolCalls ?? [];
      // eslint-disable-next-line no-console
      console.log(
        'LIVE tool-use →',
        JSON.stringify(
          {
            toolCalls: calls.map((c) => ({
              tool: c.toolName,
              ok: c.ok,
              query: c.query?.slice(0, 80),
            })),
            accepted: result.response.accepted,
            validationResult: result.response.validationResult,
            rejection: result.response.rejection,
            candidate: result.response.output,
          },
          null,
          2,
        ),
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls.some((c) => c.ok)).toBe(true);

      // The final candidate is an accepted, schema-valid object (validate/repair/reject ran in the gateway).
      expect(result.response.accepted).toBe(true);
      expect(result.response.output).toBeDefined();
      expect(typeof result.response.output).toBe('object');
    }, 180_000);
  },
);
