import type {
  Agenome,
  AgenomeEnergyLedgerEntry,
  CandidateSolution,
  FusionResult,
} from '../boundary.ts';

type AgenomeTemplate = Omit<
  Agenome,
  'id' | 'parentAgenomeIds' | 'mutations' | 'energy' | 'candidateIds' | 'generations'
>;

type Parentage = {
  parentIds: string[];
  weights: number[];
};

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

function roundWeight(value: number): number {
  return Number(value.toFixed(3));
}

function weightedAverage(values: Array<[number, number]>): number {
  return roundWeight(values.reduce((sum, [value, weight]) => sum + value * weight, 0));
}

function mergePermissions(templates: AgenomeTemplate[]): string[] {
  return [...new Set(templates.flatMap((template) => template.toolPermissions))].sort();
}

function templateFor(
  id: string,
  parentageByAgenome: Map<string, Parentage> = new Map(),
  cache = new Map<string, AgenomeTemplate>(),
): AgenomeTemplate {
  const cached = cache.get(id);
  if (cached) return cached;

  const parentage = parentageByAgenome.get(id);
  if (parentage && parentage.parentIds.length > 0) {
    const parentTemplates = parentage.parentIds.map((parentId) =>
      templateFor(parentId, parentageByAgenome, cache),
    );
    const weightedParents = parentTemplates.map((template, index) => ({
      template,
      weight: parentage.weights[index] ?? 1 / parentTemplates.length,
    }));
    const label = `Fusion: ${parentTemplates.map((template) => template.label).join(' / ')}`;
    const template: AgenomeTemplate = {
      label,
      prompt: `Fuse the strongest mechanism from ${parentTemplates[0]?.label ?? 'the lead parent'} with the constraint pressure from ${parentTemplates[1]?.label || parentTemplates[0]?.label || 'the lead parent'}.`,
      persona: parentTemplates.map((parentTemplate) => parentTemplate.persona).join(' + '),
      valueWeights: {
        novelty: weightedAverage(
          weightedParents.map(({ template: parentTemplate, weight }) => [
            parentTemplate.valueWeights.novelty,
            weight,
          ]),
        ),
        grounding: weightedAverage(
          weightedParents.map(({ template: parentTemplate, weight }) => [
            parentTemplate.valueWeights.grounding,
            weight,
          ]),
        ),
        feasibility: weightedAverage(
          weightedParents.map(({ template: parentTemplate, weight }) => [
            parentTemplate.valueWeights.feasibility,
            weight,
          ]),
        ),
        skepticism: weightedAverage(
          weightedParents.map(({ template: parentTemplate, weight }) => [
            parentTemplate.valueWeights.skepticism,
            weight,
          ]),
        ),
      },
      toolPermissions: mergePermissions(parentTemplates),
      decompositionPolicy: `Preserve parent mechanisms separately, test compatibility, then synthesize only the traits that survive critic pressure.`,
      spawnBudget: {
        maxCandidates: Math.max(...parentTemplates.map((template) => template.spawnBudget.maxCandidates)),
        maxToolCalls: Math.max(...parentTemplates.map((template) => template.spawnBudget.maxToolCalls)),
      },
    };
    cache.set(id, template);
    return template;
  }

  const base = baseIdFor(id);
  const template = BASE_TEMPLATES[base] || DEFAULT_TEMPLATE;
  const resolved = {
    ...template,
    label: template === DEFAULT_TEMPLATE ? titleize(id) : template.label,
    valueWeights: { ...template.valueWeights },
    toolPermissions: [...template.toolPermissions],
    spawnBudget: { ...template.spawnBudget },
  };
  cache.set(id, resolved);
  return resolved;
}

function mutationNotes(id: string, parentage?: Parentage): string[] {
  const notes: string[] = [];
  if (parentage) {
    notes.push(
      `fused from ${parentage.parentIds.join(' + ')} with weights ${parentage.weights
        .map((weight) => roundWeight(weight))
        .join(' / ')}`,
    );
  }
  const mutation = id.match(/_(mutation|critic_probe|signal_probe)_g(\d+)$/);
  if (!mutation) return notes;
  const kindToken = mutation[1];
  if (!kindToken) return notes;
  const kind = kindToken.replace('_', ' ');
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

function fusedParents(candidates: CandidateSolution[], fusions: FusionResult[]): Map<string, Parentage> {
  const parents = new Map<string, Parentage>();
  const byCandidateId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const fusion of fusions) {
    const parentIds = fusion.parentCandidateIds
      .map((parentId) => byCandidateId.get(parentId)?.agenomeId)
      .filter((id): id is string => Boolean(id));
    parents.set(fusion.child.agenomeId, {
      parentIds,
      weights: [fusion.inheritanceWeights.parentA, fusion.inheritanceWeights.parentB],
    });
    byCandidateId.set(fusion.child.id, fusion.child);
  }
  return parents;
}

function energyFor(
  agenomeId: string,
  fallbackSpent: number,
  template: AgenomeTemplate,
  energyLedger: AgenomeEnergyLedgerEntry[] = [],
): Agenome['energy'] {
  const entries = energyLedger.filter((entry) => entry.agenomeId === agenomeId);
  if (entries.length === 0) {
    const allocated = Math.max(template.spawnBudget.maxCandidates, fallbackSpent);
    return {
      allocated,
      spent: fallbackSpent,
      remaining: Math.max(0, allocated - fallbackSpent),
    };
  }
  const allocated = entries
    .filter((entry) => entry.kind === 'allocation')
    .reduce((sum, entry) => sum + entry.units, 0);
  const spent = entries
    .filter((entry) => entry.kind === 'spend')
    .reduce((sum, entry) => sum + entry.units, 0);
  return {
    allocated,
    spent,
    remaining: Math.max(0, allocated - spent),
  };
}

export function initialAgenomePool(ids = Object.keys(BASE_TEMPLATES)): Agenome[] {
  return ids.sort().map((id) => {
    const template = templateFor(id);
    return {
      id,
      ...template,
      parentAgenomeIds: [],
      mutations: [],
      energy: {
        allocated: 0,
        spent: 0,
        remaining: 0,
      },
      candidateIds: [],
      generations: [],
    };
  });
}

export function materializeAgenomes(input: {
  candidates: CandidateSolution[];
  fusion?: FusionResult;
  fusions?: FusionResult[];
  energyLedger?: AgenomeEnergyLedgerEntry[];
}): Agenome[] {
  const fusions = input.fusions ?? (input.fusion ? [input.fusion] : []);
  const candidates = [...input.candidates, ...fusions.map((fusion) => fusion.child)];
  const grouped = byAgenome(candidates);
  const parentMap = fusedParents(input.candidates, fusions);
  const templateCache = new Map<string, AgenomeTemplate>();
  const agenomes: Agenome[] = [];

  for (const [id, ownedCandidates] of grouped) {
    const template = templateFor(id, parentMap, templateCache);
    const parentage = parentMap.get(id);
    const spent = ownedCandidates.length;
    agenomes.push({
      id,
      ...template,
      parentAgenomeIds: parentage?.parentIds || (id === baseIdFor(id) ? [] : [baseIdFor(id)]),
      mutations: mutationNotes(id, parentage),
      energy: energyFor(id, spent, template, input.energyLedger),
      candidateIds: ownedCandidates.map((candidate) => candidate.id),
      generations: [...new Set(ownedCandidates.map((candidate) => candidate.generation))].sort(
        (a, b) => a - b,
      ),
    });
  }

  return agenomes.sort((left, right) => left.id.localeCompare(right.id));
}
