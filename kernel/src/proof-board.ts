import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CandidateSolution, FitnessRecord, KernelRun } from './contracts.ts';
import { replayRunProjection } from './event-store.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fitnessFor(run: KernelRun, candidateId: string): FitnessRecord | undefined {
  return run.fitnessRecords.find((record) => record.candidateId === candidateId);
}

function renderCandidate(run: KernelRun, candidate: CandidateSolution): string {
  const fitness = fitnessFor(run, candidate.id);
  return `<article class="candidate">
    <div class="candidate__meta">
      <code>${escapeHtml(candidate.id)}</code>
      <span>${escapeHtml(candidate.agenomeId)}</span>
      <strong>${fitness?.total.toFixed(1) ?? 'unscored'}</strong>
    </div>
    <h3>${escapeHtml(candidate.title)}</h3>
    <p>${escapeHtml(candidate.summary)}</p>
    <dl>
      <dt>Mechanism</dt>
      <dd>${escapeHtml(candidate.mechanism)}</dd>
      <dt>Delta</dt>
      <dd>${escapeHtml(candidate.claimedDelta)}</dd>
      <dt>Citations</dt>
      <dd>${candidate.citedKnowledge.map(escapeHtml).join(', ') || 'none'}</dd>
    </dl>
  </article>`;
}

function renderTrace(run: KernelRun): string {
  return run.events
    .map(
      (event) => `<li>
        <span>${event.index.toString().padStart(2, '0')}</span>
        <code>${escapeHtml(event.type)}</code>
      </li>`,
    )
    .join('');
}

function renderModelHealth(run: KernelRun): string {
  const modelOutputs = replayRunProjection(run.events).modelOutputs;
  const total =
    modelOutputs.accepted +
    modelOutputs.repairRequested +
    modelOutputs.repaired +
    modelOutputs.rejected;
  if (total === 0) return '';
  const byPurpose = Object.entries(modelOutputs.byPurpose)
    .map(
      ([purpose, counts]) => `<li>
        <code>${escapeHtml(purpose)}</code>
        <span>${counts.accepted} accepted</span>
        <span>${counts.repairRequested} repair requested</span>
        <span>${counts.repaired} repaired</span>
        <span>${counts.rejected} rejected</span>
      </li>`,
    )
    .join('');
  return `<section id="model-health">
        <h2>Model Output Health</h2>
        <div class="summary">
          <div class="metric"><strong>${modelOutputs.accepted}</strong><span>accepted</span></div>
          <div class="metric"><strong>${modelOutputs.repairRequested}</strong><span>repair requested</span></div>
          <div class="metric"><strong>${modelOutputs.repaired}</strong><span>repaired</span></div>
          <div class="metric"><strong>${modelOutputs.rejected}</strong><span>rejected</span></div>
        </div>
        <ol class="health">${byPurpose}</ol>
      </section>`;
}

function renderEvolution(run: KernelRun): string {
  const generations = run.evolution
    .map(
      (generation) => `<li>
        <h3>Generation ${generation.generation}</h3>
        <dl>
          <dt>Candidates</dt>
          <dd>${generation.candidateIds.map((candidateId) => `<code>${escapeHtml(candidateId)}</code>`).join(' ')}</dd>
          <dt>Selected parents</dt>
          <dd>${
            generation.selectedParentIds.length === 2
              ? generation.selectedParentIds.map((candidateId) => `<code>${escapeHtml(candidateId)}</code>`).join(' ')
              : 'none'
          }</dd>
          <dt>Child</dt>
          <dd>${generation.childId ? `<code>${escapeHtml(generation.childId)}</code>` : 'none'}</dd>
        </dl>
      </li>`,
    )
    .join('');
  return `<section id="evolution">
        <h2>Evolution</h2>
        <div class="summary">
          <div class="metric"><strong>${run.evolution.length}</strong><span>generations run</span></div>
          <div class="metric"><strong>${run.budget.usedUnits}</strong><span>budget used</span></div>
          <div class="metric"><strong>${run.budget.remainingUnits}</strong><span>budget remaining</span></div>
          <div class="metric"><strong>${run.budget.exhausted ? 'yes' : 'no'}</strong><span>budget exhausted</span></div>
        </div>
        <ol class="evolution">${generations}</ol>
      </section>`;
}

function css(): string {
  return `<style>
    :root {
      color-scheme: light;
      --ink: #172033;
      --muted: #5d6880;
      --line: #d9e1ee;
      --paper: #f7f9fc;
      --panel: #ffffff;
      --blue: #2357d6;
      --blue-soft: #eaf0ff;
      --green: #0d7a5f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--paper);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header {
      padding: 32px clamp(20px, 4vw, 56px) 20px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1, h2, h3 { margin: 0; letter-spacing: 0; }
    h1 { max-width: 880px; font-size: clamp(32px, 5vw, 56px); line-height: 1.02; }
    h2 { font-size: 20px; margin-bottom: 14px; }
    h3 { font-size: 17px; margin-top: 12px; }
    p { margin: 10px 0 0; color: var(--muted); }
    .artifact-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .artifact-links a {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 6px 9px;
      color: var(--ink);
      background: var(--panel);
      text-decoration: none;
      font-size: 13px;
    }
    .artifact-links a:focus,
    .artifact-links a:hover {
      border-color: var(--blue);
      background: var(--blue-soft);
      outline: none;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      color: var(--blue);
    }
    main {
      display: grid;
      grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
      gap: 24px;
      padding: 24px clamp(20px, 4vw, 56px) 48px;
    }
    nav {
      position: sticky;
      top: 16px;
      align-self: start;
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 14px;
    }
    nav a {
      display: block;
      padding: 8px 10px;
      border-radius: 6px;
      color: var(--ink);
      text-decoration: none;
    }
    nav a:focus,
    nav a:hover { background: var(--blue-soft); outline: none; }
    section {
      margin-bottom: 24px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 20px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 12px;
      margin-top: 22px;
    }
    .metric {
      border-left: 3px solid var(--blue);
      padding-left: 10px;
    }
    .metric strong { display: block; font-size: 24px; }
    .metric span { color: var(--muted); font-size: 13px; }
    .candidates {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }
    .candidate {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fbfcff;
    }
    .candidate__meta {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .candidate__meta span,
    .candidate__meta strong {
      border-radius: 999px;
      background: var(--blue-soft);
      padding: 3px 8px;
      font-size: 12px;
    }
    .candidate__meta strong { color: var(--green); }
    dl { margin: 12px 0 0; }
    dt { margin-top: 8px; color: var(--ink); font-weight: 700; font-size: 13px; }
    dd { margin: 3px 0 0; color: var(--muted); }
    .trace {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      padding: 0;
      list-style: none;
    }
    .trace li {
      display: flex;
      gap: 8px;
      align-items: center;
      border-bottom: 1px solid var(--line);
      padding: 7px 0;
    }
    .trace span {
      width: 28px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .health {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
      padding: 0;
      list-style: none;
    }
    .health li {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcff;
    }
    .health span {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }
    .evolution {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
    }
    .evolution li {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fbfcff;
    }
    .evolution dd code {
      display: inline-block;
      margin: 0 5px 5px 0;
    }
    @media (max-width: 820px) {
      main { grid-template-columns: 1fr; }
      nav { position: static; }
      .summary { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
    }
  </style>`;
}

export function renderProofBoard(run: KernelRun): string {
  const child = run.fusion?.child;
  const modelHealth = renderModelHealth(run);
  const evolution = renderEvolution(run);
  const modelHealthNav = modelHealth ? '      <a href="#model-health">Model health</a>\n' : '';
  const modelHealthSection = modelHealth ? `${modelHealth}\n      ` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Doppl Kernel Proof Board</title>
  ${css()}
</head>
<body>
  <header>
    <p><code>${escapeHtml(run.id)}</code> / ${escapeHtml(run.memoryMode)} memory</p>
    <h1>Doppl Kernel Proof Board</h1>
    <p>${escapeHtml(run.caseStudy.title)}</p>
    <div class="summary">
      <div class="metric"><strong>${run.candidates.length}</strong><span>candidate artifacts</span></div>
      <div class="metric"><strong>${run.criticVerdicts.length}</strong><span>critic verdicts</span></div>
      <div class="metric"><strong>${run.knowledgePacket.items.length}</strong><span>memory items</span></div>
      <div class="metric"><strong>${run.fusion?.inheritanceWeights.parentA ?? 0}</strong><span>parent A inheritance</span></div>
    </div>
  </header>
  <main>
    <nav aria-label="Proof board sections">
      <a href="#recovery">Problem recovery</a>
      <a href="#memory">Knowledge packet</a>
      <a href="#parents">Parents and fitness</a>
      <a href="#fusion">Fusion child</a>
      <a href="#evolution">Evolution</a>
${modelHealthNav}      <a href="#trace">Trace</a>
    </nav>
    <div>
      <section id="recovery">
        <h2>Problem Recovery</h2>
        <h3>${escapeHtml(run.problemRecovery.title)}</h3>
        <p>${escapeHtml(run.problemRecovery.recoveredProblem)}</p>
        <dl>
          <dt>Hidden constraint</dt>
          <dd>${escapeHtml(run.problemRecovery.hiddenConstraint)}</dd>
          <dt>Falsifier</dt>
          <dd>${escapeHtml(run.problemRecovery.falsifier)}</dd>
        </dl>
      </section>
      <section id="memory">
        <h2>Knowledge Packet</h2>
        <p><code>${escapeHtml(run.knowledgePacket.id)}</code></p>
        <div class="candidates">
          ${run.knowledgePacket.items
            .map(
              (item) => `<article class="candidate">
                <div class="candidate__meta"><code>${escapeHtml(item.citeHandle)}</code><span>${escapeHtml(item.sourceCase)}</span></div>
                <p>${escapeHtml(item.text)}</p>
              </article>`,
            )
            .join('')}
        </div>
      </section>
      <section id="parents">
        <h2>Parents And Fitness</h2>
        <div class="candidates">
          ${run.candidates.map((candidate) => renderCandidate(run, candidate)).join('')}
        </div>
      </section>
      <section id="fusion">
        <h2>Fusion Child</h2>
        ${
          child
            ? `${renderCandidate(run, child)}
              <dl>
                <dt>Compatibility</dt>
                <dd>${escapeHtml(run.fusion!.compatibility.rationale)}</dd>
                <dt>Inheritance weights</dt>
                <dd>${run.fusion!.inheritanceWeights.parentA} / ${run.fusion!.inheritanceWeights.parentB}</dd>
                <dt>Mutation notes</dt>
                <dd>${run.fusion!.mutationNotes.map(escapeHtml).join(' ')}</dd>
              </dl>`
            : '<p>No child was produced.</p>'
        }
      </section>
      ${evolution}
      ${modelHealthSection}<section id="trace">
        <h2>Trace</h2>
        <ol class="trace">${renderTrace(run)}</ol>
      </section>
    </div>
  </main>
</body>
</html>`;
}

export async function writeProofBoard(run: KernelRun, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, 'index.html');
  await writeFile(filePath, renderProofBoard(run), 'utf8');
  return filePath;
}
