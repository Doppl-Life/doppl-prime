import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runKernel } from '../../src/kernel/run-kernel.ts';
import { compileProposalNodes, cleanTitle } from '../../src/kernel/node-compiler.ts';
import { writeFlowNodes } from '../../src/kernel/vault-sink.ts';
import { slugId } from '../../src/kernel/slug.ts';

async function fixtureRun() {
  return runKernel({
    runId: 'vault_sink_canonical',
    casePath: 'test/fixtures/fsd-seed.json',
    fixturePath: 'test/fixtures/kernel/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'test/fixtures/kernel/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
}

test('slugId is deterministic, link-safe, and seed-disambiguable', () => {
  assert.equal(slugId('Hello, World!'), slugId('Hello, World!'));
  assert.match(slugId('Sealed Facility / Staged Crisis'), /^[a-z0-9-]+-[0-9a-f]{8}$/);
  // a distinct seed disambiguates same-named nodes; default seed is the name itself.
  assert.notEqual(slugId('Same Title', 'a'), slugId('Same Title', 'b'));
  assert.equal(slugId('Same Title'), slugId('Same Title', 'Same Title'));
});

test('default node ids are unique slugs derived from titles (not UUIDs)', async () => {
  const run = await fixtureRun();
  const nodes = compileProposalNodes(run);
  for (const node of nodes) {
    assert.match(node.id, /^[a-z0-9-]+-[0-9a-f]{8}$/, `${node.stage} id should be a slug`);
  }
  assert.ok(!nodes[0]!.id.startsWith('problem-statement-'), 'framing prefix stripped from slug');
  assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length, 'node ids are unique across stages');
  const caseSlugText = nodes[0]!.id.replace(/-[0-9a-f]{8}$/, '');
  assert.equal(caseSlugText, slugId(cleanTitle(run.caseStudy.title)).replace(/-[0-9a-f]{8}$/, ''));
});

test('writeFlowNodes writes canonical flow/<slug>/<slug>.md layout', async () => {
  const run = await fixtureRun();
  const vault = await mkdtemp(path.join(tmpdir(), 'doppl-vault-'));
  const nodes = compileProposalNodes(run);
  const written = writeFlowNodes(vault, nodes);

  for (const node of nodes) {
    const expected = path.join(vault, 'flow', node.id, `${node.id}.md`);
    assert.ok(written.includes(expected), `wrote ${node.stage} to canonical path`);
    assert.ok(existsSync(expected), `file exists at ${expected}`);
    assert.equal(readFileSync(expected, 'utf8'), node.markdown.endsWith('\n') ? node.markdown : `${node.markdown}\n`);
  }
});
