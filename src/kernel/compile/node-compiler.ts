import type { JudgeAxis, JudgeAxisRating, KernelRun } from '../boundary.ts';
import { slugId } from './slug.ts';

export type ProposalNodeStage = 'case_study' | 'problem_recovery' | 'doppl';

export type ProposalNodeArtifact = {
  stage: ProposalNodeStage;
  id: string;
  path: string;
  markdown: string;
};

export type ProposalNodeCompileOptions = {
  kernel?: string;
  idFactory?: () => string;
};

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlArray(values: string[]): string {
  return `[${values.map(yamlString).join(', ')}]`;
}

function clampRating(value: number): number {
  return Math.max(-5, Math.min(5, Number(value.toFixed(1))));
}

function selectedParentRatings(run: KernelRun): number[] {
  if (run.selectedParents.length !== 2) return [];
  return run.selectedParents
    .map((parent) => run.fitnessRecords.find((record) => record.candidateId === parent.id))
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
    .map((record) => record.selection?.proposalRating.judge ?? clampRating(record.total / 10 - 5));
}

function selectedParentRating(run: KernelRun): number {
  const ratings = selectedParentRatings(run);
  if (!ratings.length) return 0;
  return clampRating(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
}

function synopsis(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

// The case node's name is the headline, not the file's framing prefix. Strip a leading
// "Problem Statement:" so the name and its derived slug read as the idea, not the document.
export function cleanTitle(title: string): string {
  return title.replace(/^\s*problem\s*statement\s*:?\s*/i, '').trim() || title.trim();
}

// The case body already carries its own leading heading; the node renders the headline itself,
// so drop the duplicate from the embedded Context.
function stripLeadingHeading(markdown: string): string {
  return markdown.replace(/^\s*#[^\n]*\n+/, '').trim();
}

function knowledgeDiscovery(run: KernelRun): string {
  if (!run.knowledgePacket.items.length) return 'No stock-backed discoveries were injected.';
  return run.knowledgePacket.items
    .map((item) => {
      if (item.trustTier === 'agarden-stock') {
        const field = item.citation.replace(/.*\//, '').replace(/\.md$/, '');
        // recordId is the ^anchor when the stock file has one; fallback is "fieldId:N" (colon = no anchor)
        const hasAnchor = !item.recordId.includes(':');
        const link = hasAnchor ? `[[${field}#^${item.recordId}]]` : `[[${field}]]`;
        return `- ${link} — ${item.citeHandle}`;
      }
      // web-firecrawl: link to the stock field that will be admitted after this run.
      const fieldId = slugId(`${run.caseStudy.title} discoveries`, `stock\n${run.caseStudy.id}`);
      const anchor = item.citeHandle.replace(/[^A-Za-z0-9_-]/g, '-');
      return `- [[${fieldId}#^${anchor}]] — ${item.citeHandle} · ${item.citation}`;
    })
    .join('\n');
}

function signed(score: number): string {
  return `${score >= 0 ? '+' : ''}${score}`;
}

// When the held-out judge ran, each axis carries its own score + reasoning. Otherwise every
// axis falls back to the projected rating and the node's prose reason.
function evaluationSection(input: {
  judgeRating: number;
  scoreSource: string;
  temporal: boolean;
  axes?: JudgeAxisRating[];
  noveltyReason: string;
  groundingReason: string;
  falsifiabilityReason: string;
  costReason: string;
  relevanceReason: string;
}): string {
  const byAxis = new Map((input.axes ?? []).map((entry) => [entry.axis, entry]));
  const axis = (name: JudgeAxis, fallbackReason: string): { score: number; reason: string } => {
    const found = byAxis.get(name);
    return found
      ? { score: found.score, reason: found.reasoning }
      : { score: input.judgeRating, reason: fallbackReason };
  };
  const novelty = axis('Novelty', input.noveltyReason);
  const grounding = axis('Grounding', input.groundingReason);
  const falsifiability = axis('Falsifiability', input.falsifiabilityReason);
  const cost = axis('Cost-efficiency', input.costReason);
  const relevance = axis('Relevance', input.relevanceReason);
  return `### Evaluation

#### Novelty ${signed(novelty.score)}

${novelty.reason}

#### Grounding ${signed(grounding.score)}

${grounding.reason}

#### Falsifiability ${signed(falsifiability.score)}

${falsifiability.reason}

#### Cost-efficiency ${signed(cost.score)}

${cost.reason}

#### Relevance ${signed(relevance.score)}

${relevance.reason}

#### Temporal ${input.temporal ? 'true' : 'false'}

Temporal is currently projected from the run context until the held-out proposal judge owns this field.

#### Score source

${input.scoreSource}`;
}

type YamlValue = string | number | boolean | null | string[] | { raw: string };

function rawYaml(value: string): { raw: string } {
  return { raw: value };
}

function frontmatter(fields: Array<[string, YamlValue]>): string {
  const lines = fields.map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: ${yamlArray(value)}`;
    if (typeof value === 'object' && value !== null) return `${key}: ${value.raw}`;
    if (typeof value === 'string') return `${key}: ${yamlString(value)}`;
    return `${key}: ${value}`;
  });
  return `---\n${lines.join('\n')}\n---`;
}

function scoreInline(judgeRating: number): string {
  return `{ judge: ${judgeRating}, human: null, n: 0 }`;
}

function caseStudyNode(run: KernelRun, id: string): ProposalNodeArtifact {
  const name = cleanTitle(run.caseStudy.title);
  const caseSynopsis = synopsis(run.caseStudy.statedProblem || run.caseStudy.markdown);
  const markdown = `${frontmatter([
    ['id', id],
    ['stage', 'case_study'],
    ['name', name],
    ['next', 'problem_recovery'],
  ])}

# ${name}

prev_id: null

## Context

${stripLeadingHeading(run.caseStudy.markdown)}

## Synopsis

${caseSynopsis}
`;
  return { stage: 'case_study', id, path: 'proposal-nodes/case-study.md', markdown };
}

function problemRecoveryNode(
  run: KernelRun,
  ids: { self: string; root: string; prev: string[] },
  options: Required<Pick<ProposalNodeCompileOptions, 'kernel'>>,
): ProposalNodeArtifact | undefined {
  // The problem_recovery node is the projection of the winning bred problem-frame — recovered
  // problem, hidden constraint, and falsifier map from the survivor candidate's fields.
  const child = run.fusion?.child;
  if (!child) return undefined;
  const judgeRating = run.judge?.judge ?? selectedParentRating(run);
  const judgeTemporal = run.judge?.temporal ?? false;
  const scoreSource = run.judge
    ? 'Held-out judge: rated the compiled survivor on five axes, independent of the in-run critics.'
    : 'Projected from internal selection fitness until the held-out judge runs.';
  const caseSynopsis = synopsis(run.caseStudy.statedProblem || run.caseStudy.markdown);
  const markdown = `${frontmatter([
    ['id', ids.self],
    ['stage', 'problem_recovery'],
    ['kernel', options.kernel],
    ['temporal', judgeTemporal],
    ['mutagen_lineage', child.mutagenLineage ?? []],
    ['next', 'doppl'],
    ['scores', rawYaml(scoreInline(judgeRating))],
    ['doppelgangers', 0],
  ])}

# ${child.title}

prev_id: [[${ids.root}]]

## Trace

### Case study · synopsis

${caseSynopsis}

## Discovery

${knowledgeDiscovery(run)}

## Growth — Problem recovery

surface complaint -> deleted assumption -> hidden variable -> actual problem -> candidate response

### Recovered problem

${child.summary}

### Hidden constraint

${child.mechanism}

### Falsifier

${child.claimedDelta}

### Skin in the Game

- Talk to the people who would pay, operate, regulate, or be exposed to this recovered problem.
- Run the cheapest real-world check that could falsify the hidden constraint before investing in solution design.
- Update the node if field contact shows the stated problem is not the real bottleneck.

### Sprouts

- none promoted in this projection

${evaluationSection({
  judgeRating,
  scoreSource,
  temporal: judgeTemporal,
  ...(run.judge ? { axes: run.judge.axes } : {}),
  noveltyReason: 'Problem recovery is scored separately so a good answer to the wrong problem cannot hide.',
  groundingReason: `The recovery cites ${child.citedKnowledge.join(', ') || 'no injected knowledge handles'}.`,
  falsifiabilityReason: child.claimedDelta,
  costReason: 'Validation cost is expressed as Skin in the Game rather than hidden in solution prose.',
  relevanceReason: 'The recovered problem defines what later doppl nodes must matter to.',
})}

## Path

next: doppl
`;
  return {
    stage: 'problem_recovery',
    id: ids.self,
    path: 'proposal-nodes/problem-recovery.md',
    markdown,
  };
}

function dopplNode(
  run: KernelRun,
  ids: { self: string; root: string; prev: string[] },
  options: Required<Pick<ProposalNodeCompileOptions, 'kernel'>>,
): ProposalNodeArtifact | undefined {
  const fusion = run.fusion;
  if (!fusion?.child) return undefined;
  const child = fusion.child;
  const judgeRating = run.judge?.judge ?? selectedParentRating(run);
  const judgeTemporal = run.judge?.temporal ?? false;
  const scoreSource = run.judge
    ? 'Held-out judge: rated the compiled survivor on five axes, independent of the in-run critics.'
    : 'Projected from internal selected-parent fitness until the held-out judge runs.';
  const caseSynopsis = synopsis(run.caseStudy.statedProblem || run.caseStudy.markdown);
  const recoverySynopsis = synopsis(run.parentNode?.synopsis ?? run.caseStudy.statedProblem);
  const parentSummary = fusion.parentCandidateIds.join(' + ');
  const markdown = `${frontmatter([
    ['id', ids.self],
    ['stage', 'doppl'],
    ['kernel', options.kernel],
    ['temporal', judgeTemporal],
    ['mutagen_lineage', child.mutagenLineage ?? []],
    ['next', null],
    ['scores', rawYaml(scoreInline(judgeRating))],
    ['doppelgangers', 0],
  ])}

# ${child.title}

prev_id: [[${ids.prev[0] ?? ids.root}]]

## Trace

### Case study · synopsis

${caseSynopsis}

### Problem recovery · synopsis

${recoverySynopsis}

## Discovery

${knowledgeDiscovery(run)}

## Growth — Doppl

### Claim

${child.summary}

### Implications

- Mechanism: ${child.mechanism}
- Claimed delta: ${child.claimedDelta}
- Parent lineage: ${parentSummary}
- Inherited traits: ${fusion.inheritedTraits.join('; ') || 'none recorded'}
- Mutation notes: ${fusion.mutationNotes.join('; ') || 'none recorded'}

### Opportunities

- Use this doppl as the action surface for the recovered problem.
- Test the claimed delta against the falsifier from the problem-recovery node.
- Promote the doppl only if follow-up evidence shows the mechanism creates a real advantage.

### Sprouts

- none promoted in this projection

${evaluationSection({
  judgeRating,
  scoreSource,
  temporal: judgeTemporal,
  ...(run.judge ? { axes: run.judge.axes } : {}),
  noveltyReason: 'The doppl fuses selected parent mechanisms rather than merely picking a single candidate.',
  groundingReason: `The doppl carries citations ${child.citedKnowledge.join(', ') || 'none'}.`,
  falsifiabilityReason: child.claimedDelta,
  costReason: 'Cost-efficiency is provisional until the proposal rating map is implemented.',
  relevanceReason: 'The doppl is judged against the recovered problem, not only against candidate-local appeal.',
})}

## Path

null
`;
  return { stage: 'doppl', id: ids.self, path: 'proposal-nodes/doppl.md', markdown };
}

// Seed each slug's hash with its stage so the stages can never collide on a shared title
// (a weak model can echo the case title into the recovery title).
function stageSlug(stage: ProposalNodeStage, title: string): string {
  return slugId(title, `${stage}\n${title}`);
}

function caseRootId(run: KernelRun, options: ProposalNodeCompileOptions): string {
  return options.idFactory ? options.idFactory() : stageSlug('case_study', cleanTitle(run.caseStudy.title));
}

// The case_study seed node — the run's root, written once when a chain ingests a fresh seed.
export function compileCaseStudyNode(
  run: KernelRun,
  options: ProposalNodeCompileOptions = {},
): ProposalNodeArtifact {
  return caseStudyNode(run, caseRootId(run, options));
}

// One run, one growth-stage node — the projection of this arrow's winning bred candidate. The
// case_study seed is compiled separately (compileCaseStudyNode).
export function compileNode(
  run: KernelRun,
  options: ProposalNodeCompileOptions = {},
): ProposalNodeArtifact | undefined {
  const kernel = options.kernel || 'prime';
  const rootId = caseRootId(run, options);
  if (run.stage === 'problem_recovery') {
    const self = stageSlug('problem_recovery', run.fusion?.child.title ?? 'problem recovery');
    return problemRecoveryNode(run, { self, root: rootId, prev: [rootId] }, { kernel });
  }
  const self = stageSlug('doppl', run.fusion?.child.title ?? 'doppl');
  const prev = run.parentNode ? [run.parentNode.id] : [rootId];
  return dopplNode(run, { self, root: rootId, prev }, { kernel });
}

// The three spine nodes from a full chain: the case_study seed plus each arrow's growth node.
export function compileChainNodes(
  problemRecovery: KernelRun,
  doppl: KernelRun,
  options: ProposalNodeCompileOptions = {},
): ProposalNodeArtifact[] {
  const nodes = [compileCaseStudyNode(doppl, options)];
  const recovery = compileNode(problemRecovery, options);
  if (recovery) nodes.push(recovery);
  const dopplNodeArtifact = compileNode(doppl, options);
  if (dopplNodeArtifact) nodes.push(dopplNodeArtifact);
  return nodes;
}
