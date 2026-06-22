// Renders a disposable HTML microscope over one RunTrace.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSeedFixture } from '../../src/contracts/index.ts';
import type { Dial, RunTrace, SelectedCandidate } from '../../src/contracts/index.ts';
import { buildRunTrace } from '../../src/trace.ts';
import { runMain } from '../cli.ts';
import { capstoneDemoLens } from '../lens-config.ts';
import { renderArchitectureSection } from './architecture.ts';
import { ideaSentence } from './glossary.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

type Args = {
  dial: Dial;
  fixture: string;
  outDir: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dial: 'diverge',
    fixture: path.join(root, 'fixtures', 'fsd-seed.json'),
    outDir: path.join(root, 'out', 'microscope'),
  };

  for (const arg of argv) {
    if (arg.startsWith('--dial=')) {
      const dial = arg.slice('--dial='.length);
      if (dial !== 'diverge' && dial !== 'converge') throw new Error(`Bad --dial value: ${dial}`);
      args.dial = dial;
    } else if (arg.startsWith('--fixture=')) {
      args.fixture = path.resolve(root, arg.slice('--fixture='.length));
    } else if (arg.startsWith('--out-dir=')) {
      args.outDir = path.resolve(root, arg.slice('--out-dir='.length));
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

function replacement(trace: RunTrace): { from?: SelectedCandidate; to?: SelectedCandidate } {
  const replaced = trace.comparison.contrasts.find((contrast) => contrast.status === 'replaced');
  if (!replaced) return {};
  return {
    from: trace.comparison.focus.selected.find((candidate) => candidate.id === replaced.selectedId),
    to: trace.comparison.alternate.selected.find((candidate) => candidate.id === replaced.alternateId),
  };
}

function swapText(trace: RunTrace): string {
  const swap = replacement(trace);
  if (swap.from && swap.to) return `${ideaSentence(swap.from)} -> ${ideaSentence(swap.to)}`;

  const focusIds = trace.comparison.focus.selected.map((candidate) => candidate.id);
  const alternateIds = trace.comparison.alternate.selected.map((candidate) => candidate.id);
  const rankShift = focusIds.find((id, index) => alternateIds[index] && alternateIds[index] !== id);
  if (!rankShift) return 'No swap';

  const focus = trace.comparison.focus.selected.find((candidate) => candidate.id === rankShift);
  const alternate = trace.comparison.alternate.selected.find((candidate) => candidate.id === alternateIds[focusIds.indexOf(rankShift)]);
  if (!focus || !alternate) return 'Rank changed';
  return `Rank changed: ${ideaSentence(focus)} <> ${ideaSentence(alternate)}`;
}

function sentence(value: string): string {
  const trimmed = value.trim().replace(/\.+$/g, '');
  return `${trimmed}.`;
}

function stableIds(trace: RunTrace): Set<string> {
  return new Set(
    trace.comparison.contrasts
      .filter((contrast) => contrast.status === 'stable')
      .map((contrast) => contrast.selectedId),
  );
}

function lensScore(trace: RunTrace, candidateId: string): string {
  const score = trace.lensResults.flatMap((result) => result.scores).find((item) => item.candidateId === candidateId);
  return score ? score.score.toFixed(2) : 'n/a';
}

function helpDot(tip: string): string {
  const safeTip = escapeHtml(tip);
  return `<span class="help-dot" tabindex="0" title="${safeTip}" data-tip="${safeTip}">?</span>`;
}

function scoreChip(label: string, value: string, tip: string): string {
  return `<span title="${escapeHtml(tip)}">${escapeHtml(label)} ${escapeHtml(value)}</span>`;
}

function card(trace: RunTrace, candidate: SelectedCandidate, tone: 'stable' | 'swap' | 'normal'): string {
  const title = `${candidate.title}: novelty ${candidate.fitness.novelty.toFixed(2)}, grounding ${candidate.fitness.grounding.toFixed(2)}`;
  return `
    <article class="card ${tone}" title="${escapeHtml(title)}">
      <p>${escapeHtml(ideaSentence(candidate))}</p>
      <div class="scores">
        ${scoreChip('novelty', candidate.fitness.novelty.toFixed(2), 'How far this candidate moves from the seed and source record.')}
        ${scoreChip('grounding', candidate.fitness.grounding.toFixed(2), 'How much source support, mechanism clarity, and testability the candidate has.')}
        ${scoreChip('decay', candidate.fitness.decay.factor.toFixed(2), 'Engine-time factor used by selection without erasing novelty or grounding.')}
        ${scoreChip('lens', lensScore(trace, candidate.id), 'Post-selection feasibility score. It does not enter core fitness.')}
      </div>
    </article>`;
}

function renderCards(trace: RunTrace, side: 'focus' | 'alternate'): string {
  const stable = stableIds(trace);
  const swap = replacement(trace);
  return trace.comparison[side].selected
    .map((candidate) => {
      const tone = stable.has(candidate.id) ? 'stable' : candidate.id === swap.from?.id || candidate.id === swap.to?.id ? 'swap' : 'normal';
      return card(trace, candidate, tone);
    })
    .join('\n');
}

function term(label: string, tip: string): string {
  const safeTip = escapeHtml(tip);
  return `<span class="term" tabindex="0" title="${safeTip}" data-tip="${safeTip}">${escapeHtml(label)}</span>`;
}

function generationText(trace: RunTrace): string {
  const generation = trace.generations.find((item) => item.index === 2);
  if (!generation) return 'Generation 2 not run';
  return `Generation 2 ${generation.quality}: ${generation.detail}`;
}

function decayLensText(trace: RunTrace): string {
  const selected = trace.comparison.focus.selected[0];
  const decay = selected ? `${selected.id} decay ${selected.fitness.decay.factor.toFixed(2)}` : 'no selected candidate';
  const lens = trace.lensResults[0];
  const best = lens?.scores.slice().sort((a, b) => b.score - a.score)[0];
  const lensText = lens && best ? `${lens.label} best ${best.candidateId} ${best.score.toFixed(2)}` : 'no lens result';
  return `${decay}; ${lensText}`;
}

function failedCheckText(trace: RunTrace): string {
  const failed = trace.goalChecks.filter((check) => !check.passed);
  return failed.length ? failed.map((check) => check.id).join(', ') : 'none';
}

function goalPassed(trace: RunTrace, id: string): boolean {
  return trace.goalChecks.some((check) => check.id === id && check.passed);
}

function proofTile(label: string, value: string, detail: string, tone: 'good' | 'warn' | 'plain' = 'plain', tip?: string): string {
  return `
    <article class="proof-tile ${tone}">
      <div class="proof-label">${escapeHtml(label)}${tip ? ` ${helpDot(tip)}` : ''}</div>
      <div class="proof-value">${escapeHtml(value)}</div>
      <p>${escapeHtml(detail)}</p>
    </article>`;
}

function runConclusion(trace: RunTrace): { tone: 'good' | 'warn'; title: string; detail: string } {
  const failed = trace.goalChecks.filter((check) => !check.passed);
  const generation = trace.generations.find((item) => item.index === 2);
  const swap = sentence(swapText(trace));
  const contrastCount = trace.comparison.contrasts.length;
  const stable = trace.comparison.contrasts.filter((contrast) => contrast.status === 'stable').length;

  if (failed.length) {
    return {
      tone: 'warn',
      title: 'The run is not contract-clean.',
      detail: `${failed.length} goal check(s) failed. Start with Failed Checks, then inspect the stage strip below.`,
    };
  }

  if (generation?.quality === 'improved') {
    return {
      tone: 'good',
      title: 'Generation 2 improved at least one selected branch.',
      detail: `${swap} ${stable}/${contrastCount} selected candidates survived both Explore and Proof.`,
    };
  }

  if (generation?.quality === 'drifted') {
    return {
      tone: 'warn',
      title: 'Generation 2 moved, but did not improve.',
      detail: `The child candidates changed direction without beating their parents. ${swap}`,
    };
  }

  if (generation?.quality === 'duplicated') {
    return {
      tone: 'warn',
      title: 'Generation 2 mostly repeated its parents.',
      detail: 'Treat the child expansion as noise unless the lineage cards show a real mechanism change.',
    };
  }

  return {
    tone: 'good',
    title: 'The run is contract-clean.',
    detail: `${trace.lineage.generated.length} candidates generated, ${trace.lineage.rejected.length} rejected before scoring. ${swap}`,
  };
}

function renderStageStrip(trace: RunTrace): string {
  const failed = trace.goalChecks.filter((check) => !check.passed);
  const generation = trace.generations.find((item) => item.index === 2);
  const lens = trace.lensResults[0];
  const focusDial = trace.comparison.focus.schedule.dial === 'diverge' ? 'Explore' : 'Proof';
  const alternateDial = trace.comparison.alternate.schedule.dial === 'diverge' ? 'Explore' : 'Proof';
  const stages = [
    {
      label: 'Seed',
      value: trace.seed.title,
      tip: 'The fixture input. This page shows one seed; pnpm build shows all seeds.',
    },
    {
      label: 'Generate',
      value: `${trace.lineage.generated.length} kept / ${trace.lineage.rejected.length} rejected`,
      tip: 'Creates candidate ideas from source packets. Rejected means no useful delta, not a scored failure.',
    },
    {
      label: 'Fitness',
      value: goalPassed(trace, 'fitness-computed-from-source') ? 'computed' : 'check failed',
      tip: 'Computes novelty and grounding from candidate and source material.',
    },
    {
      label: 'Select',
      value: `${focusDial} vs ${alternateDial}`,
      tip: 'Runs two dials over the same scored pool so we can see what changes when priorities change.',
    },
    {
      label: 'Gen 2',
      value: generation ? generation.quality : 'not run',
      tip: 'Bounded child generation. Improved beats parent, drifted moves without beating parent, duplicated repeats parent.',
    },
    {
      label: 'Lens',
      value: lens ? lens.label : 'none',
      tip: 'Post-selection feasibility view. It never becomes novelty or grounding.',
    },
    {
      label: 'Checks',
      value: failed.length ? `${failed.length} failed` : 'pass',
      tip: 'Goal checks are run-level contract assertions, not truth claims about the ideas.',
    },
  ];

  return `
    <div class="stage-strip" aria-label="Kernel stage strip">
      ${stages.map((stage) => `
        <div class="stage-node">
          <div class="stage-label">${escapeHtml(stage.label)} ${helpDot(stage.tip)}</div>
          <div class="stage-value">${escapeHtml(stage.value)}</div>
        </div>`).join('')}
    </div>`;
}

function renderReaderBrief(trace: RunTrace): string {
  const conclusion = runConclusion(trace);
  return `
    <section class="reader-brief" aria-label="How to read this microscope">
      <div class="brief-head">
        <div>
          <h2>Read This First</h2>
          <p>This page is a single-seed view over <code>RunTrace</code>. Use it to understand the run; use <code>pnpm build</code> to prove all seeds.</p>
        </div>
        <div class="verdict ${conclusion.tone}">${conclusion.tone === 'good' ? 'clean run' : 'inspect'}</div>
      </div>
      <div class="brief-grid">
        <article class="brief-card primary ${conclusion.tone}">
          <div class="brief-label">Current conclusion</div>
          <h3>${escapeHtml(conclusion.title)}</h3>
          <p>${escapeHtml(conclusion.detail)}</p>
        </article>
        <article class="brief-card">
          <div class="brief-label">Look here first</div>
          <ol class="reading-order">
            <li><strong>Gen 2</strong> tells whether recursion improved, drifted, or duplicated.</li>
            <li><strong>Explore vs Proof</strong> shows whether novelty priority and grounding priority pick different survivors.</li>
            <li><strong>Decay / Lens</strong> proves time and feasibility are visible without being merged into core fitness.</li>
          </ol>
        </article>
        <article class="brief-card">
          <div class="brief-label">Plain terms</div>
          <div class="term-grid">
            ${term('Explore', 'Selection mode that prioritizes novelty while keeping a grounding floor.')}
            ${term('Proof', 'Selection mode that prioritizes grounding while keeping a novelty floor.')}
            ${term('Novelty', 'A computed score for how non-obvious or source-distant the candidate is.')}
            ${term('Grounding', 'A computed score for source support, mechanism clarity, and testability.')}
            ${term('Decay', 'Engine-time pressure used during selection. It does not overwrite novelty or grounding.')}
            ${term('Lens', 'A post-selection observer view, such as capstone-demo fit. It is not fitness.')}
            ${term('Rejected', 'A source packet was inspected but did not create a useful candidate delta.')}
            ${term('Drifted', 'A child candidate changed direction but did not beat its parent.')}
          </div>
        </article>
      </div>
      <div class="changed-surface">
        <span>Changed since the old microscope:</span>
        <b>build proves all seeds</b>
        <b>computed fitness</b>
        <b>bounded generation 2</b>
        <b>decay separate from fitness</b>
        <b>lens after selection</b>
      </div>
      ${renderStageStrip(trace)}
    </section>`;
}

function renderRunState(trace: RunTrace): string {
  const generation2 = trace.generations.find((item) => item.index === 2);
  const lens = trace.lensResults[0];
  const lensBest = lens?.scores.slice().sort((a, b) => b.score - a.score)[0];
  const failed = trace.goalChecks.filter((check) => !check.passed);
  const gen2Value = generation2 ? generation2.quality : 'not run';
  const gen2Detail = generation2
    ? `${generation2.parentCandidateIds.length} parent(s); ${generation2.generatedCandidateIds.length} child candidate(s)`
    : 'No generation-2 summary in trace.';
  const lensValue = lens && lensBest ? `${lensBest.candidateId} ${lensBest.score.toFixed(2)}` : 'none';

  return `
    <section class="run-state" aria-label="Current kernel run state">
      <div class="run-state-head">
        <div>
          <h2>Run State Tiles</h2>
          <p>${escapeHtml(trace.schemaVersion)} over ${trace.seed.title}</p>
        </div>
        <div class="verdict ${failed.length ? 'warn' : 'good'}">${failed.length ? `${failed.length} failed` : 'checks pass'}</div>
      </div>
      <div class="proof-grid">
        ${proofTile('Generate', `${trace.lineage.generated.length} / ${trace.lineage.rejected.length}`, 'generated candidates / no-delta rejects', 'plain', 'First number moves forward to fitness. Second number was inspected but rejected before scoring.')}
        ${proofTile('Fitness', goalPassed(trace, 'fitness-computed-from-source') ? 'computed' : 'check failed', 'novelty and grounding come from source/candidate text', goalPassed(trace, 'fitness-computed-from-source') ? 'good' : 'warn', 'Fitness has two axes: novelty and grounding. Selection may use both, but the trace keeps them separate.')}
        ${proofTile('Generation 2', gen2Value, gen2Detail, generation2?.quality === 'improved' ? 'good' : generation2?.quality === 'duplicated' ? 'warn' : 'plain', 'Improved means a child beat its parent. Drifted means it changed direction without beating parent. Duplicated means it mostly repeated parent.')}
        ${proofTile('Decay', goalPassed(trace, 'decay-visible-not-merged') ? 'separate' : 'check failed', decayLensText(trace).split('; ')[0], goalPassed(trace, 'decay-visible-not-merged') ? 'good' : 'warn', 'Decay is an engine-time factor used by selection. It is shown beside fitness, not merged into novelty or grounding.')}
        ${proofTile('Lens', lensValue, lens ? `${lens.label}; outside FitnessScore` : 'No lens result emitted.', lens ? 'good' : 'warn', 'Lens means observer-specific feasibility after selection. This run uses capstone-demo fit.')}
        ${proofTile('Failed Checks', failedCheckText(trace), 'kernel goal checks from RunTrace', failed.length ? 'warn' : 'good', 'Failed checks are contract/proof failures for the run. Passing checks does not prove the ideas are true.')}
      </div>
    </section>`;
}

export function renderHtml(trace: RunTrace): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Kernel Microscope</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17201b;
      --muted: #637066;
      --line: #cdd8d0;
      --bg: #f7f8f5;
      --panel: #ffffff;
      --stable: #d9f2df;
      --stable-line: #4a9a5c;
      --swap: #ffe2bd;
      --swap-line: #bf6b14;
      --reject: #ecefec;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 15px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 24px;
      letter-spacing: 0;
    }
    .sub {
      margin: 0 0 20px;
      color: var(--muted);
    }
    code {
      padding: 2px 5px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: #f4f7f2;
      color: #344139;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .reader-brief {
      margin: 18px 0;
      border: 2px solid #17201b;
      border-radius: 8px;
      background: #f9fbf7;
      box-shadow: 4px 4px 0 rgba(23,32,27,.18);
      padding: 16px;
    }
    .brief-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
    }
    .brief-head h2 {
      margin: 0 0 4px;
      font-size: 20px;
    }
    .brief-head p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .brief-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 10px;
    }
    .brief-card {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      padding: 12px;
      min-height: 146px;
    }
    .brief-card.primary.good {
      border-color: #4a9a5c;
      background: #edf9ef;
    }
    .brief-card.primary.warn {
      border-color: #bf6b14;
      background: #fff5dc;
    }
    .brief-label {
      margin-bottom: 7px;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .brief-card h3 {
      margin: 0 0 8px;
      font-size: 19px;
      line-height: 1.15;
    }
    .brief-card p {
      margin: 0;
      color: #3e4d44;
      font-size: 13px;
    }
    .reading-order {
      margin: 0;
      padding-left: 19px;
      color: #344139;
      font-size: 13px;
    }
    .reading-order li + li {
      margin-top: 7px;
    }
    .term-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }
    .term-grid .term {
      display: inline-flex;
      padding: 5px 7px;
      border: 1px dotted #69766d;
      border-radius: 999px;
      background: #f6f8f4;
      font-size: 12px;
    }
    .changed-surface {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin: 12px 0;
      color: var(--muted);
      font-size: 12px;
    }
    .changed-surface b {
      padding: 4px 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: #26332b;
      font-weight: 650;
    }
    .stage-strip {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
      align-items: stretch;
      margin-top: 10px;
    }
    .stage-node {
      position: relative;
      min-height: 78px;
      border: 1px solid #9fb0a5;
      border-radius: 7px;
      background: #17201b;
      color: #eaf2ec;
      padding: 9px;
    }
    .stage-node:not(:last-child)::after {
      content: "→";
      position: absolute;
      right: -12px;
      top: 50%;
      z-index: 2;
      width: 16px;
      height: 16px;
      margin-top: -8px;
      border-radius: 999px;
      background: #f9fbf7;
      color: #26332b;
      text-align: center;
      font-weight: 800;
      line-height: 15px;
      font-size: 12px;
    }
    .stage-label {
      color: #9fb0a5;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .stage-value {
      margin-top: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.18;
      overflow-wrap: anywhere;
    }
    .run-state {
      margin: 18px 0;
      border: 2px solid #26332b;
      border-radius: 8px;
      background: #fffdf5;
      box-shadow: 3px 3px 0 rgba(23,32,27,.16);
      padding: 16px;
    }
    .run-state-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
    }
    .run-state-head h2 {
      margin: 0 0 3px;
      font-size: 18px;
    }
    .run-state-head p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .verdict {
      min-width: 112px;
      border-radius: 6px;
      padding: 7px 10px;
      text-align: center;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: .04em;
    }
    .verdict.good, .proof-tile.good {
      background: #e4f7e8;
      border-color: #4a9a5c;
    }
    .verdict.warn, .proof-tile.warn {
      background: #fff0cf;
      border-color: #bf6b14;
    }
    .proof-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
    }
    .proof-tile {
      min-height: 106px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #ffffff;
      padding: 10px;
    }
    .proof-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .proof-value {
      margin: 5px 0 4px;
      font-size: 22px;
      font-weight: 750;
      line-height: 1.05;
    }
    .proof-tile p {
      margin: 0;
      color: #415047;
      font-size: 12px;
    }
    .pipeline {
      display: grid;
      grid-template-columns: 1fr 1fr 1.4fr 1.4fr;
      gap: 14px;
      align-items: stretch;
    }
    .box, .lane {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-height: 142px;
    }
    .box h2, .lane h2 {
      margin: 0 0 10px;
      font-size: 13px;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: .04em;
    }
    .big {
      font-size: 30px;
      font-weight: 700;
      margin: 4px 0 2px;
    }
    .caption {
      color: var(--muted);
      margin: 0;
    }
    .contract-link {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .contract-link code {
      padding: 2px 5px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: #f4f7f2;
      color: #344139;
      font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .cards {
      display: grid;
      gap: 8px;
    }
    .card {
      border: 1px solid var(--line);
      border-left-width: 5px;
      border-radius: 7px;
      padding: 9px 10px;
      background: #fff;
    }
    .card p {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .card.stable {
      background: var(--stable);
      border-color: var(--stable-line);
    }
    .card.swap {
      background: var(--swap);
      border-color: var(--swap-line);
    }
    .scores {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
    }
    .scores span {
      border-bottom: 1px dotted #9aa79d;
      cursor: help;
    }
    .summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 14px;
    }
    .architecture {
      margin-top: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }
    .section-title {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .section-title h2 {
      margin: 0;
      font-size: 16px;
    }
    .section-title p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .arch-key {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      margin: -2px 0 12px;
      color: var(--muted);
      font-size: 12px;
    }
    .arch-key span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .key-shape {
      width: 18px;
      height: 12px;
      border-radius: 3px;
      border: 1px solid var(--line);
      background: #fff;
    }
    .module-shape {
      border: 2px solid #2f3d34;
      background: #fffefb;
    }
    .contract-shape {
      background: #17201b;
      border-color: #17201b;
    }
    .arrow-shape {
      position: relative;
      border: 0;
      background: transparent;
    }
    .arrow-shape::before {
      content: "↓";
      position: absolute;
      inset: -4px 0 auto;
      color: #2f3d34;
      font: 18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      text-align: center;
    }
    .arch-frame {
      position: relative;
      border: 1px dashed #9fb0a5;
      border-radius: 8px;
      padding: 24px 14px 12px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.75)),
        repeating-linear-gradient(-2deg, transparent 0 13px, rgba(23,32,27,.035) 13px 14px);
    }
    .boundary {
      position: absolute;
      left: 12px;
      top: -10px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel);
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .arch-flow {
      display: grid;
      gap: 6px;
    }
    .contract-card, .module-card {
      border-radius: 8px;
      padding: 12px 14px;
    }
    .contract-card {
      border: 1px solid #9fb0a5;
      background: #f7faf7;
    }
    .module-card {
      border: 2px solid #2f3d34;
      background: #fffefb;
      box-shadow: 2px 2px 0 rgba(23,32,27,.12);
    }
    .card-label {
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .interface-code {
      overflow-x: auto;
      border-radius: 6px;
      padding: 10px 12px;
      background: #17201b;
      color: #eaf2ec;
      font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: nowrap;
    }
    .code-line {
      padding-left: 14px;
    }
    .code-keyword {
      color: #92d48a;
    }
    .code-field {
      color: #f3d28c;
    }
    .code-type {
      color: #91c7ef;
    }
    .code-punct {
      color: #cbd8ce;
    }
    .code-note {
      color: #9daaa1;
      margin-left: 8px;
    }
    .contract-meta {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .module-card h3 {
      margin: 0 0 4px;
      font-size: 16px;
    }
    .module-card p {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .work-steps {
      display: grid;
      gap: 5px;
      margin: 0;
      padding-left: 18px;
      color: #26332b;
      font-size: 13px;
    }
    .work-steps li {
      padding-left: 2px;
    }
    .flow-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #2f3d34;
      font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .flow-arrow::before, .flow-arrow::after {
      content: "";
      width: 34px;
      height: 1px;
      background: var(--line);
    }
    .flow-arrow span::after {
      content: " ↓";
      font-size: 15px;
      letter-spacing: 0;
      vertical-align: -1px;
    }
    .term {
      position: relative;
      border-bottom: 1px dotted #69766d;
      cursor: help;
    }
    .term:focus, .help-dot:focus {
      outline: 2px solid rgba(74,154,92,.35);
      outline-offset: 2px;
    }
    .term::after, .help-dot::after {
      position: absolute;
      left: 0;
      bottom: calc(100% + 7px);
      z-index: 20;
      width: 220px;
      padding: 7px 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #17201b;
      color: #fff;
      content: attr(data-tip);
      font: 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      opacity: 0;
      pointer-events: none;
      transform: translateY(4px);
      transition: opacity .12s ease, transform .12s ease;
    }
    .term:hover::after, .term:focus::after, .help-dot:hover::after, .help-dot:focus::after {
      opacity: 1;
      transform: translateY(0);
    }
    .help-dot {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-left: 3px;
      border: 1px solid #9fb0a5;
      border-radius: 999px;
      background: #fff;
      color: #2f3d34;
      cursor: help;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      text-transform: none;
      letter-spacing: 0;
    }
    .stage-label .help-dot {
      width: 14px;
      height: 14px;
      border-color: #6f8476;
      background: #223027;
      color: #cfe3d3;
      font-size: 10px;
      vertical-align: 1px;
    }
    .stage-label .help-dot::after {
      color: #17201b;
      background: #fff;
      border-color: #9fb0a5;
    }
    .arch-footnote {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .legend {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
    }
    .key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 1px solid var(--line);
    }
    .swatch.stable { background: var(--stable); border-color: var(--stable-line); }
    .swatch.swap { background: var(--swap); border-color: var(--swap-line); }
    .swatch.reject { background: var(--reject); }
    @media (max-width: 900px) {
      .pipeline, .summary, .proof-grid, .brief-grid, .stage-strip { grid-template-columns: 1fr; }
      .run-state-head, .brief-head { display: block; }
      .verdict { display: inline-block; margin-top: 10px; }
      .section-title { display: block; }
      .section-title h2 { margin-bottom: 4px; }
      .interface-code { font-size: 11px; }
      main { padding: 18px; }
      .stage-node:not(:last-child)::after {
        content: "↓";
        right: 12px;
        top: auto;
        bottom: -12px;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>Kernel Microscope</h1>
    <p class="sub">One trace, bounded generation, two selectors, one post-selection lens.</p>

    ${renderReaderBrief(trace)}

    ${renderRunState(trace)}

    <section class="pipeline" aria-label="Kernel flow">
      <div class="box">
        <h2>Input</h2>
        <p><strong>${escapeHtml(trace.seed.title)}</strong></p>
        <p class="caption">${escapeHtml(trace.seed.thesis)}</p>
        <p class="contract-link" title="The architecture diagram below shows this as SeedFixture.seed.">maps to <code>SeedFixture.seed</code></p>
      </div>
      <div class="box">
        <h2>Generate</h2>
        <div class="big">${trace.lineage.generated.length}</div>
        <p class="caption">ideas kept</p>
        <div class="big">${trace.lineage.rejected.length}</div>
        <p class="caption">repeats rejected</p>
        <p class="contract-link">${escapeHtml(generationText(trace))}</p>
      </div>
      <div class="lane">
        <h2>${escapeHtml(trace.comparison.focus.schedule.dial === 'diverge' ? 'Explore Keeps' : 'Proof Keeps')}</h2>
        <div class="cards">${renderCards(trace, 'focus')}</div>
      </div>
      <div class="lane">
        <h2>${escapeHtml(trace.comparison.alternate.schedule.dial === 'diverge' ? 'Explore Keeps' : 'Proof Keeps')}</h2>
        <div class="cards">${renderCards(trace, 'alternate')}</div>
      </div>
    </section>

    <section class="summary">
      <div class="box">
        <h2>The Swap</h2>
        <p>${escapeHtml(swapText(trace))}</p>
      </div>
      <div class="box">
        <h2>Decay / Lens</h2>
        <p>${escapeHtml(decayLensText(trace))}</p>
      </div>
    </section>

    ${renderArchitectureSection(trace)}

    <footer class="legend">
      <span class="key"><span class="swatch swap"></span>Changed between selectors</span>
      <span class="key"><span class="swatch stable"></span>Survived both selectors</span>
      <span class="key"><span class="swatch reject"></span>Rejected before scoring</span>
      <span title="Surprise is the microscope label for novelty. Evidence is the microscope label for grounding.">surprise/evidence: translated score labels</span>
    </footer>
  </main>
</body>
</html>`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(args.fixture, 'utf8'));
  const fixture = assertSeedFixture(raw);
  const trace = buildRunTrace(fixture, args.dial, { lenses: [capstoneDemoLens] });
  await mkdir(args.outDir, { recursive: true });
  const htmlPath = path.join(args.outDir, 'index.html');
  await writeFile(htmlPath, renderHtml(trace), 'utf8');
  console.log(`microscope: ${path.relative(root, htmlPath)}`);
}

runMain(import.meta.url, main);
