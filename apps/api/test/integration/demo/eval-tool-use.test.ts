import { describe, expect, test } from 'vitest';
import {
  createLiveGateway,
  createModelRegistry,
  createOpenRouterClient,
  loadModelRegistry,
} from '../../../src/model-gateway';
import { DEFAULT_MODEL_REGISTRY } from '../../../src/config/model-registry.config';
import { createToolExecutorSeams } from '../../../src/boot/toolSeams';
import {
  createToolOrchestratingGateway,
  type ToolOrchestratorDeps,
} from '../../../src/boot/toolOrchestrator';
import { buildPopulationRequest } from '../../../src/runtime/loop/generationLoop';

/**
 * TU.8 eval — tools-vs-no-tools A/B (the held-out-rubric eval's structural core). Runs the SAME problem
 * through the SAME orchestrator twice — once WITH a tool budget (the agent researches) and once WITHOUT
 * (toolBudget 0 → no tools offered, a baseline generation). The success bar: the tools-on run actually
 * grounds itself (≥1 tool call) while the tools-off run makes none, and both produce a valid candidate.
 * Both candidates are logged for qualitative grounding/novelty/feasibility comparison (the full 5-axis
 * held-out-judge scoring is the eval-harness follow-up; this pins the A/B difference deterministically).
 * OPT-IN: skipIf keyless so /preflight + CI stay green.
 */
function hasLiveKeys(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return typeof key === 'string' && key.trim() !== '';
}

const PROBLEM =
  'Propose a cross-domain-transfer idea to reduce food waste in grocery supply chains, grounded in a ' +
  'real, proven technique from another field. Research current approaches first if you can.';
const SYSTEM_PROMPT =
  'You are an innovation agent that generates grounded cross-domain-transfer ideas: take a real, proven ' +
  'technique from one domain and transfer it to solve a problem in a different domain.';

describe.skipIf(!hasLiveKeys())('LIVE eval — tools-vs-no-tools A/B (TU.8, opt-in)', () => {
  test('the tools-on run researches and grounds; the tools-off run does not', async () => {
    const key = (process.env.OPENROUTER_API_KEY ?? '').trim().split(/\s/)[0] ?? '';
    const env = { ...process.env, OPENROUTER_API_KEY: key };
    const registry = createModelRegistry(loadModelRegistry({ defaults: DEFAULT_MODEL_REGISTRY }));
    const orchestratorDeps: ToolOrchestratorDeps = {
      gateway: createLiveGateway({ registry, client: createOpenRouterClient(env) }),
      toolExecutorDeps: createToolExecutorSeams({ openRouterApiKey: key }),
      maxTurns: 5,
    };
    const orchestrator = createToolOrchestratingGateway(orchestratorDeps);
    const request = buildPopulationRequest(SYSTEM_PROMPT, PROBLEM);

    const withTools = await orchestrator.generate(request, { toolBudget: 4 });
    const withoutTools = await orchestrator.generate(request, { toolBudget: 0 });

    const onCalls = withTools.toolCalls ?? [];
    const offCalls = withoutTools.toolCalls ?? [];
    console.log(
      'EVAL tools-vs-no-tools →',
      JSON.stringify(
        {
          withTools: {
            toolCalls: onCalls.map((c) => ({ tool: c.toolName, ok: c.ok })),
            candidate: withTools.response.output,
          },
          withoutTools: {
            toolCalls: offCalls.length,
            candidate: withoutTools.response.output,
          },
        },
        null,
        2,
      ),
    );

    // The A/B structural difference: tools-on researched, tools-off did not.
    expect(onCalls.length).toBeGreaterThanOrEqual(1);
    expect(onCalls.some((c) => c.ok)).toBe(true);
    expect(offCalls.length).toBe(0);
    // Both still produce a valid candidate (the gateway's discipline ran on the final answer).
    expect(withTools.response.accepted).toBe(true);
    expect(withoutTools.response.accepted).toBe(true);
  }, 240_000);
});
