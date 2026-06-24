// The compiler as writer: turns a seed and an engine survivor into contract-shaped node markdown.
// Implements mechanics/kernel/compiler.md — it renders, it does not think. The judge axes are the
// deterministic bridge over fitness (rating.md); Cost-efficiency and Relevance default to 0.
import type { ScoredCandidate, Seed } from '../contracts/index.ts';
import type { CompiledNode } from './sink.ts';

// Deterministic SlugId so re-running a seed is idempotent (same id, overwritten file).
function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

export function slugId(name: string): string {
  const slug = (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
  return `${slug}-${shortHash(name)}`;
}

function clamp5(value: number): number {
  return Math.max(-5, Math.min(5, value));
}

function round5(measurement: number): number {
  return clamp5(Math.round(measurement * 5));
}

export type JudgeAxes = {
  novelty: number;
  grounding: number;
  falsifiability: number;
  costEfficiency: number;
  relevance: number;
  judge: number;
};

// The deterministic bridge (rating.md): Novelty/Grounding/Falsifiability from measurements,
// judge-only axes default to 0, judge = round(mean).
export function judgeBridge(fitness: ScoredCandidate['fitness']): JudgeAxes {
  const novelty = round5(fitness.novelty);
  const grounding = round5(fitness.grounding);
  const falsifiability = round5(fitness.components.falsifiability);
  const costEfficiency = 0;
  const relevance = 0;
  const judge = clamp5(Math.round((novelty + grounding + falsifiability + costEfficiency + relevance) / 5));
  return { novelty, grounding, falsifiability, costEfficiency, relevance, judge };
}

function label(score: number): string {
  return score >= 0 ? `+${score}` : `${score}`;
}

export type DiscoveryEntry = { found: string; field: string };

function renderDiscovery(entries: DiscoveryEntry[]): string {
  if (!entries.length) return '## Discovery\n\n_(no external finds this pass)_';
  const items = entries.map((entry, i) => `### Finding ${i + 1}\n\n${entry.found} → field: [[${entry.field}]]`);
  return `## Discovery\n\n${items.join('\n\n')}`;
}

function renderEvaluation(axes: JudgeAxes): string {
  return [
    '### Evaluation',
    `#### Novelty ${label(axes.novelty)}`,
    'Bridged from the novelty measurement (fraction of language absent from the seed).',
    `#### Grounding ${label(axes.grounding)}`,
    'Bridged from the grounding measurement (evidence, mechanism, falsifiability signal).',
    `#### Falsifiability ${label(axes.falsifiability)}`,
    'Bridged from the falsifiability measurement (checkable markers, claims, evidence).',
    `#### Cost-efficiency ${label(axes.costEfficiency)}`,
    'Judge-only axis — defaults to 0 under the deterministic bridge.',
    `#### Relevance ${label(axes.relevance)}`,
    'Judge-only axis — defaults to 0 under the deterministic bridge.',
  ].join('\n\n');
}

export function compileCaseStudy(seed: Seed): CompiledNode {
  const id = slugId(seed.title);
  const markdown = [
    '---',
    `id: ${id}`,
    'stage: case_study',
    `name: ${JSON.stringify(seed.title)}`,
    'next: problem_recovery',
    '---',
    '',
    `# ${seed.title}`,
    '',
    'prev_id: null',
    '',
    '## Context',
    '',
    seed.prompt,
    '',
    '## Synopsis',
    '',
    seed.thesis,
  ].join('\n');
  return { id, stage: 'case_study', markdown };
}

export function compileProblemRecovery(
  survivor: ScoredCandidate,
  seed: Seed,
  seedNodeId: string,
  discovery: DiscoveryEntry[],
): CompiledNode {
  const id = slugId(survivor.title);
  const axes = judgeBridge(survivor.fitness);
  const skin = (survivor.claims.length ? survivor.claims : [survivor.thesis]).map((c) => `- ${c}`).join('\n');
  const markdown = [
    '---',
    `id: ${id}`,
    'stage: problem_recovery',
    'kernel: prime',
    `temporal: ${survivor.temporal ? 'true' : 'false'}`,
    'next: doppl',
    `scores: { judge: ${axes.judge}, human: null, n: 0 }`,
    'doppelgangers: 0',
    '---',
    '',
    `# ${survivor.title}`,
    '',
    `prev_id: [[${seedNodeId}]]`,
    '',
    '## Trace',
    '',
    '### Case study · synopsis',
    '',
    seed.thesis,
    '',
    renderDiscovery(discovery),
    '',
    '## Growth — Problem recovery',
    '',
    '### Surface complaint',
    '',
    `The seed reads "${seed.title}" at face value.`,
    '',
    '### Deleted assumption',
    '',
    survivor.substrate || '—',
    '',
    '### Hidden variable',
    '',
    survivor.mechanism || '—',
    '',
    '### Actual problem',
    '',
    survivor.thesis || survivor.title,
    '',
    '### Candidate response',
    '',
    survivor.claims[0] || survivor.thesis || '—',
    '',
    '### Skin in the Game',
    '',
    skin,
    '',
    renderEvaluation(axes),
    '',
    '## Path',
    '',
    'next: doppl',
  ].join('\n');
  return { id, stage: 'problem_recovery', markdown };
}
