// Renders a standalone engineer architecture diagram from the current kernel trace.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeedFixture } from '../../src/contracts/index.ts';
import type { BoundaryContract, GenerationSummary, GoalCheck, RunTrace, TraceEvent } from '../../src/contracts/index.ts';
import { buildRunTrace } from '../../src/trace.ts';
import { runMain } from '../cli.ts';
import { capstoneDemoLens } from '../lens-config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

type Args = {
  fixture: string;
  outDir: string;
};

type SpineStep = {
  step: string;
  file: string;
  call: string;
  input: string;
  output: string;
  why: string;
  event?: TraceEvent;
  tone: 'normal' | 'decision' | 'artifact' | 'warning';
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixture: path.join(root, 'fixtures', 'fsd-seed.json'),
    outDir: path.join(root, 'out', 'microscope'),
  };

  for (const arg of argv) {
    if (arg.startsWith('--fixture=')) {
      args.fixture = path.resolve(root, arg.slice('--fixture='.length));
    } else if (arg.startsWith('--out-dir=')) {
      args.outDir = path.resolve(root, arg.slice('--out-dir='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function eventAt(events: TraceEvent[], stage: string, index: number): TraceEvent | undefined {
  return events.filter((event) => event.stage === stage)[index];
}

function failedChecks(checks: GoalCheck[]): GoalCheck[] {
  return checks.filter((check) => !check.passed);
}

function countFixtures(): Promise<number> {
  return readdir(path.join(root, 'fixtures')).then((entries) => entries.filter((entry) => entry.endsWith('.json')).length);
}

function gen(trace: RunTrace, index: number): GenerationSummary | undefined {
  return trace.generations.find((summary) => summary.index === index);
}

function contractFor(trace: RunTrace, module: string): BoundaryContract | undefined {
  return trace.boundaryContracts.find((contract) => contract.module === module);
}

function contractLine(contract: BoundaryContract | undefined): string {
  if (!contract) return 'no boundary contract';
  return `${contract.input.name} -> ${contract.output.name}`;
}

function contractSchemaLine(contract: BoundaryContract | undefined): string {
  if (!contract) return '';
  return `${contract.input.schemaId} -> ${contract.output.schemaId}`;
}

function checkSummary(event?: TraceEvent): string {
  if (!event) return 'no TraceEvent emitted';
  const failed = failedChecks(event.goalChecks);
  return failed.length ? `${failed.length}/${event.goalChecks.length} failed` : `${event.goalChecks.length}/${event.goalChecks.length} passed`;
}

function stepCard(step: SpineStep): string {
  const checks = checkSummary(step.event);
  return `
    <article class="spine-step ${step.tone}">
      <div class="step-num">${escapeHtml(step.step)}</div>
      <div class="step-main">
        <div class="step-top">
          <h3>${escapeHtml(step.call)}</h3>
          <code>${escapeHtml(step.file)}</code>
        </div>
        <div class="io-grid">
          <div><span>input</span><p>${escapeHtml(step.input)}</p></div>
          <div><span>output</span><p>${escapeHtml(step.output)}</p></div>
          <div><span>why it exists</span><p>${escapeHtml(step.why)}</p></div>
          <div><span>trace visibility</span><p>${escapeHtml(checks)}</p></div>
        </div>
      </div>
    </article>`;
}

function commandCard(name: string, file: string, flow: string[], output: string): string {
  return `
    <article class="command-card">
      <div class="kicker">entrypoint</div>
      <h3>${escapeHtml(name)}</h3>
      <code>${escapeHtml(file)}</code>
      <ol>${flow.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
      <p>${escapeHtml(output)}</p>
    </article>`;
}

function contractCard(contract: BoundaryContract): string {
  return `
    <article class="contract-card">
      <div class="kicker">${escapeHtml(contract.module)}</div>
      <h3>${escapeHtml(contract.input.name)}</h3>
      <code>${escapeHtml(contract.input.schemaId)}</code>
      <div class="contract-arrow">into ${escapeHtml(contract.module)}</div>
      <h3>${escapeHtml(contract.output.name)}</h3>
      <code>${escapeHtml(contract.output.schemaId)}</code>
    </article>`;
}

function invariantCard(title: string, body: string, source: string): string {
  return `
    <article class="invariant-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
      <code>${escapeHtml(source)}</code>
    </article>`;
}

function term(label: string, tip: string): string {
  const safeTip = escapeHtml(tip);
  return `<span class="term" tabindex="0" title="${safeTip}" data-tip="${safeTip}">${escapeHtml(label)}</span>`;
}

function architectureCounts(trace: RunTrace): { sourcePackets: number; operators: number } {
  const nodes = trace.lineage.generated.concat(trace.lineage.rejected);
  return {
    sourcePackets: new Set(nodes.flatMap((node) => node.sourcePacketIds)).size,
    operators: new Set(nodes.map((node) => node.operatorId)).size,
  };
}

function codeLine(name: string, type: string, note?: string): string {
  return `
    <div class="code-line">
      <span class="code-field">${escapeHtml(name)}</span><span class="code-punct">:</span>
      <span class="code-type">${escapeHtml(type)}</span><span class="code-punct">;</span>
      ${note ? `<span class="code-note">// ${escapeHtml(note)}</span>` : ''}
    </div>`;
}

function contractBlock(name: string, tip: string, lines: string[], meta: string): string {
  return `
    <article class="contract-card">
      <div class="card-label">boundary contract</div>
      <div class="interface-code" aria-label="${escapeHtml(name)} TypeScript contract">
        <div><span class="code-keyword">interface</span> ${term(name, tip)} <span class="code-punct">{</span></div>
        ${lines.join('')}
        <div><span class="code-punct">}</span></div>
      </div>
      <p class="contract-meta">${escapeHtml(meta)}</p>
    </article>`;
}

function moduleBlock(name: string, description: string, steps: string[]): string {
  return `
    <article class="module-card">
      <div class="card-label">module</div>
      <h3>${escapeHtml(name)}</h3>
      <p>${description}</p>
      <ol class="work-steps">
        ${steps.map((step) => `<li>${step}</li>`).join('')}
      </ol>
    </article>`;
}

function flowArrow(label: string): string {
  return `<div class="flow-arrow" aria-hidden="true"><span>${escapeHtml(label)}</span></div>`;
}

export function renderArchitectureSection(trace: RunTrace): string {
  const generated = trace.lineage.generated.length;
  const rejected = trace.lineage.rejected.length;
  const stable = trace.comparison.contrasts.filter((contrast) => contrast.status === 'stable').length;
  const replaced = trace.comparison.contrasts.filter((contrast) => contrast.status === 'replaced').length;
  const focusDial = trace.comparison.focus.schedule.dial;
  const alternateDial = trace.comparison.alternate.schedule.dial;
  const counts = architectureCounts(trace);
  const seedFixture = contractBlock(
    'SeedFixture',
    'The input contract loaded from the fixture file before the kernel starts.',
    [
      codeLine('seed', 'Seed', trace.seed.title),
      codeLine('sourcePackets', 'SourcePacket[]', `${counts.sourcePackets} packets`),
      codeLine('operators', 'ReproductionOperator[]', `${counts.operators} rules`),
    ],
    'Same input shown in the top-left card.',
  );
  const candidatePool = contractBlock(
    'CandidatePool',
    'Generate output: the seed, generated candidates, and the lineage ledger.',
    [
      codeLine('seed', 'Seed'),
      codeLine('candidates', 'Candidate[]', `${generated} kept`),
      codeLine('lineage', 'LineageLedger', `${rejected} rejected`),
    ],
    'No-delta rejects are kept in lineage, not scored as candidates.',
  );
  const scoredPool = contractBlock(
    'ScoredCandidatePool',
    'Fitness output: the same candidates with novelty and grounding attached.',
    [
      codeLine('seed', 'Seed'),
      codeLine('candidates', 'ScoredCandidate[]', 'fitness added'),
    ],
    'Selection reads this pool; it does not generate new candidates.',
  );
  const comparison = contractBlock(
    'SelectionComparison',
    'Select output: both dial results plus the direct contrast between them.',
    [
      codeLine('focus', 'SelectionResult', focusDial),
      codeLine('alternate', 'SelectionResult', alternateDial),
      codeLine('contrasts', 'DialContrast[]', `${stable} stable, ${replaced} replaced`),
    ],
    'The swap summary above is a projection of this contract.',
  );
  const lensResult = contractBlock(
    'LensResult',
    'Lens output: observer-relative feasibility applied after selection.',
    [
      codeLine('lensId', 'string', trace.lensResults[0]?.lensId || 'none'),
      codeLine('label', 'string', trace.lensResults[0]?.label || 'none'),
      codeLine('scores', 'LensScore[]', `${trace.lensResults[0]?.scores.length || 0} scored`),
    ],
    'Lens scores do not enter FitnessScore.',
  );
  const runTrace = contractBlock(
    'RunTrace',
    'Final kernel artifact: serializable facts about the whole run.',
    [
      codeLine('caps', 'RunCaps'),
      codeLine('generations', 'GenerationSummary[]', `${trace.generations.length} generation records`),
      codeLine('runId', 'string'),
      codeLine('lineage', 'LineageLedger'),
      codeLine('events', 'TraceEvent[]'),
      codeLine('comparison', 'SelectionComparison'),
      codeLine('lensResults', 'LensResult[]', `${trace.lensResults.length} lens result set(s)`),
    ],
    'Human views read this after the kernel finishes.',
  );
  const generate = moduleBlock(
    'Generate',
    'Build candidate ideas from source packets that contain a real change.',
    [
      `read ${term('sourcePackets', 'Source-backed packets containing a substrate, mechanism, and either candidate data or a no-delta reason.')}`,
      `use ${term('operators', 'Named transformation rules such as Substrate removal or Hidden dependent.')} to produce candidate deltas`,
      `send ${generated} candidates forward; record ${rejected} ${term('no-delta rejects', 'Packets inspected but rejected because they did not create a useful change.')} in lineage`,
    ],
  );
  const fitness = moduleBlock(
    'Fitness',
    'Attach two scores to every generated candidate.',
    [
      `${term('novelty', 'How far the idea moves from the obvious reading of the seed.')} uses source absence, substrate distance, and hidden dependents`,
      `${term('grounding', 'How well the idea is supported and testable.')} uses signal strength, mechanism clarity, falsifiability, minus risk penalty`,
      'emit the same pool with scores and short reasons attached',
    ],
  );
  const select = moduleBlock(
    'Select',
    'Run two selectors over the same scored candidates.',
    [
      `${escapeHtml(focusDial)} prioritizes ${escapeHtml(trace.comparison.focus.schedule.priorityAxis)} with a ${escapeHtml(trace.comparison.focus.schedule.floorAxis)} floor`,
      `${escapeHtml(alternateDial)} prioritizes ${escapeHtml(trace.comparison.alternate.schedule.priorityAxis)} with a ${escapeHtml(trace.comparison.alternate.schedule.floorAxis)} floor`,
      `compare winners: ${stable} stable, ${replaced} replaced`,
    ],
  );
  const lens = moduleBlock(
    'Lens',
    'Apply capstone-demo-fit after selection without rewriting fitness.',
    [
      'read selected candidates and observer constraints',
      'score feasibility separately from novelty and grounding',
      'emit lens results for trace and microscope tools',
    ],
  );
  const traceModule = moduleBlock(
    'Trace',
    'Package the run so tools can inspect it without rerunning the kernel.',
    [
      'copy lineage, boundary contracts, generation summaries, events, and goal checks',
      'attach the selection comparison and lens results',
      'emit one JSON-safe run record',
    ],
  );

  return `
<section class="architecture" aria-label="Architecture map">
      <div class="section-title">
        <h2>Architecture Walkthrough</h2>
        <p>Contracts cross boundaries. Modules transform them.</p>
      </div>
      <div class="arch-key" aria-label="Architecture legend">
        <span><span class="key-shape module-shape"></span>module</span>
        <span><span class="key-shape contract-shape"></span>TypeScript contract</span>
        <span><span class="key-shape arrow-shape"></span>data flow</span>
      </div>
      <div class="arch-frame">
        <div class="boundary kernel-boundary">kernel boundary</div>
        <div class="arch-flow">
          ${seedFixture}
          ${flowArrow('into Generate')}
          ${generate}
          ${flowArrow('emits')}
          ${candidatePool}
          ${flowArrow('into Fitness')}
          ${fitness}
          ${flowArrow('emits')}
          ${scoredPool}
          ${flowArrow('into Select')}
          ${select}
          ${flowArrow('emits')}
          ${comparison}
          ${flowArrow('into Lens')}
          ${lens}
          ${flowArrow('emits')}
          ${lensResult}
          ${flowArrow('into Trace')}
          ${traceModule}
          ${flowArrow('emits')}
          ${runTrace}
        </div>
        <p class="arch-footnote">This HTML page is a separate view over the final artifact, not a kernel stage.</p>
      </div>
    </section>`;
}

export function renderArchitecture(trace: RunTrace, fixtureCount: number): string {
  const gen1 = gen(trace, 1);
  const gen2 = gen(trace, 2);
  const generate1 = eventAt(trace.events, 'generate', 0);
  const fitness1 = eventAt(trace.events, 'fitness', 0);
  const generate2 = eventAt(trace.events, 'generate', 1);
  const fitness2 = eventAt(trace.events, 'fitness', 1);
  const finalSelect = eventAt(trace.events, 'select', 0);
  const lens = eventAt(trace.events, 'lens', 0);
  const traceEvent = eventAt(trace.events, 'trace', 0);
  const failed = failedChecks(trace.goalChecks);
  const stable = trace.comparison.contrasts.filter((contrast) => contrast.status === 'stable').length;
  const replaced = trace.comparison.contrasts.filter((contrast) => contrast.status === 'replaced').length;
  const dropped = trace.comparison.contrasts.filter((contrast) => contrast.status === 'dropped').length;
  const parents = gen1?.selectedCandidateIds || [];
  const lensResult = trace.lensResults[0];

  const spine: SpineStep[] = [
    {
      step: '01',
      file: 'tools/run.ts, tools/microscope/*.ts',
      call: 'load fixture(s) and assert SeedFixture',
      input: 'fixtures/*.json',
      output: 'SeedFixture',
      why: 'Every command starts from the same fixture contract before entering src/. Build loads all fixtures; microscopes load one.',
      tone: 'normal',
    },
    {
      step: '02',
      file: 'src/trace.ts',
      call: 'buildRunTrace(fixture, dial, options)',
      input: 'SeedFixture + Dial + RunCaps + LensConfig[]',
      output: 'RunTrace',
      why: 'Orchestration spine. The one kernel path all proof surfaces consume.',
      tone: 'artifact',
    },
    {
      step: '03',
      file: 'src/generate.ts',
      call: 'generateCandidatePool(generation=1)',
      input: 'SeedFixture.sourcePackets without parentCandidateId',
      output: contractLine(contractFor(trace, 'generate')),
      why: 'Turns source packets into candidate deltas; no-delta packets become lineage rejects before scoring.',
      event: generate1,
      tone: 'normal',
    },
    {
      step: '04',
      file: 'src/fitness.ts',
      call: 'scoreCandidatePool(g1)',
      input: 'CandidatePool(g1)',
      output: contractLine(contractFor(trace, 'fitness')),
      why: 'Computes novelty, grounding, component provenance, and decay without collapsing the two axes.',
      event: fitness1,
      tone: 'normal',
    },
    {
      step: '05',
      file: 'src/select.ts via src/trace.ts',
      call: 'compareSelections(scored g1) to choose parents',
      input: 'ScoredCandidatePool(g1)',
      output: `parent candidate ids [${parents.join(', ') || 'none'}]`,
      why: 'This internal selection decides which candidates are allowed to produce generation 2 children.',
      tone: 'warning',
    },
    {
      step: '06',
      file: 'src/generate.ts',
      call: 'generateCandidatePool(generation=2)',
      input: 'sourcePackets where parentCandidateId is in selected parents',
      output: gen2 ? `${gen2.generatedCandidateIds.length} child candidates, ${gen2.rejectedNodeIds.length} rejects` : 'not run',
      why: `Bounded by maxGenerations=${trace.caps.maxGenerations}, maxChildrenPerParent=${trace.caps.maxChildrenPerParent}, maxPopulation=${trace.caps.maxPopulation}.`,
      event: generate2,
      tone: 'decision',
    },
    {
      step: '07',
      file: 'src/fitness.ts + src/trace.ts',
      call: 'score g2 and classify generation quality',
      input: 'CandidatePool(g2)',
      output: gen2 ? `${gen2.quality}: ${gen2.detail}` : 'not run',
      why: 'Children are compared to parents as improved, drifted, duplicated, or not_run before final merge.',
      event: fitness2,
      tone: 'decision',
    },
    {
      step: '08',
      file: 'src/trace.ts',
      call: 'mergePools and mergeScoredPools',
      input: 'g1 pool + optional g2 pool',
      output: `${trace.candidateCount} candidates in combined pool`,
      why: 'Final selection must see one shared pool, not generation-specific winners.',
      tone: 'normal',
    },
    {
      step: '09',
      file: 'src/select.ts',
      call: 'compareSelections(combined pool)',
      input: 'ScoredCandidatePool(all generations)',
      output: contractLine(contractFor(trace, 'select')),
      why: 'Explore and Proof schedules run over the same scored candidates and emit stable/replaced/dropped contrasts.',
      event: finalSelect,
      tone: 'normal',
    },
    {
      step: '10',
      file: 'src/lens.ts',
      call: 'applyLenses(selected candidates)',
      input: 'SelectionComparison + LensConfig[]',
      output: contractLine(contractFor(trace, 'lens')),
      why: 'Feasibility is applied after selection so observer fit does not contaminate FitnessScore.',
      event: lens,
      tone: 'normal',
    },
    {
      step: '11',
      file: 'src/trace.ts',
      call: 'assemble RunTrace',
      input: 'events + goalChecks + lineage + generations + comparison + lensResults',
      output: contractLine(contractFor(trace, 'trace')),
      why: 'All tools consume one machine artifact instead of re-implementing the kernel readout.',
      event: traceEvent,
      tone: 'artifact',
    },
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Doppl Kernel System Architecture</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080b09;
      --panel: #101711;
      --panel-2: #151d17;
      --ink: #f1f5ee;
      --muted: #a9b8ad;
      --line: #334339;
      --cyan: #35c2e5;
      --green: #43d17d;
      --yellow: #eec95c;
      --orange: #e98a3c;
      --red: #ef6d64;
      --purple: #a991ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px) 0 0 / 18px 18px,
        linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px) 0 0 / 18px 18px,
        var(--bg);
      color: var(--ink);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(1600px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 24px 0 32px;
    }
    h1, h2, h3, p, ol, ul { margin-top: 0; }
    h1 { margin-bottom: 4px; font-size: 28px; letter-spacing: 0; }
    h2 { margin-bottom: 10px; color: var(--muted); font-size: 14px; text-transform: uppercase; letter-spacing: 0; }
    h3 { margin-bottom: 5px; font-size: 15px; letter-spacing: 0; }
    p { color: var(--muted); }
    code { color: #d5f2dc; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      align-items: start;
      margin-bottom: 14px;
    }
    .sub { max-width: 920px; margin-bottom: 0; color: var(--muted); }
    .facts {
      display: grid;
      grid-template-columns: repeat(5, minmax(105px, 1fr));
      gap: 8px;
      min-width: 680px;
    }
    .fact, .zone, .command-card, .spine-step, .flow-card, .contract-card, .invariant-card, .pressure {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(16,23,17,.92);
    }
    .fact { padding: 9px; }
    .fact span, .kicker, .io-grid span {
      display: block;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .fact strong { display: block; margin-top: 3px; font-size: 18px; }
    .zone { padding: 12px; margin-bottom: 12px; }
    .zone.system { border-color: rgba(53,194,229,.8); }
    .zone.contracts { border-color: rgba(238,201,92,.72); }
    .zone.invariants { border-color: rgba(169,145,255,.72); }
    .command-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .command-card { padding: 11px; min-height: 190px; }
    .command-card ol {
      display: grid;
      gap: 4px;
      margin: 9px 0;
      padding-left: 18px;
      color: #dbe6de;
      font-size: 12px;
    }
    .command-card p { margin-bottom: 0; }
    .spine {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .spine-step {
      position: relative;
      display: grid;
      grid-template-columns: 54px 1fr;
      gap: 10px;
      padding: 10px;
    }
    .spine-step:not(:last-child)::after {
      content: "";
      position: absolute;
      left: 36px;
      bottom: -9px;
      width: 2px;
      height: 9px;
      background: var(--cyan);
    }
    .spine-step.decision { border-color: var(--orange); }
    .spine-step.artifact { border-color: var(--purple); }
    .spine-step.warning { border-color: var(--red); }
    .step-num {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--cyan);
      border-radius: 999px;
      color: var(--cyan);
      font: 700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .spine-step.warning .step-num { border-color: var(--red); color: var(--red); }
    .spine-step.decision .step-num { border-color: var(--orange); color: var(--orange); }
    .spine-step.artifact .step-num { border-color: var(--purple); color: var(--purple); }
    .step-top {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .step-top h3 { margin: 0; }
    .io-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .io-grid div {
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 6px;
      padding: 8px;
      background: rgba(255,255,255,.025);
      min-height: 72px;
    }
    .io-grid p { margin: 3px 0 0; color: #d6e2d9; font-size: 12px; }
    .subflows {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .flow-card { padding: 12px; }
    .flow-card ul {
      display: grid;
      gap: 6px;
      margin: 0;
      padding-left: 18px;
      color: #dbe6de;
      font-size: 12px;
    }
    .formula {
      margin: 8px 0;
      border: 1px solid rgba(238,201,92,.45);
      border-radius: 6px;
      padding: 8px;
      color: var(--yellow);
      background: rgba(35,29,12,.55);
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .contract-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
    }
    .contract-card {
      padding: 10px;
      border-color: rgba(238,201,92,.65);
      min-height: 165px;
    }
    .contract-card h3 {
      color: var(--yellow);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .contract-arrow {
      margin: 8px 0;
      color: var(--muted);
      font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .invariant-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .invariant-card { padding: 10px; min-height: 126px; }
    .pressure {
      margin-top: 12px;
      padding: 12px;
      border-color: var(--red);
      background: rgba(45,18,16,.62);
    }
    .pressure h2 { color: #ffb2ab; }
    .pressure p { margin-bottom: 0; color: #ffd1cc; }
    .legend {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .legend div {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      color: var(--muted);
      background: rgba(16,23,17,.86);
    }
    .swatch {
      display: inline-block;
      width: 16px;
      height: 10px;
      margin-right: 6px;
      border-radius: 3px;
      vertical-align: -1px;
    }
    .sw-normal { border: 2px solid var(--cyan); }
    .sw-decision { border: 2px solid var(--orange); }
    .sw-artifact { border: 2px solid var(--purple); }
    .sw-warning { border: 2px solid var(--red); }
    .sw-contract { border: 2px solid var(--yellow); }
    .sw-check { border: 2px solid var(--green); }
    @media (max-width: 1100px) {
      .header, .facts, .command-grid, .io-grid, .subflows, .contract-grid, .invariant-grid, .legend {
        grid-template-columns: 1fr;
        min-width: 0;
      }
      .step-top { display: block; }
    }
  </style>
</head>
<body>
  <main>
    <header class="header">
      <div>
        <h1>Doppl Kernel System Architecture</h1>
        <p class="sub">Runtime architecture generated from one real <code>RunTrace</code> plus source-level contracts. Shows entrypoints, orchestration, recursion, scoring, selection, lensing, trace consumers, and failure surfaces.</p>
      </div>
      <div class="facts" aria-label="current run facts">
        <div class="fact"><span>trace schema</span><strong>${escapeHtml(trace.schemaVersion)}</strong></div>
        <div class="fact"><span>fixtures</span><strong>${fixtureCount}</strong></div>
        <div class="fact"><span>candidates</span><strong>${trace.candidateCount}</strong></div>
        <div class="fact"><span>events</span><strong>${trace.events.length}</strong></div>
        <div class="fact"><span>failed checks</span><strong>${failed.length}</strong></div>
      </div>
    </header>

    <section class="zone">
      <h2>Entrypoints And Consumers</h2>
      <div class="command-grid">
        ${commandCard('pnpm build', 'tools/run.ts', [
          'read all fixtures/*.json',
          'assert each SeedFixture',
          'buildRunTrace for each fixture',
          'summarize each trace into board rows',
        ], 'stdout proof board; process exits nonzero when aggregate failedChecks > 0')}
        ${commandCard('pnpm proof:export', 'tools/run.ts', [
          'same path as pnpm build',
          'write proof-board.json',
          'write one run-trace.json per seed',
        ], 'out/proof-board/** replay artifacts')}
        ${commandCard('pnpm serve', 'tools/serve.ts', [
          'build one RunTrace per fixture',
          'serve Assay, Microscope, Architecture, Review, and /api/trace',
          'save local verdicts through one server',
        ], 'the only local UI front door')}
        ${commandCard('pnpm publish:html / serve:static', 'tools/publish.ts + tools/static-server.ts', [
          'render deploy HTML directly from the same view functions',
          'write committed published/*.html pages',
          'smoke-test the static deploy surface',
        ], 'published/** static deploy pages')}
      </div>
    </section>

    <section class="zone system">
      <h2>Runtime Spine In buildRunTrace</h2>
      <div class="spine">
        ${spine.map(stepCard).join('')}
      </div>
    </section>

    <section class="zone">
      <h2>Core Algorithms Hidden Inside The Spine</h2>
      <div class="subflows">
        <article class="flow-card">
          <h3>Generation And Recursion</h3>
          <ul>
            <li>Generation 1 reads source packets without <code>parentCandidateId</code>.</li>
            <li>No-delta packets become lineage rejects, not scored candidates.</li>
            <li>Generation 2 reads fixture-authored packets whose <code>parentCandidateId</code> matches selected gen-1 parents.</li>
            <li>Caps stop unbounded expansion: max generations, children per parent, and total population.</li>
            <li>Current gen-2 quality: <strong>${escapeHtml(gen2 ? gen2.quality : 'not_run')}</strong>.</li>
          </ul>
        </article>
        <article class="flow-card">
          <h3>Fitness</h3>
          <div class="formula">novelty = .50 sourceAbsence + .30 substrateDistance + .20 hiddenDependents</div>
          <div class="formula">grounding = .40 signalStrength + .25 mechanismClarity + .25 falsifiability - .10 riskPenalty</div>
          <ul>
            <li>Inputs are seed text, candidate text, claims, evidence, substrate, mechanism, and source packet refs.</li>
            <li>Legacy metric hints can exist, but do not author score totals.</li>
            <li>Decay is attached as engine-time metadata with half-life by subtype.</li>
          </ul>
        </article>
        <article class="flow-card">
          <h3>Selection And Lens</h3>
          <ul>
            <li>Explore schedule prioritizes novelty with a grounding floor.</li>
            <li>Proof schedule prioritizes grounding with a novelty floor.</li>
            <li>Both run over the same scored candidate pool.</li>
            <li>Selector uses Pareto fronts before directional ranking and decay-adjusted score.</li>
            <li>Current final contrast: ${stable} stable, ${replaced} replaced, ${dropped} dropped.</li>
            <li>Lens result: ${escapeHtml(lensResult ? `${lensResult.label}, ${lensResult.scores.length} selected candidates scored` : 'none')}.</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="zone contracts">
      <h2>Boundary Contracts</h2>
      <div class="contract-grid">
        ${trace.boundaryContracts.map(contractCard).join('')}
      </div>
    </section>

    <section class="zone invariants">
      <h2>Engineering Invariants And Failure Surfaces</h2>
      <div class="invariant-grid">
        ${invariantCard('Kernel core is machine-clean', 'src/ emits typed process facts. Human summaries live in tools/microscope and out/**.', 'src/contracts/index.ts, tools/microscope/*.ts')}
        ${invariantCard('One shared scored pool', 'Explore and Proof must select from the same ScoredCandidatePool so contrasts mean something.', contractSchemaLine(contractFor(trace, 'select')))}
        ${invariantCard('Two fitness axes survive selection', 'Novelty and grounding remain separate; directional score is a selection view, not a new fitness truth.', 'src/fitness.ts, src/select.ts')}
        ${invariantCard('Lens is not fitness', 'Feasibility is emitted as LensResult after selection and never written into FitnessScore.', contractSchemaLine(contractFor(trace, 'lens')))}
        ${invariantCard('Goal checks are cheap tripwires', 'TraceEvents carry checks; tools flatten them into RunTrace.goalChecks and build exits nonzero on failures.', 'src/trace.ts, tools/run.ts')}
        ${invariantCard('Fixture failures are hard stops', 'Bad fixtures, unknown operators, incomplete candidate packets, or empty fixture dirs throw before proof output pretends success.', 'assertSeedFixture, operatorFor, fixturePaths')}
        ${invariantCard('No-delta is not hidden', 'Source packets that do not produce candidates stay visible as lineage rejected nodes.', 'LineageLedger.rejected')}
        ${invariantCard('Generated artifacts are disposable', 'out/** is for inspection and replay, not durable architecture truth.', 'ARTIFACTS.md')}
      </div>
      <div class="pressure">
        <h2>Architecture Pressure Found While Drawing This</h2>
        <p>The gen-1 parent selection is a real control edge: it determines which generation-2 packets can run. Today it is recorded in <code>GenerationSummary</code>, but it is not emitted as a standalone <code>TraceEvent</code>. That is not a styling problem; it is a trace visibility gap for engineers debugging recursion.</p>
      </div>
    </section>

    <footer class="legend" aria-label="legend">
      <div><span class="swatch sw-normal"></span>normal kernel transform</div>
      <div><span class="swatch sw-decision"></span>bounded decision point</div>
      <div><span class="swatch sw-artifact"></span>artifact assembly</div>
      <div><span class="swatch sw-warning"></span>visibility pressure</div>
      <div><span class="swatch sw-contract"></span>contract boundary</div>
      <div><span class="swatch sw-check"></span>goal check surface</div>
    </footer>
  </main>
</body>
</html>`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(args.fixture, 'utf8'));
  const fixture = assertSeedFixture(raw);
  const trace = buildRunTrace(fixture, 'diverge', { lenses: [capstoneDemoLens] });
  await mkdir(args.outDir, { recursive: true });
  const htmlPath = path.join(args.outDir, 'architecture.html');
  await writeFile(htmlPath, renderArchitecture(trace, await countFixtures()), 'utf8');
  console.log(`architecture: ${path.relative(root, htmlPath)}`);
}

runMain(import.meta.url, main);
