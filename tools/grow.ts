// Grow a seed end-to-end into a vault: case_study node, a discovery pass into stock, one engine
// pass, and the survivor compiled into a problem_recovery node. Output destination is configurable.
//   pnpm grow [fixture] [vaultDir]
//   default: fixtures/fsd-seed.json -> out/vault   (point vaultDir at ../agarden to write the vault)
import { readFileSync } from 'node:fs';
import type { SeedFixture } from '../src/contracts/index.ts';
import { buildRunTrace } from '../src/trace.ts';
import { compileCaseStudy, compileProblemRecovery } from '../src/io/compile-node.ts';
import { discover, offlineBackend } from '../src/io/discovery.ts';
import { createVaultSink } from '../src/io/sink.ts';

const fixturePath = process.argv[2] || 'fixtures/fsd-seed.json';
const vaultDir = process.argv[3] || 'out/vault';

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as SeedFixture;
const sink = createVaultSink(vaultDir);

const seedNode = compileCaseStudy(fixture.seed);
sink.writeNode(seedNode);

const focus = `${fixture.seed.title}. ${fixture.seed.thesis}`;
const discovery = discover(focus, offlineBackend, sink);

const trace = buildRunTrace(fixture, 'converge');
const survivor = trace.comparison.focus.selected[0];
if (!survivor) {
  console.error('No survivor selected — nothing to compile.');
  process.exit(1);
}

const recovered = compileProblemRecovery(survivor, fixture.seed, seedNode.id, discovery.entries);
sink.writeNode(recovered);

console.log(`grew into ${vaultDir}/`);
console.log(`  flow/${seedNode.id}/  (case_study)`);
console.log(`  flow/${recovered.id}/  (problem_recovery, prev_id -> ${seedNode.id})`);
console.log(`  stock x${discovery.entries.length} field(s)`);
