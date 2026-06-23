import type { Agenome, CandidateSolution, FusionResult } from './contracts.ts';

type AgenomeTemplate = Omit<
  Agenome,
  'id' | 'parentAgenomeIds' | 'mutations' | 'energy' | 'candidateIds' | 'generations'
>;

const DEFAULT_TEMPLATE: AgenomeTemplate = {
  label: 'Unclassified Agenome',
  prompt: 'Generate a bounded candidate solution and expose its mechanism clearly.',
  persona: 'General synthesis operator',
  valueWeights: {
    novelty: 0.25,
    grounding: 0.35,
    feasibility: 0.25,
    skepticism: 0.15,
  },
  toolPermissions: ['read_case', 'read_memory_packet'],
  decompositionPolicy: 'Recover the bottleneck, propose one mechanism, then state a falsifier.',
  spawnBudget: {
    maxCandidates: 3,
    maxToolCalls: 0,
  },
};

const BASE_TEMPLATES: Record<string, AgenomeTemplate> = {
  ag_blindside: {
    label: 'Blindside',
    prompt: 'Look for the non-obvious actor, liability shift, or second-order failure mode.',
    persona: 'Adversarial market scout',
    valueWeights: { novelty: 0.35, grounding: 0.25, feasibility: 0.18, skepticism: 0.22 },
    toolPermissions: ['read_case', 'read_memory_packet'],
    decompositionPolicy: 'Invert the stated problem and search for the neglected stakeholder.',
    spawnBudget: { maxCandidates: 3, maxToolCalls: 0 },
  },
  ag_constraint_injection: {
    label: 'Constraint Injection',
    prompt: 'Find the hidden operational, legal, or economic constraint that changes the solution.',
    persona: 'Boundary-condition analyst',
    valueWeights: { novelty: 0.22, grounding: 0.34, feasibility: 0.28, skepticism: 0.16 },
    toolPermissions: ['read_case', 'read_memory_packet'],
    decompositionPolicy: 'Name the binding constraint before proposing any intervention.',
    spawnBudget: { maxCandidates: 3, maxToolCalls: 0 },
  },
  ag_first_principles: {
    label: 'First Principles',
    prompt: 'Reduce the case to primitives, then rebuild the mechanism from those primitives.',
    persona: 'Mechanism physicist',
    valueWeights: { novelty: 0.2, grounding: 0.42, feasibility: 0.28, skepticism: 0.1 },
    toolPermissions: ['read_case', 'read_memory_packet'],
    decompositionPolicy: 'Separate demand, incentives, constraints, and feedback loops.',
    spawnBudget: { maxCandidates: 3, maxToolCalls: 0 },
  },
  ag_skeptic: {
    label: 'Skeptic',
    prompt: 'Attack the leading explanation and produce the strongest falsifiable alternative.',
    persona: 'Failure-mode critic',
    valueWeights: { novelty: 0.2, grounding: 0.25, feasibility: 0.2, skepticism: 0.35 },
    toolPermissions: ['read_case', 'read_memory_packet'],
    decompositionPolicy: 'Start from the most likely way the candidate could be wrong.',
    spawnBudget: { maxCandidates: 3, maxToolCalls: 0 },
  },
  ag_breakout: {
    label: 'Breakout',
    prompt: 'Escape local framing and import a mechanism from a more useful neighboring domain.',
    persona: 'Cross-domain transfer scout',
    valueWeights: { novelty: 0.42, grounding: 0.22, feasibility: 0.2, skepticism: 0.16 },
    toolPermissions: ['read_case', 'read_memory_packet'],
    decompositionPolicy: 'Map the case onto a neighboring system with similar pressure geometry.',
    spawnBudget: { maxCandidates: 3, maxToolCalls: 0 },
  },
  ag_breakthrough: {
    label: 'Breakthrough',
    prompt: 'Synthesize a sharp intervention that changes the payoff landscape.',
    persona: 'High-leverage intervention designer',
    valueWeights: { novelty: 0.32, grounding: 0.25, feasibility: 0.3, skepticism: 0.13 },
    toolPermissions: ['read_case', 'read_memory_packet'],
    decompositionPolicy: 'Prefer a small mechanism with a large behavioral or economic effect.',
    spawnBudget: { maxCandidates: 3, maxToolCalls: 0 },
  },
  ag_polymath: {
    label: 'Polymath',
    prompt: 'Combine evidence from multiple domains into one coherent candidate.',
    persona: 'Integrator',
    valueWeights: { novelty: 0.28, grounding: 0.32, feasibility: 0.25, skepticism: 0.15 },
    toolPermissions: ['read_case', 'read_memory_packet'],
    decompositionPolicy: 'Fuse analogies only after naming their shared causal structure.',
    spawnBudget: { maxCandidates: 3, maxToolCalls: 0 },
  },
};

function titleize(id: string): string {
  return id
    .replace(/^ag_/, '')
    .replace(/^fused_/, '')
    .replace(/_g\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function baseIdFor(id: string): string {
  return id.replace(/_(mutation|critic_probe|signal_probe)_g\d+$/, '');
}

function templateFor(id: string): AgenomeTemplate {
  const base = baseIdFor(id);
  const template = BASE_TEMPLATES[base] || DEFAULT_TEMPLATE;
  return {
    ...template,
    label: template === DEFAULT_TEMPLATE ? titleize(id) : template.label,
    valueWeights: { ...template.valueWeights },
    toolPermissions: [...template.toolPermissions],
    spawnBudget: { ...template.spawnBudget },
  };
}

function mutationNotes(id: string): string[] {
  const notes: string[] = [];
  const mutation = id.match(/_(mutation|critic_probe|signal_probe)_g(\d+)$/);
  if (!mutation) return notes;
  const kind = mutation[1]!.replace('_', ' ');
  notes.push(`${kind} derived for generation ${mutation[2]}`);
  return notes;
}

function byAgenome(candidates: CandidateSolution[]): Map<string, CandidateSolution[]> {
  const grouped = new Map<string, CandidateSolution[]>();
  for (const candidate of candidates) {
    grouped.set(candidate.agenomeId, [...(grouped.get(candidate.agenomeId) || []), candidate]);
  }
  return grouped;
}

function fusedParents(candidates: CandidateSolution[], fusion?: FusionResult): Map<string, string[]> {
  const parents = new Map<string, string[]>();
  if (!fusion) return parents;
  const byCandidateId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  parents.set(
    fusion.child.agenomeId,
    fusion.parentCandidateIds
      .map((parentId) => byCandidateId.get(parentId)?.agenomeId)
      .filter((id): id is string => Boolean(id)),
  );
  return parents;
}

export function materializeAgenomes(input: {
  candidates: CandidateSolution[];
  fusion?: FusionResult;
}): Agenome[] {
  const candidates = input.fusion ? [...input.candidates, input.fusion.child] : input.candidates;
  const grouped = byAgenome(candidates);
  const parentMap = fusedParents(input.candidates, input.fusion);
  const agenomes: Agenome[] = [];

  for (const [id, ownedCandidates] of grouped) {
    const template = templateFor(id);
    const spent = ownedCandidates.length;
    const allocated = Math.max(template.spawnBudget.maxCandidates, spent);
    agenomes.push({
      id,
      ...template,
      parentAgenomeIds: parentMap.get(id) || (id === baseIdFor(id) ? [] : [baseIdFor(id)]),
      mutations: mutationNotes(id),
      energy: {
        allocated,
        spent,
        remaining: Math.max(0, allocated - spent),
      },
      candidateIds: ownedCandidates.map((candidate) => candidate.id),
      generations: [...new Set(ownedCandidates.map((candidate) => candidate.generation))].sort(
        (a, b) => a - b,
      ),
    });
  }

  return agenomes.sort((left, right) => left.id.localeCompare(right.id));
}
