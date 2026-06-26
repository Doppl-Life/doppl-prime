import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { admitDiscoveredStock, type StockAdmissionJudge } from '../../../src/kernel/sink/stock-admission.ts';
import type { KernelRun } from '../../../src/kernel/boundary.ts';

// The admission judge is the intelligence (proven live via a --discover run); these tests inject a
// judge to verify the gate orchestration — that only admitted findings become durable stock.
function runWithWebFinds(): KernelRun {
  return {
    caseStudy: { id: 'demo-case', title: 'Demo Case' },
    knowledgePacket: {
      items: [
        { recordId: 'r1', citeHandle: 'keep1', text: 'Signal fact\nA grounded, high-signal finding.', sourceCase: 'demo-case', citation: 'https://example.com/a', trustTier: 'web-firecrawl', visibility: 'problem_recovery' },
        { recordId: 'r2', citeHandle: 'drop1', text: 'Noise fact\nA restated duplicate.', sourceCase: 'demo-case', citation: 'https://example.com/b', trustTier: 'web-firecrawl', visibility: 'problem_recovery' },
        { recordId: 'r3', citeHandle: 's1', text: 'Stock fact\nAlready known.', sourceCase: 'demo-case', citation: 'stock/x.md', trustTier: 'agarden-stock', visibility: 'problem_recovery' },
      ],
    },
  } as unknown as KernelRun;
}

async function onlyStockFile(vault: string): Promise<string> {
  const files = (await readdir(path.join(vault, 'stock'))).filter((file) => file.endsWith('.md'));
  assert.equal(files.length, 1);
  return readFile(path.join(vault, 'stock', files[0]!), 'utf8');
}

test('the judge gate admits only the findings that clear the bar', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'doppl-admit-'));
  const judge: StockAdmissionJudge = {
    async admit({ candidates }) {
      // Admit only the high-signal finding; reject the duplicate.
      return new Set(candidates.filter((fact) => fact.anchor === 'keep1').map((fact) => fact.anchor));
    },
  };
  await admitDiscoveredStock(vault, [runWithWebFinds()], judge);

  const stock = await onlyStockFile(vault);
  assert.match(stock, /Signal fact/);
  assert.doesNotMatch(stock, /Noise fact/);
  // The agarden-stock item is not a web discovery and is never admitted as a new find.
  assert.doesNotMatch(stock, /Stock fact/);
});

test('without a judge, surfaced web findings pass through unchanged', async () => {
  const vault = await mkdtemp(path.join(tmpdir(), 'doppl-admit-nojudge-'));
  await admitDiscoveredStock(vault, [runWithWebFinds()]);

  const stock = await onlyStockFile(vault);
  assert.match(stock, /Signal fact/);
  assert.match(stock, /Noise fact/);
});
