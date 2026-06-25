// The compiler-writer: renders contract-shaped node markdown from generated content + the judge's
// evaluation. Implements mechanics/kernel/compiler.md — it renders, it does not think. Owns the
// generated-content shapes and the SlugId so the rest of src/io can import them without a cycle.

export type DiscoveryEntry = { found: string; field: string };

export type TraceSynopsis = { stage: string; synopsis: string };

export type Evaluation = {
  novelty: number;
  grounding: number;
  falsifiability: number;
  costEfficiency: number;
  relevance: number;
  judge: number;
  reasons: Record<string, string>;
};

export type ProblemFrame = {
  title: string;
  surfaceComplaint: string;
  deletedAssumption: string;
  hiddenVariable: string;
  actualProblem: string;
  candidateResponse: string;
  skinInTheGame: string[];
  temporal: boolean;
};

export type Doppl = {
  title: string;
  claim: string;
  implications: string[];
  opportunities: string[];
  temporal: boolean;
};

export type CompiledNode = { id: string; stage: string; markdown: string };

function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

export function slugId(name: string): string {
  const slug = (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
  return `${slug}-${shortHash(name)}`;
}

function label(score: number): string {
  return score >= 0 ? `+${score}` : `${score}`;
}

function lst(items: string[]): string {
  return items && items.length ? items.map((x) => `- ${x}`).join('\n') : '- —';
}

const STAGE_LABEL: Record<string, string> = { case_study: 'Case study', problem_recovery: 'Problem recovery', doppl: 'Doppl' };

function renderTrace(trace: TraceSynopsis[]): string {
  if (!trace.length) return '## Trace\n\n_(no prior stage)_';
  return `## Trace\n\n${trace.map((t) => `### ${STAGE_LABEL[t.stage] ?? t.stage} · synopsis\n\n${t.synopsis}`).join('\n\n')}`;
}

function renderDiscovery(entries: DiscoveryEntry[]): string {
  if (!entries.length) return '## Discovery\n\n_(no admitted finds this pass)_';
  return `## Discovery\n\n${entries.map((e, i) => `### Finding ${i + 1}\n\n${e.found} → field: [[${e.field}]]`).join('\n\n')}`;
}

const AXES: [keyof Evaluation, string][] = [
  ['novelty', 'Novelty'], ['grounding', 'Grounding'], ['falsifiability', 'Falsifiability'],
  ['costEfficiency', 'Cost-efficiency'], ['relevance', 'Relevance'],
];

function renderEvaluation(ev: Evaluation): string {
  const parts = AXES.map(([k, name]) => `#### ${name} ${label(ev[k] as number)}\n\n${ev.reasons?.[name] ?? '—'}`);
  return `### Evaluation\n\n${parts.join('\n\n')}`;
}

export function compileProblemRecovery(frame: ProblemFrame, ev: Evaluation, prevId: string, trace: TraceSynopsis[], discovery: DiscoveryEntry[]): CompiledNode {
  const id = slugId(frame.title);
  const markdown = [
    '---', `id: ${id}`, 'stage: problem_recovery', 'kernel: prime',
    `temporal: ${frame.temporal ? 'true' : 'false'}`, 'next: doppl',
    `scores: { judge: ${ev.judge}, human: null, n: 0 }`, 'doppelgangers: 0', '---', '',
    `# ${frame.title}`, '', `prev_id: [[${prevId}]]`, '',
    renderTrace(trace), '',
    renderDiscovery(discovery), '',
    '## Growth — Problem recovery', '',
    '### Surface complaint', '', frame.surfaceComplaint || '—', '',
    '### Deleted assumption', '', frame.deletedAssumption || '—', '',
    '### Hidden variable', '', frame.hiddenVariable || '—', '',
    '### Actual problem', '', frame.actualProblem || '—', '',
    '### Candidate response', '', frame.candidateResponse || '—', '',
    '### Skin in the Game', '', lst(frame.skinInTheGame || []), '',
    renderEvaluation(ev), '',
    '## Path', '', 'next: doppl',
  ].join('\n');
  return { id, stage: 'problem_recovery', markdown };
}

export function compileDoppl(doppl: Doppl, ev: Evaluation, prevId: string, trace: TraceSynopsis[], discovery: DiscoveryEntry[]): CompiledNode {
  const id = slugId(doppl.title);
  const markdown = [
    '---', `id: ${id}`, 'stage: doppl', 'kernel: prime',
    `temporal: ${doppl.temporal ? 'true' : 'false'}`, 'next: null',
    `scores: { judge: ${ev.judge}, human: null, n: 0 }`, 'doppelgangers: 0', '---', '',
    `# ${doppl.title}`, '', `prev_id: [[${prevId}]]`, '',
    renderTrace(trace), '',
    renderDiscovery(discovery), '',
    '## Growth — Doppl', '',
    '### Claim', '', doppl.claim || '—', '',
    '### Implications', '', lst(doppl.implications || []), '',
    '### Opportunities', '', lst(doppl.opportunities || []), '',
    renderEvaluation(ev), '',
    '## Path', '', 'null',
  ].join('\n');
  return { id, stage: 'doppl', markdown };
}
