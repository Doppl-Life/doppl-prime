import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJsonKnowledgeGateway, createReplayKnowledgeGateway } from '../../src/kernel/knowledge-gateway.ts';

test('json gateway selects a packet for the target case', async () => {
  const gateway = await createJsonKnowledgeGateway(
    'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
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
    'fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
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

test('json gateway rejects malformed packet items before selection', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doppl-packet-'));
  const packetPath = path.join(dir, 'bad-packet.json');
  await writeFile(
    packetPath,
    JSON.stringify({
      id: 'packet_bad',
      targetCase: 'case_a',
      items: [{ recordId: 'rec_1', citeHandle: 'K1' }],
      excluded: [],
    }),
    'utf8',
  );

  await assert.rejects(() => createJsonKnowledgeGateway(packetPath), /KnowledgePacket.items\[0\].text/);
});
