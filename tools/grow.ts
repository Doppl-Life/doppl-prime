// Grow one node from the vault, one stage. Put a node to task; it reads the node from the configured
// vault, runs discovery (router fetch -> judge admit -> stock), generates the next stage via the
// reasoning provider, runs the agenome (fitness + dial selection) on the candidates, caps the
// survivors, has the judge evaluate them, compiles, and writes the new node(s) back into the vault.
//   pnpm grow <node-slug> [vaultDir]
import type { Dial, Seed } from '../src/contracts/index.ts';
import { scoreCandidatePool } from '../src/fitness.ts';
import { compareSelections } from '../src/select.ts';
import { compileDoppl, compileProblemRecovery, slugId, type DiscoveryEntry, type Doppl, type ProblemFrame, type TraceSynopsis } from '../src/io/compile-node.ts';
import { loadConfig } from '../src/io/config.ts';
import { discover } from '../src/io/discovery.ts';
import { dopplToCandidate, frameToCandidate, generateDoppls, generateProblemRecovery, poolOf } from '../src/io/generate-stage.ts';
import { evaluate } from '../src/io/judge.ts';
import { createVaultSink } from '../src/io/sink.ts';
import { readNode } from '../src/io/vault-read.ts';

const slug = process.argv[2];
const cfg = loadConfig();
const vaultDir = process.argv[3] || cfg.vault;
if (!slug) {
  console.error('usage: pnpm grow <node-slug> [vaultDir]');
  process.exit(1);
}

const node = readNode(vaultDir, slug);
if (!node) {
  console.error(`node not found: ${vaultDir}/flow/${slug}/${slug}.md`);
  process.exit(1);
}
if (node.stage === 'doppl') {
  console.error('a doppl is a leaf — nothing to grow (reseed is a separate step).');
  process.exit(1);
}

const sink = createVaultSink(vaultDir);
const max = cfg.maxNodesPerRun;
const seedText = `${node.headline}. ${node.synopsis}`;

// Discovery: router fetch -> judge admit -> stock.
const discovery = discover(seedText, 'web', sink);
const discoveryLines = discovery.admitted.map((a) => `${a.claim} — ${a.synopsis}`);
const discoveryEntries: DiscoveryEntry[] = discovery.admitted.map((a) => ({ found: a.claim, field: a.field }));

const seed: Seed = { id: node.id, title: node.headline, prompt: node.synopsis, thesis: node.synopsis, goals: [] };
const written: { id: string; stage: string }[] = [];
let genNote = '';

if (node.stage === 'case_study') {
  // generate: recover problems (converge).
  const dial: Dial = 'converge';
  const { frames, note } = generateProblemRecovery(seedText, discoveryLines, Math.max(max + 2, 4));
  genNote = note;
  const byId = new Map<string, ProblemFrame>(frames.map((f) => [slugId(f.title), f]));
  const { scoredPool } = scoreCandidatePool(poolOf(seed, frames.map((f) => frameToCandidate(f, node.id))), { asOf: '2026-06-24' });
  const survivors = compareSelections(scoredPool, dial).comparison.focus.selected.slice(0, max);
  const picked = survivors.map((s) => byId.get(s.id)).filter((f): f is ProblemFrame => Boolean(f));
  const { evals } = evaluate(picked.map((f) => ({ title: f.title, summary: f.actualProblem })), seedText);
  const trace: TraceSynopsis[] = [{ stage: 'case_study', synopsis: node.synopsis }];
  picked.forEach((f, i) => { const n = compileProblemRecovery(f, evals[i], node.id, trace, discoveryEntries); sink.writeNode(n); written.push(n); });
} else {
  // generate doppls (diverge).
  const dial: Dial = 'diverge';
  const { doppls, note } = generateDoppls(seedText, discoveryLines, Math.max(max + 2, 4));
  genNote = note;
  const byId = new Map<string, Doppl>(doppls.map((d) => [slugId(d.title), d]));
  const { scoredPool } = scoreCandidatePool(poolOf(seed, doppls.map((d) => dopplToCandidate(d, node.id))), { asOf: '2026-06-24' });
  const survivors = compareSelections(scoredPool, dial).comparison.focus.selected.slice(0, max);
  const picked = survivors.map((s) => byId.get(s.id)).filter((d): d is Doppl => Boolean(d));
  const { evals } = evaluate(picked.map((d) => ({ title: d.title, summary: d.claim })), seedText);
  const gp = node.prevId ? readNode(vaultDir, node.prevId) : null;
  const trace: TraceSynopsis[] = gp ? [{ stage: 'case_study', synopsis: gp.synopsis }, { stage: 'problem_recovery', synopsis: node.headline }] : [{ stage: 'problem_recovery', synopsis: node.headline }];
  picked.forEach((d, i) => { const n = compileDoppl(d, evals[i], node.id, trace, discoveryEntries); sink.writeNode(n); written.push(n); });
}

console.log(`grew ${slug} (${node.stage}) -> ${vaultDir}/`);
console.log(`  discovery via ${discovery.fetchedVia}; ${discovery.admitNote}`);
console.log(`  route tried: ${discovery.tried.join(' | ')}`);
console.log(`  generation: ${genNote}`);
if (!written.length) console.log('  (no nodes written — generation or selection produced nothing; see notes above)');
for (const w of written) console.log(`  flow/${w.id}/  (${w.stage})`);
