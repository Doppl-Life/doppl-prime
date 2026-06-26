import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createModelGenerationProviders,
  createFallbackGenerationProviders,
} from '../../../src/kernel/engine/generation-providers.ts';
import type { ModelCallRecord, ModelClient } from '../../../src/kernel/model/model-gateway.ts';
import type { CaseStudy, CriticJudgmentInput } from '../../../src/kernel/engine/generation-providers.ts';

// A stub model client that returns canned output text per purpose (repair calls reuse the base
// purpose's output), so we can drive a layer into a validation failure deterministically.
function stubClient(outputs: Record<string, string>): ModelClient {
  return {
    async complete(request) {
      const purpose = request.purpose.replace(/\.repair$/, '');
      return {
        id: 'x', runId: request.runId, purpose: request.purpose, provider: 'stub',
        model: request.model, prompt: request.prompt, outputText: outputs[purpose] ?? '{}', metadata: {},
      };
    },
  };
}

const CASE: CaseStudy = { id: 'demo', title: 'Demo', statedProblem: 'problem' } as unknown as CaseStudy;
const JUDGE_INPUT: CriticJudgmentInput = {
  runId: 'r', stage: 'doppl', caseStudy: CASE, knowledgePacket: { items: [] } as never,
  candidates: [{ id: 'c1' }] as never,
};

test('provider cascade falls through a layer whose output fails validation, into the reliable floor', async () => {
  const records: ModelCallRecord[] = [];
  // The fast layer omits the required criticId — it fails validation even after repair.
  const fast = createModelGenerationProviders({
    client: stubClient({ critic_judgment: '{"verdicts":[{"candidateId":"c1","score":80}]}' }),
    model: 'fast', records,
  });
  // The floor layer returns a valid verdict.
  const floor = createModelGenerationProviders({
    client: stubClient({ critic_judgment: '{"verdicts":[{"candidateId":"c1","criticId":"grounding","score":80}]}' }),
    model: 'floor', records,
  });
  const cascade = createFallbackGenerationProviders([fast, floor], records);

  const verdicts = await cascade.criticCouncil.judge(JUDGE_INPUT);
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0]!.criticId, 'grounding', 'the verdict came from the reliable floor');
  // Both layers' calls landed in the one shared trace (the fast layer tried + repaired, then the floor).
  assert.ok(records.length >= 2, 'shared record sink captured both layers');
});

test('provider cascade throws naming each layer when all fail', async () => {
  const records: ModelCallRecord[] = [];
  const broken = () => createModelGenerationProviders({
    client: stubClient({ critic_judgment: '{"verdicts":[{"candidateId":"c1","score":80}]}' }),
    model: 'broken', records,
  });
  const cascade = createFallbackGenerationProviders([broken(), broken()], records);
  await assert.rejects(() => cascade.criticCouncil.judge(JUDGE_INPUT), /all generation layers failed for critic_judgment/);
});
