import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runKernel } from '../src/run-kernel.ts';
import { compileProposalNodes, cleanTitle } from '../src/node-compiler.ts';
import { writeFlowNodes } from '../src/vault-sink.ts';
import { slugId } from '../src/slug.ts';

async function fixtureRun() {
  return runKernel({
    runId: 'vault_sink_canonical',
    casePath: 'case-studies/fsd-ownership-unwind/problem-statement.md',
    fixturePath: 'kernel/fixtures/fsd-ownership-unwind/run-fixture.json',
    knowledgePacketPath: 'kernel/fixtures/fsd-ownership-unwind/knowledge-packet.json',
    memoryMode: 'auto',
  });
}

test('slugId is deterministic and link-safe', () => {
  assert.equal(slugId('Hello, World!'), slugId('Hello, World!'));
  assert.match(slugId('Sealed Facility / Staged Crisis'), /^[a-z0-9-]+-[0-9a-f]{8}$/);
});

test('default node ids are slugs derived from titles (not UUIDs)', async () => {
  const run = await fixtureRun();
  const nodes = compileProposalNodes(run);
  for (const node of nodes) {
    assert.match(node.id, /^[a-z0-9-]+-[0-9a-f]{8}$/, `${node.stage} id should be a slug`);
  }
  assert.equal(nodes[0]!.id, slugId(cleanTitle(run.caseStudy.title)));
  assert.ok(!nodes[0]!.id.startsWith('problem-statement-'), 'framing prefix stripped from slug');
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
