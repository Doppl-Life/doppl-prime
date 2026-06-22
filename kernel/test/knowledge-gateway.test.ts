import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonKnowledgeGateway, createReplayKnowledgeGateway } from '../src/knowledge-gateway.ts';

test('json gateway selects a packet for the target case', async () => {
  const gateway = await createJsonKnowledgeGateway(
    'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  );
  const packet = await gateway.selectPacket({
    runId: 'run_1',
    targetCase: 'fsd-ownership-unwind',
    maxItems: 1,
  });
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0]?.citeHandle, 'K1');
});

test('replay gateway returns the persisted packet without fresh retrieval', async () => {
  const live = await createJsonKnowledgeGateway(
    'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
  );
  const packet = await live.selectPacket({
    runId: 'run_1',
    targetCase: 'fsd-ownership-unwind',
    maxItems: 2,
  });
  const replay = createReplayKnowledgeGateway(packet);
  const replayed = await replay.selectPacket({
    runId: 'run_2',
    targetCase: 'fsd-ownership-unwind',
    maxItems: 2,
  });
  assert.equal(replayed.id, packet.id);
  assert.equal(replay.freshRetrievals(), 0);
});
