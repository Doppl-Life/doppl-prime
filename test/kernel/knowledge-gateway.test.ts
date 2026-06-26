import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createAgardenStockKnowledgeGateway,
  createJsonKnowledgeGateway,
  createReplayKnowledgeGateway,
} from '../../src/kernel/knowledge-gateway.ts';

test('json gateway selects a packet for the target case', async () => {
  const gateway = await createJsonKnowledgeGateway(
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
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
    'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
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

test('agarden stock gateway selects load-bearing facts from stock markdown', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'doppl-stock-vault-'));
  await mkdir(path.join(vault, 'stock'), { recursive: true });
  await writeFile(
    path.join(vault, 'stock', 'claims-adjustment.md'),
    [
      '---',
      'id: claims-adjustment',
      'name: "Claims adjustment"',
      '---',
      '',
      '# Claims adjustment',
      '',
      '## Load-bearing facts',
      '',
      '### Telematics plus OEM direct settlement removes the adjuster intermediary',
      '',
      'When the vehicle records the event and the OEM settles directly, the adjuster job changes.',
      '_Grounded: NAIC telematics._ ^adjuster-disintermediation',
      '',
      '### The collision-litigation funnel dries up at the source',
      '',
      'Fewer crashes means fewer injuries means fewer cases.',
      '_Grounded: PI-firm collision intake reports._ ^litigation-funnel',
    ].join('\n'),
    'utf8',
  );

  const gateway = await createAgardenStockKnowledgeGateway(vault);
  const packet = await gateway.selectPacket({
    runId: 'run_stock',
    targetCase: 'fsd-ownership-unwind',
    maxItems: 1,
  });

  assert.equal(packet.id, 'stock:run_stock:fsd-ownership-unwind');
  assert.equal(packet.targetCase, 'fsd-ownership-unwind');
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0]?.recordId, 'adjuster-disintermediation');
  assert.match(packet.items[0]?.text || '', /Claims adjustment/);
  assert.equal(packet.items[0]?.trustTier, 'agarden-stock');
  assert.equal(packet.excluded[0]?.recordId, 'litigation-funnel');
});

test('agarden stock gateway fails loudly when configured stock is missing', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'doppl-missing-stock-'));

  await assert.rejects(
    () => createAgardenStockKnowledgeGateway(vault),
    /configured agarden stock directory is required/,
  );
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
